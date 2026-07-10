// ============================================================
// session-verifier.ts — Server-side session verification for hermes-agent
// ============================================================
//
// AlphaFlow uses a CUSTOM database-backed session system (NOT NextAuth).
// The `session` cookie holds an opaque 64-char random token
// (crypto.randomBytes(32).toString('hex')). Verification = Prisma lookup
// against the Session table + expiry + deactivated check. No JWT, no crypto.
//
// Caddy forwards the Cookie header through to this service, so
// `socket.handshake.headers.cookie` contains `session=<token>` on every
// Socket.IO polling request and on the WebSocket upgrade handshake.
//
// This mirrors getAuthContext() from src/lib/session.ts (the Next.js
// authoritative implementation) — minus the Next.js `cookies()` /
// TokenPay bits that don't apply to a standalone Bun process.
//
// SECURITY: This replaces the client-supplied tenantId/userId that the
// U-5 refactor tried (and failed) to remove. With this in place, a
// malicious client cannot impersonate another tenant by spoofing the
// join payload — the socket is disconnected unless the cookie maps to a
// valid Session row whose activeCompanyId becomes the trusted tenantId.
// ============================================================

import { getPrismaClient } from './database-tenant-provider'

/** The verified identity derived from a valid session cookie. */
export interface VerifiedSession {
  userId: string
  tenantId: string | null          // activeCompanyId — null = no active company
  userName: string                 // businessName ?? email
  userEmail: string
  isSuperDev: boolean
  oversightCompanyId: string | null
  activeProjectId: string | null
}

/** Cookie name — must match SESSION_COOKIE_NAME in src/lib/session.ts */
const SESSION_COOKIE_NAME = 'session'

/** Session sliding-expiry window (must match the web app: 7 days). */
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Parse the `session` cookie value out of a raw Cookie header.
 * Returns null if the cookie is absent.
 */
function extractSessionToken(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null
  // Cookie headers look like: "session=abc123; other=xyz; ..."
  // Match `session=` followed by anything up to the next `;` or end of string.
  const match = new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`).exec(cookieHeader)
  return match ? match[1] : null
}

/**
 * Verify a session cookie and return the trusted identity, or null if the
 * session is invalid / expired / deactivated.
 *
 * @param cookieHeader The raw `Cookie` HTTP header (from socket.handshake.headers.cookie)
 * @returns VerifiedSession if valid, null otherwise
 */
export async function verifySession(cookieHeader: string | undefined): Promise<VerifiedSession | null> {
  const token = extractSessionToken(cookieHeader)
  if (!token) return null

  const db = getPrismaClient()
  const session = await db.session.findUnique({
    where: { token },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          businessName: true,
          isSuperDev: true,
          deactivatedAt: true,
        },
      },
    },
  })

  // No session row → invalid token.
  if (!session) return null

  // Account deactivated → refuse.
  if (session.user.deactivatedAt) return null

  // Expired → refuse.
  if (session.expiresAt < new Date()) return null

  // Sliding expiry: bump expiresAt to now + 7d, mirroring the web app's
  // getAuthContext() behaviour. Fire-and-forget so the socket handshake
  // isn't delayed by the write.
  db.session.update({
    where: { id: session.id },
    data: { expiresAt: new Date(Date.now() + SESSION_MAX_AGE_MS) },
  }).catch(() => { /* non-critical */ })

  const userName = session.user.businessName || session.user.email

  return {
    userId: session.user.id,
    tenantId: session.activeCompanyId,
    userName,
    userEmail: session.user.email,
    isSuperDev: session.user.isSuperDev,
    oversightCompanyId: session.oversightCompanyId,
    activeProjectId: session.activeProjectId,
  }
}
