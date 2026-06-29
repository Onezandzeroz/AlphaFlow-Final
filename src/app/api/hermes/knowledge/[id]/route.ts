import { NextResponse } from 'next/server';
import { withGuard, type RouteSegmentContext } from '@/lib/route-guard';
import { routeConfig } from '@/lib/route-config';
import { logger } from '@/lib/logger';

/**
 * Hermes RAG Knowledge Base — single document operations.
 *
 * GET    /api/hermes/knowledge/[id]  — get full document (incl. content)
 * PUT    /api/hermes/knowledge/[id]  — update + re-embed
 * DELETE /api/hermes/knowledge/[id]  — delete document + chunks
 *
 * SuperDev-only. Proxies to the knowledge-service mini-service (port 3006).
 */

const KNOWLEDGE_SERVICE_PORT = process.env.KNOWLEDGE_SERVICE_PORT || '3006';
const HERMES_ADMIN_KEY = process.env.HERMES_ADMIN_KEY || process.env.OPENROUTER_API_KEY || '';

interface UpdateDocBody {
  title?: string;
  content?: string;
  category?: string;
  tenantId?: string | null;
  description?: string;
}

// ─── GET: single document ───────────────────────────────────────

export const GET = withGuard(
  routeConfig['/api/hermes/knowledge/[id]'].GET!,
  async (request, ctx, context: RouteSegmentContext) => {
    try {
      const { id } = await context.params;
      // Next.js params are typed as string | string[]. For a single-segment
      // [id] route, Next.js always returns a string. Coerce to satisfy TS.
      const docId = String(id);
      if (!HERMES_ADMIN_KEY) {
        return NextResponse.json({ error: 'HERMES_ADMIN_KEY not configured' }, { status: 503 });
      }

      const res = await fetch(
        `/api/documents/${encodeURIComponent(docId)}?XTransformPort=${KNOWLEDGE_SERVICE_PORT}`,
        {
          headers: { 'Authorization': `Bearer ${HERMES_ADMIN_KEY}` },
          signal: AbortSignal.timeout(5000),
        },
      );

      if (!res.ok) {
        return NextResponse.json(
          { error: res.status === 404 ? 'Document not found' : `Service error: ${res.status}` },
          { status: res.status },
        );
      }

      const data = await res.json();
      return NextResponse.json(data);
    } catch (error) {
      logger.error('[HERMES KNOWLEDGE] Failed to get document:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
);

// ─── PUT: update + re-embed ─────────────────────────────────────

export const PUT = withGuard(
  routeConfig['/api/hermes/knowledge/[id]'].PUT!,
  async (request, ctx, context: RouteSegmentContext) => {
    try {
      const { id } = await context.params;
      // Next.js params are typed as string | string[]. For a single-segment
      // [id] route, Next.js always returns a string. Coerce to satisfy TS.
      const docId = String(id);
      if (!HERMES_ADMIN_KEY) {
        return NextResponse.json({ error: 'HERMES_ADMIN_KEY not configured' }, { status: 503 });
      }

      const body = (await request.json()) as UpdateDocBody;

      // Clamp content size if provided
      if (body.content !== undefined) {
        const MAX_CONTENT_SIZE = 500 * 1024;
        if (body.content.length > MAX_CONTENT_SIZE) {
          return NextResponse.json(
            { error: `Content too large (max ${MAX_CONTENT_SIZE} chars).` },
            { status: 413 },
          );
        }
      }

      const res = await fetch(
        `/api/documents/${encodeURIComponent(docId)}?XTransformPort=${KNOWLEDGE_SERVICE_PORT}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${HERMES_ADMIN_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(60_000),
        },
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: res.statusText }));
        return NextResponse.json(
          { error: errData.error || `Service error: ${res.status}` },
          { status: res.status },
        );
      }

      const data = await res.json();
      logger.info('[HERMES KNOWLEDGE] Document updated', { id: docId, performedBy: ctx.id });
      return NextResponse.json(data);
    } catch (error) {
      logger.error('[HERMES KNOWLEDGE] Failed to update document:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
);

// ─── DELETE: remove document ────────────────────────────────────

export const DELETE = withGuard(
  routeConfig['/api/hermes/knowledge/[id]'].DELETE!,
  async (request, ctx, context: RouteSegmentContext) => {
    try {
      const { id } = await context.params;
      // Next.js params are typed as string | string[]. For a single-segment
      // [id] route, Next.js always returns a string. Coerce to satisfy TS.
      const docId = String(id);
      if (!HERMES_ADMIN_KEY) {
        return NextResponse.json({ error: 'HERMES_ADMIN_KEY not configured' }, { status: 503 });
      }

      const res = await fetch(
        `/api/documents/${encodeURIComponent(docId)}?XTransformPort=${KNOWLEDGE_SERVICE_PORT}`,
        {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${HERMES_ADMIN_KEY}` },
          signal: AbortSignal.timeout(5000),
        },
      );

      if (!res.ok) {
        return NextResponse.json(
          { error: `Service error: ${res.status}` },
          { status: res.status },
        );
      }

      const data = await res.json();
      logger.info('[HERMES KNOWLEDGE] Document deleted', { id: docId, performedBy: ctx.id });
      return NextResponse.json(data);
    } catch (error) {
      logger.error('[HERMES KNOWLEDGE] Failed to delete document:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
);
