import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

/**
 * POST /api/csp-report
 *
 * Receives Content-Security-Policy violation reports from the browser.
 * When CSP is in Report-Only mode, violations are logged here without
 * blocking the request. Use these logs to identify legitimate sources
 * that need to be added to the CSP policy before enforcement.
 *
 * The browser sends a JSON body per the CSP spec:
 *   { "csp-report": { "document-uri", "violated-directive", ... } }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const report = body?.['csp-report'];

    if (!report) {
      return NextResponse.json({ error: 'Invalid report' }, { status: 400 });
    }

    logger.warn('[CSP Violation]', {
      documentUri: report['document-uri'] || 'unknown',
      violatedDirective: report['violated-directive'] || 'unknown',
      blockedUri: report['blocked-uri'] || 'unknown',
      sourceFile: report['source-file'] || 'unknown',
      lineNumber: report['line-number'] || 'unknown',
      statusCode: report['status-code'] || 'unknown',
    });

    // Return 204 — browser doesn't care about the body
    return new NextResponse(null, { status: 204 });
  } catch {
    // Silently ignore malformed reports — they're not security-critical
    return new NextResponse(null, { status: 204 });
  }
}