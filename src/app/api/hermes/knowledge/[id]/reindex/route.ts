import { NextResponse } from 'next/server';
import { withGuard, type RouteSegmentContext } from '@/lib/route-guard';
import { routeConfig } from '@/lib/route-config';
import { logger } from '@/lib/logger';

/**
 * POST /api/hermes/knowledge/[id]/reindex
 *
 * Forces a re-embed of an existing document (e.g. after the embedding
 * model is changed, or to fix a corrupted index).
 *
 * SuperDev-only. Proxies to knowledge-service.
 */

const KNOWLEDGE_SERVICE_PORT = process.env.KNOWLEDGE_SERVICE_PORT || '3006';
const HERMES_ADMIN_KEY = process.env.HERMES_ADMIN_KEY || process.env.OPENROUTER_API_KEY || '';

export const POST = withGuard(
  routeConfig['/api/hermes/knowledge/[id]/reindex'].POST!,
  async (request, ctx, context: RouteSegmentContext) => {
    try {
      const { id } = await context.params;
      // Next.js params can be string | string[] — coerce for single-segment [id] route
      const docId = String(id);
      if (!HERMES_ADMIN_KEY) {
        return NextResponse.json({ error: 'HERMES_ADMIN_KEY not configured' }, { status: 503 });
      }

      const res = await fetch(
        `http://localhost:${KNOWLEDGE_SERVICE_PORT}/documents/${encodeURIComponent(docId)}/reindex`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${HERMES_ADMIN_KEY}` },
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
      logger.info('[HERMES KNOWLEDGE] Document re-indexed', { id: docId, performedBy: ctx.id });
      return NextResponse.json(data);
    } catch (error) {
      logger.error('[HERMES KNOWLEDGE] Failed to reindex document:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
);
