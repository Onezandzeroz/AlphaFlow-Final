import { NextResponse } from 'next/server';
import { withGuard } from '@/lib/route-guard';
import { routeConfig } from '@/lib/route-config';
import { logger } from '@/lib/logger';

/**
 * Hermes RAG Knowledge Base — document management.
 *
 * GET  /api/hermes/knowledge         — list all documents (metadata only)
 * POST /api/hermes/knowledge         — create + embed a new document
 *
 * SuperDev-only. Proxies to the knowledge-service mini-service (port 3006).
 */

const KNOWLEDGE_SERVICE_PORT = process.env.KNOWLEDGE_SERVICE_PORT || '3006';
const HERMES_ADMIN_KEY = process.env.HERMES_ADMIN_KEY || process.env.OPENROUTER_API_KEY || '';

interface CreateDocBody {
  title: string;
  content: string;
  category?: string;
  tenantId?: string | null;
  description?: string;
  source?: string;
}

// ─── GET: list documents ────────────────────────────────────────

export const GET = withGuard(routeConfig['/api/hermes/knowledge'].GET!, async (request, ctx) => {
  try {
    if (!HERMES_ADMIN_KEY) {
      return NextResponse.json(
        { error: 'HERMES_ADMIN_KEY not configured on the server' },
        { status: 503 },
      );
    }

    const res = await fetch(`/api/documents?XTransformPort=${KNOWLEDGE_SERVICE_PORT}`, {
      headers: { 'Authorization': `Bearer ${HERMES_ADMIN_KEY}` },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      logger.error('[HERMES KNOWLEDGE] knowledge-service GET failed', { status: res.status, errText });
      return NextResponse.json(
        { error: `Knowledge service error: ${res.status}` },
        { status: 502 },
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    logger.error('[HERMES KNOWLEDGE] Failed to list documents:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

// ─── POST: create document + embed ──────────────────────────────

export const POST = withGuard(routeConfig['/api/hermes/knowledge'].POST!, async (request, ctx) => {
  try {
    if (!HERMES_ADMIN_KEY) {
      return NextResponse.json(
        { error: 'HERMES_ADMIN_KEY not configured on the server' },
        { status: 503 },
      );
    }

    const body = (await request.json()) as CreateDocBody;

    // Validate
    if (!body.title?.trim() || !body.content?.trim()) {
      return NextResponse.json(
        { error: 'title and content are required' },
        { status: 400 },
      );
    }

    // Clamp content size (prevent abuse — max 500KB per document)
    const MAX_CONTENT_SIZE = 500 * 1024;
    if (body.content.length > MAX_CONTENT_SIZE) {
      return NextResponse.json(
        { error: `Content too large (max ${MAX_CONTENT_SIZE} chars). Split into multiple documents.` },
        { status: 413 },
      );
    }

    const res = await fetch(`/api/documents?XTransformPort=${KNOWLEDGE_SERVICE_PORT}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HERMES_ADMIN_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: body.title,
        content: body.content,
        category: body.category || 'general',
        tenantId: body.tenantId ?? null,
        description: body.description || null,
        source: body.source || 'manual',
      }),
      // Embedding can take a while for large docs — allow up to 60s
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({ error: res.statusText }));
      logger.error('[HERMES KNOWLEDGE] create failed', { status: res.status, error: errData });
      return NextResponse.json(
        { error: errData.error || `Knowledge service error: ${res.status}` },
        { status: res.status },
      );
    }

    const data = await res.json();
    logger.info('[HERMES KNOWLEDGE] Document created', {
      title: body.title,
      chunkCount: data.chunkCount,
      performedBy: ctx.id,
    });

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    logger.error('[HERMES KNOWLEDGE] Failed to create document:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
