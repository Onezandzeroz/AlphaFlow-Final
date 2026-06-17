/**
 * Notification WebSocket Service (Socket.IO on Bun)
 *
 * Provides real-time broadcast of:
 *   1. Notification read-state changes (per-user)        — existing
 *   2. Data-changed invalidation events (per-company)    — NEW
 *
 * Architecture:
 *   - Clients connect via Socket.IO through the Caddy gateway (XTransformPort=3001)
 *   - Each connection is mapped to a userId (from auth handshake)
 *   - Connections that also provide a companyId in auth join a
 *     `company:<companyId>` room — used for data-changed broadcasts
 *   - The Next.js APIs call POST /broadcast to push events:
 *       • { type: 'READ_STATE_CHANGED', userId, readIds }
 *           → emits 'notification-update' to all sockets for that user
 *       • { type: 'DATA_CHANGED', companyId, scope, action, entity? }
 *           → emits 'data-changed' to the company:<companyId> room
 *   - Backward compat: a body with userId + readIds but no type is treated
 *     as READ_STATE_CHANGED (so the existing mark-read API keeps working).
 *
 * Port: 3001 (configurable via PORT env var)
 */

import { createServer } from 'http';
import { Server, type Socket } from 'socket.io';

const PORT = parseInt(process.env.PORT || '3001', 10);

// ─── HTTP + Socket.IO Server ──────────────────────────────────────────

const httpServer = createServer((req, res) => {
  // Health check
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'notification-ws', port: PORT, connections: userSockets.size }));
    return;
  }

  // Broadcast endpoint — called by Next.js APIs (localhost only)
  if (req.url === '/broadcast' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);

        // ─── Route by event type ───────────────────────────────────
        if (data.type === 'DATA_CHANGED') {
          handleDataChangedBroadcast(data, res);
          return;
        }

        // Default / explicit READ_STATE_CHANGED — backward compatible:
        // a body with userId + readIds and no type is treated as read-state.
        handleReadStateBroadcast(data, res);
        return;
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      }
    });
    return;
  }

  // Stats endpoint
  if (req.url === '/stats' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      totalConnections: io.engine.clientsCount,
      trackedUsers: userSockets.size,
      totalSockets: [...userSockets.values()].reduce((sum, set) => sum + set.size, 0),
      companyRooms: io.sockets.adapter.rooms.size,
    }));
    return;
  }

  res.writeHead(404);
  res.end('not found');
});

const io = new Server(httpServer, {
  // Use default Socket.IO path '/socket.io/' so the HTTP server's own
  // endpoints (/health, /broadcast, /stats) remain accessible.
  cors: {
    origin: true,
    methods: ['GET', 'POST'],
  },
  // Cleanup stalled connections faster
  pingInterval: 10000,
  pingTimeout: 5000,
});

// ─── Connection Registry ──────────────────────────────────────────────
// Map: userId -> Set<socketId>  (for per-user notification broadcasts)

const userSockets = new Map<string, Set<string>>();

function countUserSockets(userId: string): number {
  return userSockets.get(userId)?.size ?? 0;
}

function broadcastToUser(userId: string, data: unknown): void {
  const socketIds = userSockets.get(userId);
  if (!socketIds || socketIds.size === 0) return;

  let sent = 0;
  for (const socketId of socketIds) {
    const socket: Socket | undefined = io.sockets.sockets.get(socketId);
    if (socket?.connected) {
      socket.emit('notification-update', data);
      sent++;
    }
  }

  if (sent < socketIds.size) {
    // Clean up disconnected sockets
    for (const socketId of socketIds) {
      const socket = io.sockets.sockets.get(socketId);
      if (!socket?.connected) {
        socketIds.delete(socketId);
      }
    }
    if (socketIds.size === 0) {
      userSockets.delete(userId);
    }
  }

  console.log(
    `[NotificationWS] Broadcast to user ${userId}: ${sent} socket(s), readIds count: ${Array.isArray((data as { readIds?: unknown }).readIds) ? (data as { readIds: unknown[] }).readIds.length : '?'}`
  );
}

// ─── Company-room broadcast (data-changed invalidation) ──────────────

function companyRoomName(companyId: string): string {
  return `company:${companyId}`;
}

function broadcastToCompany(companyId: string, data: unknown): number {
  const room = companyRoomName(companyId);
  // io.in(room) targets all sockets in the room
  io.in(room).emit('data-changed', data);
  // Return the count of sockets currently in the room (socket.io v4 adapter API)
  return io.sockets.adapter.rooms.get(room)?.size ?? 0;
}

// ─── Broadcast request handlers ───────────────────────────────────────

function handleReadStateBroadcast(data: { userId?: string; readIds?: unknown; type?: string }, res: any): void {
  const { userId, readIds } = data;

  if (!userId || !Array.isArray(readIds)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing userId or readIds' }));
    return;
  }

  broadcastToUser(userId, {
    type: 'READ_STATE_CHANGED',
    readIds,
  });

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, sentTo: countUserSockets(userId) }));
}

function handleDataChangedBroadcast(
  data: { companyId?: string; scope?: string; action?: string; entity?: string },
  res: any
): void {
  const { companyId, scope, action, entity } = data;

  if (!companyId || typeof companyId !== 'string') {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing companyId for DATA_CHANGED' }));
    return;
  }

  if (!scope || typeof scope !== 'string') {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing scope for DATA_CHANGED' }));
    return;
  }

  const payload = {
    type: 'DATA_CHANGED',
    scope,
    action: action || 'update',
    entity: entity || null,
    companyId,
    timestamp: Date.now(),
  };

  const recipients = broadcastToCompany(companyId, payload);

  console.log(
    `[NotificationWS] DATA_CHANGED → company:${companyId} scope=${scope} action=${action || 'update'} (${recipients} socket(s))`
  );

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, scope, recipients }));
}

// ─── Socket.IO Connection Handling ───────────────────────────────────

io.on('connection', (socket) => {
  const userId = socket.handshake.auth.userId as string | undefined;
  const companyId = socket.handshake.auth.companyId as string | undefined;

  if (!userId) {
    console.log('[NotificationWS] Rejected connection: no userId in auth');
    socket.disconnect();
    return;
  }

  // Register this socket under the user
  if (!userSockets.has(userId)) {
    userSockets.set(userId, new Set());
  }
  userSockets.get(userId)!.add(socket.id);

  // Join the company room if a companyId was supplied (for data-changed events)
  if (companyId) {
    socket.join(companyRoomName(companyId));
  }

  console.log(
    `[NotificationWS] User ${userId} connected (socket ${socket.id}, company: ${companyId || 'none'}, total for user: ${countUserSockets(userId)}, total connections: ${io.engine.clientsCount})`
  );

  // Send current connection count as confirmation
  socket.emit('connected', { userId, socketCount: countUserSockets(userId) });

  socket.on('disconnect', (reason) => {
    userSockets.get(userId)?.delete(socket.id);
    if (userSockets.get(userId)?.size === 0) {
      userSockets.delete(userId);
    }
    console.log(`[NotificationWS] User ${userId} disconnected (${reason}), remaining: ${countUserSockets(userId)}, total: ${io.engine.clientsCount}`);
  });
});

// ─── Start Server ────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`[NotificationWS] Socket.IO server running on port ${PORT}`);
  console.log(`[NotificationWS] Endpoints: /health, /broadcast (POST), /stats`);
  console.log(`[NotificationWS] Events: notification-update (per-user), data-changed (per-company)`);
});

// ─── Graceful Shutdown ───────────────────────────────────────────────

function shutdown() {
  console.log('[NotificationWS] Shutting down...');
  io.close();
  httpServer.close(() => {
    console.log('[NotificationWS] Server closed');
    process.exit(0);
  });
  // Force exit after 5s if graceful shutdown hangs
  setTimeout(() => process.exit(0), 5000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
