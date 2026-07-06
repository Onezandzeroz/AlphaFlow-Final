/**
 * GET /api/bank-connections/tink-callback
 *
 * OAuth2 callback endpoint for Tink Link.
 *
 * After the user authenticates with their bank via Tink Link, Tink redirects
 * the browser to this URL with query parameters:
 *   - code:  Authorization code (exchanged for access token)
 *   - state: The connection ID we passed when building the Tink Link URL
 *   - error: (if auth failed) Error code from Tink
 *
 * This route:
 *   1. Exchanges the authorization code for an access token
 *   2. Fetches the user's bank accounts from Tink
 *   3. Stores the access token (encrypted) on the BankConnection record
 *   4. Returns an HTML page that sends the account list to the parent window
 *      via postMessage, so the frontend can show an account selection dialog
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { encryptOrNull } from '@/lib/crypto';
import { auditUpdate, requestMetadata } from '@/lib/audit';
import {
  getTinkConfig,
  exchangeCodeForToken,
  listAccounts,
  listCredentials,
  type TinkAccount,
} from '@/lib/tink-client';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  // ─── Error from Tink ──────────────────────────────────────────
  const errorCode = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');
  if (errorCode) {
    logger.error('Tink Link authorization error', { errorCode, errorDescription });
    return new NextResponse(renderErrorPage(errorCode, errorDescription || 'Unknown error'), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // ─── Extract code & state ─────────────────────────────────────
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // state = connectionId

  if (!code || !state) {
    return new NextResponse(renderErrorPage(
      'missing_params',
      'Manglende autorisationskode eller tilstand. Prøv igen.',
    ), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  // ─── Validate Tink config ─────────────────────────────────────
  const config = getTinkConfig();
  if (!config) {
    return new NextResponse(renderErrorPage(
      'not_configured',
      'Tink er ikke konfigureret på serveren. Sæt TINK_CLIENT_ID og TINK_CLIENT_SECRET i .env.',
    ), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  // ─── Find the BankConnection by state (= connectionId) ───────
  const connection = await db.bankConnection.findUnique({
    where: { id: state },
  });

  if (!connection) {
    return new NextResponse(renderErrorPage(
      'connection_not_found',
      'Bankforbindelsen blev ikke fundet. Den kan være blevet slettet.',
    ), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  try {
    // ─── Step 1: Exchange code for access token ─────────────────
    const tokenResponse = await exchangeCodeForToken(config, code);

    // ─── Step 2: Fetch the user's credentials (for re-authorization) ──
    // Tink v2 API does not return credentialsId per account, so we fetch the
    // user's credentials list separately. The first credential is used as
    // the primary credentialsId for re-authorization later.
    let primaryCredentialsId = '';
    try {
      const credentials = await listCredentials(config, tokenResponse.access_token);
      primaryCredentialsId = credentials[0]?.id || '';
      logger.info('Tink credentials fetched', { count: credentials.length, primaryCredentialsId });
    } catch (credError) {
      // Non-fatal: credentials fetch may fail for some app configurations,
      // but account listing + transaction fetch can still proceed.
      logger.warn('Tink list credentials failed (non-fatal)', {
        error: credError instanceof Error ? credError.message : 'Unknown',
      });
    }

    // ─── Step 3: Fetch user's bank accounts ─────────────────────
    const accounts = await listAccounts(config, tokenResponse.access_token, primaryCredentialsId);

    if (accounts.length === 0) {
      return new NextResponse(renderErrorPage(
        'no_accounts',
        'Ingen bankkonti fundet. Vælg mindst én konto i Tink Link.',
      ), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    // ─── Step 4: Store access token on the connection ───────────
    // We encrypt the access token with AES-256-GCM before storing.
    // The credentialsId is stored in refreshToken for potential
    // re-authorization later.
    await db.bankConnection.update({
      where: { id: connection.id },
      data: {
        accessToken: encryptOrNull(tokenResponse.access_token),
        refreshToken: encryptOrNull(primaryCredentialsId),
        // Don't change status yet — user must select an account first
      },
    });

    // Audit log
    if (connection.userId) {
      await auditUpdate(
        connection.userId,
        'BankConnection',
        connection.id,
        { status: 'PENDING' },
        { status: 'ACCOUNTS_READY' },
        requestMetadata(request),
        connection.companyId,
      ).catch(() => {});
    }

    // ─── Step 4: Return HTML that sends accounts to parent ──────
    const safeAccounts = accounts.map(a => ({
      id: a.id,
      name: a.name,
      type: a.type,
      accountNumber: a.accountNumber || '',
      iban: a.iban || '',
      balance: a.balances?.[0]?.amount ?? null,
      currency: a.balances?.[0]?.currencyCode || 'DKK',
      bankName: a.institution?.name || 'Ukendt bank',
      holderName: a.holderName || '',
      credentialsId: a.credentialsId,
    }));

    const html = renderAccountSelectionPage(
      connection.id,
      safeAccounts,
    );

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (error) {
    logger.error('Tink callback processing error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';

    // Update connection with error
    await db.bankConnection.update({
      where: { id: connection.id },
      data: { lastError: message },
    }).catch(() => {});

    return new NextResponse(renderErrorPage('callback_error', message), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}

// ─── HTML Renderers ──────────────────────────────────────────────────────

function renderAccountSelectionPage(
  connectionId: string,
  accounts: Array<{
    id: string;
    name: string;
    type: string;
    accountNumber: string;
    iban: string;
    balance: number | null;
    currency: string;
    bankName: string;
    holderName: string;
    credentialsId: string;
  }>,
): string {
  const accountsJson = JSON.stringify({ connectionId, accounts });

  return `<!DOCTYPE html>
<html lang="da">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Vælg bankkonto — AlphaFlow</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f9fafb;
      color: #111827;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .container {
      background: white;
      border-radius: 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06);
      max-width: 480px;
      width: 100%;
      padding: 32px 24px;
    }
    .icon { font-size: 48px; text-align: center; margin-bottom: 16px; }
    h2 { text-align: center; font-size: 20px; font-weight: 600; margin-bottom: 8px; }
    .subtitle { text-align: center; color: #6b7280; font-size: 14px; margin-bottom: 24px; }
    .account-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; }
    .account-item {
      border: 2px solid #e5e7eb;
      border-radius: 12px;
      padding: 16px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .account-item:hover { border-color: #0d9488; background: #f0fdfa; }
    .account-item.selected { border-color: #0d9488; background: #f0fdfa; }
    .account-bank { font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
    .account-name { font-size: 16px; font-weight: 600; margin-bottom: 4px; }
    .account-number { font-size: 14px; color: #6b7280; font-family: monospace; margin-bottom: 8px; }
    .account-balance { font-size: 18px; font-weight: 700; font-family: monospace; }
    .account-balance.negative { color: #dc2626; }
    .btn {
      width: 100%;
      padding: 12px;
      border-radius: 10px;
      border: none;
      background: #0d9488;
      color: white;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
    }
    .btn:hover { background: #0f766e; }
    .btn:disabled { background: #d1d5db; cursor: not-allowed; }
    .close-link {
      display: block;
      text-align: center;
      margin-top: 16px;
      color: #6b7280;
      font-size: 13px;
      text-decoration: none;
      cursor: pointer;
    }
    .close-link:hover { color: #111827; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">&#9989;</div>
    <h2>Godkendt — Vælg konto</h2>
    <p class="subtitle">Din bank er nu forbundet. Vælg hvilken konto der skal synkroniseres med AlphaFlow.</p>

    <div class="account-list" id="accountList"></div>

    <button class="btn" id="confirmBtn" disabled>Koble denne konto til AlphaFlow</button>
    <a class="close-link" onclick="window.close()">Luk uden at vælge</a>
  </div>

  <script>
    const DATA = ${accountsJson};
    let selectedAccountId = null;

    // Render accounts
    const list = document.getElementById('accountList');
    DATA.accounts.forEach(account => {
      const div = document.createElement('div');
      div.className = 'account-item';
      div.dataset.id = account.id;

      const balanceFormatted = account.balance !== null
        ? new Intl.NumberFormat('da-DK', { style: 'currency', currency: account.currency || 'DKK' }).format(account.balance)
        : '—';

      const displayNumber = account.iban
        ? account.iban.replace(/(.{4})/g, '$1 ').trim()
        : account.accountNumber || account.id;

      div.innerHTML = \`
        <div class="account-bank">\${account.bankName}</div>
        <div class="account-name">\${account.name || account.type}</div>
        <div class="account-number">\${displayNumber}</div>
        <div class="account-balance \${account.balance < 0 ? 'negative' : ''}">\${balanceFormatted}</div>
      \`;

      div.addEventListener('click', () => {
        document.querySelectorAll('.account-item').forEach(el => el.classList.remove('selected'));
        div.classList.add('selected');
        selectedAccountId = account.id;
        document.getElementById('confirmBtn').disabled = false;
      });

      list.appendChild(div);
    });

    // Confirm selection
    document.getElementById('confirmBtn').addEventListener('click', () => {
      if (!selectedAccountId) return;

      const account = DATA.accounts.find(a => a.id === selectedAccountId);
      if (!account) return;

      // Notify parent window
      if (window.opener) {
        window.opener.postMessage({
          type: 'tink-accounts-selected',
          connectionId: DATA.connectionId,
          account: account,
        }, '*');
      }

      // Also try top-level parent for iframe scenarios
      if (window.parent !== window) {
        window.parent.postMessage({
          type: 'tink-accounts-selected',
          connectionId: DATA.connectionId,
          account: account,
        }, '*');
      }

      // Show confirmation
      document.querySelector('.container').innerHTML = \`
        <div class="icon">&#9989;</div>
        <h2>Konto tilkoblet!</h2>
        <p class="subtitle">\${account.name || account.type} hos \${account.bankName} er nu forbundet med AlphaFlow.</p>
        <p class="subtitle" style="margin-top: 12px;">Du kan lukke dette vindue.</p>
        <a class="close-link" onclick="window.close()" style="margin-top:24px; font-size:15px; color:#0d9488; font-weight:600;">Luk vindue</a>
      \`;
    });

    // Auto-close after 10 minutes as a safety measure
    setTimeout(() => { window.close(); }, 600000);
  </script>
</body>
</html>`;
}

function renderErrorPage(errorCode: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="da">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Fejl — AlphaFlow</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f9fafb; color: #111827; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 16px; }
    .container { background: white; border-radius: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); max-width: 480px; width: 100%; padding: 32px 24px; text-align: center; }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h2 { font-size: 20px; font-weight: 600; color: #dc2626; margin-bottom: 8px; }
    p { color: #6b7280; font-size: 14px; margin-bottom: 24px; line-height: 1.5; }
    .error-code { font-size: 12px; color: #9ca3af; font-family: monospace; margin-bottom: 20px; }
    .btn { padding: 10px 24px; border-radius: 10px; border: none; background: #0d9488; color: white; font-size: 14px; font-weight: 600; cursor: pointer; }
    .btn:hover { background: #0f766e; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">&#10060;</div>
    <h2>Forbindelse fejlede</h2>
    <p>${escapeHtml(message)}</p>
    <p class="error-code">${escapeHtml(errorCode)}</p>
    <button class="btn" onclick="window.close()">Luk</button>
  </div>
  <script>
    // Notify parent window of the error
    if (window.opener) {
      window.opener.postMessage({ type: 'tink-auth-error', errorCode: '${escapeHtml(errorCode)}', message: '${escapeHtml(message)}' }, '*');
    }
    setTimeout(() => { window.close(); }, 10000);
  </script>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}