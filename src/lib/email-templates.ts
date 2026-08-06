/**
 * Email HTML Templates for AlphaFlow Regnskab & Bogføring
 *
 * All templates use inline CSS (email clients don't support <style> tags).
 * Bilingual: Danish (default) / English.
 * Primary color: #0d9488 (teal)
 */

type Language = 'da' | 'en';

const APP_NAME = 'AlphaFlow Regnskab & Bogføring';
const PRIMARY = '#0d9488';
const PRIMARY_DARK = '#0f766e';
const BG_LIGHT = '#f0fdfa';
const TEXT_DARK = '#1a1a1a';
const TEXT_MUTED = '#6b7280';

// ─── WRAPPER ──────────────────────────────────────────────────────

function wrapperHtml(bodyContent: string, language: Language, customFooter?: string): string {
  const defaultFooter =
    language === 'da'
      ? `Du modtager denne e-mail, fordi du er registreret hos ${APP_NAME}.<br/>
         Hvis du ikke har anmodet om dette, kan du ignorere denne e-mail.`
      : `You are receiving this email because you are registered with ${APP_NAME}.<br/>
         If you did not request this, you can safely ignore this email.`;
  const footer = customFooter || defaultFooter;

  return `<!DOCTYPE html>
<html lang="${language}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${APP_NAME}</title>
</head>
<body style="margin:0; padding:0; background-color:#f3f4f6; font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6; padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color:${PRIMARY}; padding:16px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle; padding-right:14px;">
                    <img src="${process.env.APP_URL || 'https://alphaai.dk'}/icon-512.png" alt="${APP_NAME}" width="72" height="72" style="display:block; width:72px; height:72px; border-radius:14px;" />
                  </td>
                  <td style="vertical-align:middle;">
                    <h1 style="margin:0; color:#ffffff; font-size:22px; font-weight:600; letter-spacing:-0.02em; white-space:nowrap;">${APP_NAME}</h1>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${bodyContent}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px; border-top:1px solid #e5e7eb; text-align:center;">
              <p style="margin:0; font-size:12px; color:${TEXT_MUTED}; line-height:1.5;">
                &copy; ${new Date().getFullYear()} ${APP_NAME}. ${footer}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── BUTTON ───────────────────────────────────────────────────────

function buttonHtml(url: string, text: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr>
      <td align="center">
        <a href="${url}" target="_blank" rel="noopener noreferrer"
           style="display:inline-block; background-color:${PRIMARY}; color:#ffffff; text-decoration:none; font-size:15px; font-weight:600; padding:12px 28px; border-radius:8px; letter-spacing:-0.01em;">
          ${text}
        </a>
      </td>
    </tr>
  </table>`;
}

// ─── VERIFICATION EMAIL ───────────────────────────────────────────

export function verificationEmailHtml(language: Language, verifyUrl: string): string {
  const heading =
    language === 'da' ? 'Bekræft din e-mailadresse' : 'Verify your email address';
  const body =
    language === 'da'
      ? `Tak for din tilmelding til <strong>${APP_NAME}</strong>.<br/><br/>
         Klik på knappen nedenfor for at bekræfte din e-mailadresse:`
      : `Thank you for signing up for <strong>${APP_NAME}</strong>.<br/><br/>
         Click the button below to verify your email address:`;
  const buttonText =
    language === 'da' ? 'Bekræft e-mail' : 'Verify email';
  const fallback =
    language === 'da'
      ? `Hvis knappen ikke virker, kan du kopiere dette link ind i din browser:<br/>
         <a href="${verifyUrl}" style="color:${PRIMARY}; word-break:break-all;">${verifyUrl}</a>`
      : `If the button doesn't work, copy and paste this link into your browser:<br/>
         <a href="${verifyUrl}" style="color:${PRIMARY}; word-break:break-all;">${verifyUrl}</a>`;

  const content = `
    <h2 style="margin:0 0 16px; color:${TEXT_DARK}; font-size:20px; font-weight:600;">${heading}</h2>
    <p style="margin:0 0 24px; color:${TEXT_DARK}; font-size:15px; line-height:1.6;">${body}</p>
    ${buttonHtml(verifyUrl, buttonText)}
    <p style="margin:0; font-size:13px; color:${TEXT_MUTED}; line-height:1.5;">${fallback}</p>
  `;

  return wrapperHtml(content, language);
}

// ─── PASSWORD RESET EMAIL ─────────────────────────────────────────

export function passwordResetHtml(language: Language, resetUrl: string): string {
  const heading =
    language === 'da' ? 'Nulstil din adgangskode' : 'Reset your password';
  const body =
    language === 'da'
      ? `Vi har modtaget en anmodning om at nulstille din adgangskode.<br/><br/>
         Klik på knappen nedenfor for at vælge en ny adgangskode. Dette link er gyldigt i 1 time.`
      : `We received a request to reset your password.<br/><br/>
         Click the button below to choose a new password. This link is valid for 1 hour.`;
  const buttonText =
    language === 'da' ? 'Nulstil adgangskode' : 'Reset password';
  const fallback =
    language === 'da'
      ? `Hvis knappen ikke virker, kan du kopiere dette link ind i din browser:<br/>
         <a href="${resetUrl}" style="color:${PRIMARY}; word-break:break-all;">${resetUrl}</a><br/><br/>
         Hvis du ikke har anmodet om dette, kan du ignorere denne e-mail.`
      : `If the button doesn't work, copy and paste this link into your browser:<br/>
         <a href="${resetUrl}" style="color:${PRIMARY}; word-break:break-all;">${resetUrl}</a><br/><br/>
         If you didn't request this, you can safely ignore this email.`;

  const content = `
    <h2 style="margin:0 0 16px; color:${TEXT_DARK}; font-size:20px; font-weight:600;">${heading}</h2>
    <p style="margin:0 0 24px; color:${TEXT_DARK}; font-size:15px; line-height:1.6;">${body}</p>
    ${buttonHtml(resetUrl, buttonText)}
    <p style="margin:0; font-size:13px; color:${TEXT_MUTED}; line-height:1.5;">${fallback}</p>
  `;

  return wrapperHtml(content, language);
}

// ─── INVITATION EMAIL ─────────────────────────────────────────────

export function invitationEmailHtml(
  language: Language,
  companyName: string,
  role: string,
  acceptUrl: string,
  password?: string
): string {
  const roleLabel =
    language === 'da'
      ? { OWNER: 'Ejer', ADMIN: 'Administrator', ACCOUNTANT: 'Bogholder', VIEWER: 'Læser', AUDITOR: 'Revisor' }[role] || role
      : role;

  // --- New user: email includes a generated password ---
  if (password) {
    const heading =
      language === 'da' ? 'Du er inviteret til et team' : 'You are invited to a team';
    const body =
      language === 'da'
        ? `Du er blevet inviteret af <strong>${companyName}</strong> til at deltage som <strong>${roleLabel}</strong>.<br/><br/>
           En konto er blevet oprettet til dig. Brug det nedenstående kodeord til at logge ind:`
        : `You have been invited by <strong>${companyName}</strong> to join as <strong>${roleLabel}</strong>.<br/><br/>
           An account has been created for you. Use the password below to log in:`;

    const passwordBlock =
      language === 'da'
        ? `<p style="margin:0; font-size:13px; color:${TEXT_MUTED}; line-height:1.5; margin-bottom:4px;"><strong>Dit kodeord:</strong></p>
           <p style="margin:0 0 16px; font-family:'Courier New',monospace; font-size:20px; font-weight:700; letter-spacing:2px; color:${PRIMARY_DARK}; background:#f0fdfa; padding:12px 20px; border-radius:8px; border:1px solid #ccfbf1; text-align:center;">${password}</p>`
        : `<p style="margin:0; font-size:13px; color:${TEXT_MUTED}; line-height:1.5; margin-bottom:4px;"><strong>Your password:</strong></p>
           <p style="margin:0 0 16px; font-family:'Courier New',monospace; font-size:20px; font-weight:700; letter-spacing:2px; color:${PRIMARY_DARK}; background:#f0fdfa; padding:12px 20px; border-radius:8px; border:1px solid #ccfbf1; text-align:center;">${password}</p>`;

    const securityNote =
      language === 'da'
        ? `<p style="margin:0; font-size:12px; color:${TEXT_MUTED}; line-height:1.5; background:#fffbeb; padding:10px 14px; border-radius:6px; border:1px solid #fde68a;">&#9888;&#65039; <strong>Vigtigt:</strong> Skift dit kodeord straks efter første login under Indstillinger.</p>`
        : `<p style="margin:0; font-size:12px; color:${TEXT_MUTED}; line-height:1.5; background:#fffbeb; padding:10px 14px; border-radius:6px; border:1px solid #fde68a;">&#9888;&#65039; <strong>Important:</strong> Change your password immediately after first login in Settings.</p>`;

    const buttonText =
      language === 'da' ? 'Log ind nu' : 'Log in now';
    const fallback =
      language === 'da'
        ? `Hvis knappen ikke virker, gå til <a href="${acceptUrl}" style="color:${PRIMARY}; word-break:break-all;">${acceptUrl}</a>`
        : `If the button doesn't work, go to <a href="${acceptUrl}" style="color:${PRIMARY}; word-break:break-all;">${acceptUrl}</a>`;

    const content = `
      <h2 style="margin:0 0 16px; color:${TEXT_DARK}; font-size:20px; font-weight:600;">${heading}</h2>
      <p style="margin:0 0 12px; color:${TEXT_DARK}; font-size:15px; line-height:1.6;">${body}</p>
      ${passwordBlock}
      ${buttonHtml(acceptUrl, buttonText)}
      <p style="margin:24px 0 12px; font-size:13px; color:${TEXT_MUTED}; line-height:1.5;">${fallback}</p>
      <div style="margin-top:16px;">${securityNote}</div>
    `;
    return wrapperHtml(content, language);
  }

  // --- Existing user: just an invite link ---
  const heading =
    language === 'da' ? 'Du er inviteret til et team' : 'You are invited to a team';
  const body =
    language === 'da'
      ? `Du er blevet inviteret til at deltage i <strong>${companyName}</strong> som <strong>${roleLabel}</strong>.<br/><br/>
         Klik på knappen nedenfor for at acceptere invitationen:`
      : `You have been invited to join <strong>${companyName}</strong> as <strong>${roleLabel}</strong>.<br/><br/>
         Click the button below to accept the invitation:`;
  const buttonText =
    language === 'da' ? 'Accepter invitation' : 'Accept invitation';
  const fallback =
    language === 'da'
      ? `Hvis knappen ikke virker, kan du kopiere dette link ind i din browser:<br/>
         <a href="${acceptUrl}" style="color:${PRIMARY}; word-break:break-all;">${acceptUrl}</a><br/><br/>
         Dette link udløber om 7 dage.`
      : `If the button doesn't work, copy and paste this link into your browser:<br/>
         <a href="${acceptUrl}" style="color:${PRIMARY}; word-break:break-all;">${acceptUrl}</a><br/><br/>
         This link expires in 7 days.`;

  const content = `
    <h2 style="margin:0 0 16px; color:${TEXT_DARK}; font-size:20px; font-weight:600;">${heading}</h2>
    <p style="margin:0 0 24px; color:${TEXT_DARK}; font-size:15px; line-height:1.6;">${body}</p>
    ${buttonHtml(acceptUrl, buttonText)}
    <p style="margin:0; font-size:13px; color:${TEXT_MUTED}; line-height:1.5;">${fallback}</p>
  `;

  return wrapperHtml(content, language);
}

// ─── OWNER NOTIFICATION EMAIL ─────────────────────────────────────

export function ownerNotificationHtml(
  language: Language,
  subject: string,
  bodyHtml: string
): string {
  const heading =
    language === 'da' ? 'Systemnotifikation' : 'System notification';

  const content = `
    <h2 style="margin:0 0 16px; color:${TEXT_DARK}; font-size:20px; font-weight:600;">${heading}</h2>
    <h3 style="margin:0 0 16px; color:${TEXT_DARK}; font-size:16px; font-weight:500;">${subject}</h3>
    <div style="font-size:14px; color:${TEXT_DARK}; line-height:1.6;">
      ${bodyHtml}
    </div>
  `;

  return wrapperHtml(content, language);
}

// ─── INVOICE EMAIL ──────────────────────────────────────────────

export function invoiceEmailHtml(
  language: Language,
  companyName: string,
  invoiceNumber: string,
  message: string,
): string {
  const title = language === 'da' ? 'Ny faktura' : 'New Invoice';
  const intro =
    language === 'da'
      ? `${companyName} har sendt dig en faktura. Se den vedhæftede PDF.`
      : `${companyName} has sent you an invoice. Please see the attached PDF.`;

  const formattedMessage = message.replace(/\n/g, '<br/>');

  const content = `
    <h2 style="margin:0 0 16px; color:${TEXT_DARK}; font-size:20px; font-weight:600;">${title}</h2>
    <p style="margin:0 0 16px; font-size:14px; color:${TEXT_DARK}; line-height:1.6;">${intro}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px; background-color:${BG_LIGHT}; border-radius:8px; border:1px solid #e2e8f0;">
      <tr>
        <td style="padding:16px 20px; font-size:13px; color:${TEXT_DARK};">
          <strong style="display:block; margin-bottom:4px; color:${TEXT_MUTED}; font-size:11px; text-transform:uppercase; letter-spacing:0.05em;">${language === 'da' ? 'Fakturanummer' : 'Invoice Number'}</strong>
          ${invoiceNumber}
        </td>
        <td style="padding:16px 20px; font-size:13px; color:${TEXT_DARK};">
          <strong style="display:block; margin-bottom:4px; color:${TEXT_MUTED}; font-size:11px; text-transform:uppercase; letter-spacing:0.05em;">${language === 'da' ? 'Sælger' : 'Seller'}</strong>
          ${companyName}
        </td>
      </tr>
    </table>
    ${formattedMessage ? `
    <div style="margin:16px 0; padding:16px 20px; background-color:#f9fafb; border-left:3px solid ${PRIMARY}; border-radius:0 8px 8px 0; font-size:14px; color:${TEXT_DARK}; line-height:1.6;">
      ${formattedMessage}
    </div>` : ''}
    <p style="margin:16px 0 0; font-size:13px; color:${TEXT_MUTED};">${language === 'da' ? 'Fakturaen er vedhæftet som PDF.' : 'The invoice is attached as a PDF.'}</p>
  `;

  return wrapperHtml(content, language, language === 'da'
    ? `Du/I modtager denne e-mail fra ${companyName}. Udarbejdet via ${APP_NAME} &copy; ${new Date().getFullYear()}.`
    : `You are receiving this email from ${companyName}. Prepared via ${APP_NAME} &copy; ${new Date().getFullYear()}.`
  );
}

// ─── SUBSCRIPTION WELCOME EMAIL (FASE 6) ───────────────────────────
// Sent immediately after a paid subscription plan is activated. Confirms
// the purchase, price, binding period, start date, and the terms version
// the user agreed to. Satisfies bank requirement (a): welcome/confirmation
// email after subscription creation.

export interface SubscriptionWelcomeData {
  planName: string;          // "AlphaFlow Pro"
  monthlyPriceDKK: number;   // 169 (exclusive of VAT) — shown briefly
  bindingMonths: number;     // 12 (0 for monthly)
  startDate: string;         // ISO date string
  expiryDate: string | null; // ISO date string or null (monthly has no fixed end)
  termsVersion: string;      // "2025-07-01-v1"
  appUrl: string;            // URL to log in
}

export function subscriptionWelcomeHtml(language: Language, data: SubscriptionWelcomeData): string {
  const heading = language === 'da'
    ? `Velkommen til AlphaFlow — ${data.planName}`
    : `Welcome to AlphaFlow — ${data.planName}`;

  const greeting = language === 'da'
    ? 'Vi er glade for at have dig med ombord! Dit abonnement er nu aktiveret, og du har fuld adgang til alle funktioner i dit valgte plan.'
    : 'We\'re happy to have you on board! Your subscription is now active and you have full access to all features in your chosen plan.';

  const bindingText = data.bindingMonths > 0
    ? (language === 'da'
      ? `Din bindingperiode er ${data.bindingMonths} måneder${data.expiryDate ? `, frem til ${new Date(data.expiryDate).toLocaleDateString('da-DK')}` : ''}.`
      : `Your binding period is ${data.bindingMonths} months${data.expiryDate ? `, until ${new Date(data.expiryDate).toLocaleDateString('en-GB')}` : ''}.`)
    : (language === 'da'
      ? 'Dit abonnement løber måned til måned og kan opsiges til udgangen af enhver måned.'
      : 'Your subscription runs month-to-month and can be cancelled at the end of any month.');

  const priceLine = data.monthlyPriceDKK > 0
    ? (language === 'da'
      ? `Abonnementet koster ${data.monthlyPriceDKK} kr. pr. måned (ekscl. moms).`
      : `The subscription costs ${data.monthlyPriceDKK} kr. per month (excl. VAT).`)
    : '';

  const termsLine = language === 'da'
    ? `Ved oprettelsen har du accepteret vores gældende forretningsbetingelser (version ${data.termsVersion}). Du kan altid læse de fulde vilkår i appen under Indstillinger.`
    : `By signing up you have accepted our current terms of service (version ${data.termsVersion}). You can always read the full terms in the app under Settings.`

  const receiptNote = language === 'da'
    ? 'Du modtager en separat e-mail med din betalingskvittering og en faktura (PDF) vedhæftet. Den indeholder en fuld momsopdeling.'
    : 'You will receive a separate email with your payment receipt and an invoice (PDF) attached. It contains a full VAT breakdown.'

  const loginBtn = language === 'da' ? 'Log ind i AlphaFlow' : 'Log in to AlphaFlow';
  const ctaText = language === 'da'
    ? 'Kom i gang med at bogføre, afstemme og rapportere — log ind via knappen herunder.'
    : 'Get started with bookkeeping, reconciliation and reporting — log in via the button below.';

  const content = `
    <h2 style="margin:0 0 16px; color:${TEXT_DARK}; font-size:22px; font-weight:600;">${heading}</h2>
    <p style="margin:0 0 20px; font-size:14px; color:${TEXT_DARK}; line-height:1.6;">${greeting}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px; background-color:${BG_LIGHT}; border-radius:8px; border:1px solid #e2e8f0;">
      <tr><td style="padding:12px 20px; font-size:13px; color:${TEXT_DARK}; border-bottom:1px solid #e2e8f0;">
        <strong style="color:${TEXT_DARK};">${language === 'da' ? 'Abonnement' : 'Plan'}</strong>: ${data.planName}
      </td></tr>
      ${priceLine ? `<tr><td style="padding:12px 20px; font-size:13px; color:${TEXT_DARK}; border-bottom:1px solid #e2e8f0;">
        <strong style="color:${TEXT_DARK};">${language === 'da' ? 'Pris' : 'Price'}</strong>: ${priceLine}
      </td></tr>` : ''}
      <tr><td style="padding:12px 20px; font-size:13px; color:${TEXT_DARK}; border-bottom:1px solid #e2e8f0;">
        <strong style="color:${TEXT_DARK};">${language === 'da' ? 'Startdato' : 'Start date'}</strong>: ${new Date(data.startDate).toLocaleDateString(language === 'da' ? 'da-DK' : 'en-GB')}
      </td></tr>
      <tr><td style="padding:12px 20px; font-size:13px; color:${TEXT_DARK};">
        <strong style="color:${TEXT_DARK};">${language === 'da' ? 'Binding' : 'Commitment'}</strong>: ${bindingText}
      </td></tr>
    </table>
    <p style="margin:0 0 8px; font-size:13px; color:${TEXT_DARK}; line-height:1.6;">${termsLine}</p>
    <div style="margin:0 0 20px; padding:14px 20px; background-color:#f0fdfa; border:1px solid #ccfbf1; border-radius:8px;">
      <p style="margin:0; font-size:13px; color:${TEXT_MUTED}; line-height:1.5;">${receiptNote}</p>
    </div>
    <p style="margin:0 0 16px; font-size:13px; color:${TEXT_DARK}; line-height:1.6;">${ctaText}</p>
    ${buttonHtml(data.appUrl, loginBtn)}
    <p style="margin:20px 0 0; font-size:12px; color:${TEXT_MUTED}; line-height:1.6;">
      ${language === 'da'
        ? 'Spørgsmål? Skriv til os på alphaaiconsult@gmail.com — vi svarer hurtigst muligt.<br/>AlphaAI Consult ApS · CVR 46312058'
        : 'Questions? Write to us at alphaaiconsult@gmail.com — we reply as soon as possible.<br/>AlphaAI Consult ApS · CVR 46312058'}
    </p>
  `;

  return wrapperHtml(content, language, language === 'da'
    ? `Du modtager denne e-mail, fordi du har oprettet et abonnement hos ${APP_NAME}.`
    : `You are receiving this email because you subscribed to ${APP_NAME}.`
  );
}

// ─── PAYMENT RECEIPT EMAIL (FASE 6) ────────────────────────────────
// Sent after each successful payment (initial + recurring renewals).
// Satisfies bank requirement (d): receipt/invoice after each recurring charge.

export interface PaymentReceiptData {
  planName: string;
  amountDKK: number;
  vatDKK: number;            // 25% moms
  totalDKK: number;          // incl. VAT
  monthlyPriceDKK?: number;  // unit price per month (excl. VAT), for momsgrundlag breakdown
  bindingMonths?: number;    // number of months charged, for momsgrundlag breakdown
  paymentDate: string;       // ISO date
  paymentId: string;         // AlphaFlow internal payment ID
  cardLast4?: string | null; // last 4 digits of card (if known)
  period: string;            // "1. juli 2025 – 1. august 2025"
  isRenewal: boolean;        // true if this is a recurring renewal
  // Customer info (for PDF invoice)
  customerCompanyName: string;
  customerEmail: string;
  customerCvr?: string | null;
  customerAddress?: string | null;
}

export function paymentReceiptHtml(language: Language, data: PaymentReceiptData): string {
  const heading = language === 'da'
    ? (data.isRenewal ? 'Kvittering på fornyelse af abonnement' : 'Betalingskvittering')
    : (data.isRenewal ? 'Subscription renewal receipt' : 'Payment receipt');

  const intro = language === 'da'
    ? `Tak for din betaling! Vi har modtaget <strong>${data.totalDKK.toFixed(2)} kr.</strong> for <strong>${data.planName}</strong>. Din betaling er gennemført, og dit abonnement er nu aktivt.`
    : `Thank you for your payment! We have received <strong>${data.totalDKK.toFixed(2)} kr.</strong> for <strong>${data.planName}</strong>. Your payment has been processed and your subscription is now active.`;

  const pdfNotice = language === 'da'
    ? `En faktura (mærket som betalt) er vedhæftet denne e-mail som PDF. Du kan bruge den som dokumentation for dit regnskab.`
    : `An invoice (marked as paid) is attached to this email as a PDF. You can use it as documentation for your accounting.`;

  const dateLabel = language === 'da' ? 'Betalingsdato' : 'Payment date';
  const planLabel = language === 'da' ? 'Abonnement' : 'Subscription';
  const periodLabel = language === 'da' ? 'Periode' : 'Period';
  const vatBasisLabel = language === 'da' ? 'Momsgrundlag (ekscl. moms)' : 'VAT basis (excl. VAT)';
  const vatRateLabel = language === 'da' ? 'Momssats' : 'VAT rate';
  const vatAmountLabel = language === 'da' ? 'Momsbeløb' : 'VAT amount';
  const totalLabel = language === 'da' ? 'I alt (inkl. moms)' : 'Total (incl. VAT)';
  const idLabel = language === 'da' ? 'Betalings-ID' : 'Payment ID';
  const cardLabel = language === 'da' ? 'Kort' : 'Card';

  // Momsgrundlag breakdown: "145,00 kr. × 36 måneder = 5.220,00 kr."
  const showBasisBreakdown = (data.monthlyPriceDKK != null && data.bindingMonths != null && data.bindingMonths > 0);
  const vatBasisValue = showBasisBreakdown
    ? `${data.monthlyPriceDKK!.toFixed(2)} kr. × ${data.bindingMonths} ${language === 'da' ? 'måneder' : 'months'} = ${data.amountDKK.toFixed(2)} kr.`
    : `${data.amountDKK.toFixed(2)} kr.`;

  const content = `
    <h2 style="margin:0 0 16px; color:${TEXT_DARK}; font-size:20px; font-weight:600;">${heading}</h2>
    <p style="margin:0 0 20px; font-size:14px; color:${TEXT_DARK}; line-height:1.6;">${intro}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px; background-color:${BG_LIGHT}; border-radius:8px; border:1px solid #e2e8f0;">
      <tr><td style="padding:12px 20px; font-size:13px; color:${TEXT_DARK}; border-bottom:1px solid #e2e8f0;">
        <strong style="display:inline-block; width:160px; color:${TEXT_MUTED}; font-size:11px; text-transform:uppercase; letter-spacing:0.05em;">${dateLabel}</strong> ${new Date(data.paymentDate).toLocaleDateString(language === 'da' ? 'da-DK' : 'en-GB')}
      </td></tr>
      <tr><td style="padding:12px 20px; font-size:13px; color:${TEXT_DARK}; border-bottom:1px solid #e2e8f0;">
        <strong style="display:inline-block; width:160px; color:${TEXT_MUTED}; font-size:11px; text-transform:uppercase; letter-spacing:0.05em;">${planLabel}</strong> ${data.planName}
      </td></tr>
      <tr><td style="padding:12px 20px; font-size:13px; color:${TEXT_DARK}; border-bottom:1px solid #e2e8f0;">
        <strong style="display:inline-block; width:160px; color:${TEXT_MUTED}; font-size:11px; text-transform:uppercase; letter-spacing:0.05em;">${periodLabel}</strong> ${data.period}
      </td></tr>
      ${data.cardLast4 ? `<tr><td style="padding:12px 20px; font-size:13px; color:${TEXT_DARK}; border-bottom:1px solid #e2e8f0;">
        <strong style="display:inline-block; width:160px; color:${TEXT_MUTED}; font-size:11px; text-transform:uppercase; letter-spacing:0.05em;">${cardLabel}</strong> •••• ${data.cardLast4}
      </td></tr>` : ''}
      <tr><td style="padding:12px 20px; font-size:13px; color:${TEXT_DARK}; border-bottom:1px solid #e2e8f0;">
        <strong style="display:inline-block; width:160px; color:${TEXT_MUTED}; font-size:11px; text-transform:uppercase; letter-spacing:0.05em;">${vatBasisLabel}</strong> ${vatBasisValue}
      </td></tr>
      <tr><td style="padding:12px 20px; font-size:13px; color:${TEXT_DARK}; border-bottom:1px solid #e2e8f0;">
        <strong style="display:inline-block; width:160px; color:${TEXT_MUTED}; font-size:11px; text-transform:uppercase; letter-spacing:0.05em;">${vatRateLabel}</strong> 25 %
      </td></tr>
      <tr><td style="padding:12px 20px; font-size:13px; color:${TEXT_DARK}; border-bottom:1px solid #e2e8f0;">
        <strong style="display:inline-block; width:160px; color:${TEXT_MUTED}; font-size:11px; text-transform:uppercase; letter-spacing:0.05em;">${vatAmountLabel}</strong> ${data.vatDKK.toFixed(2)} kr.
      </td></tr>
      <tr><td style="padding:12px 20px; font-size:14px; color:${TEXT_DARK}; border-bottom:1px solid #e2e8f0;">
        <strong style="display:inline-block; width:160px; color:${TEXT_DARK}; font-size:12px; text-transform:uppercase; letter-spacing:0.05em;">${totalLabel}</strong> <strong>${data.totalDKK.toFixed(2)} kr.</strong>
      </td></tr>
      <tr><td style="padding:12px 20px; font-size:13px; color:${TEXT_MUTED};">
        <strong style="display:inline-block; width:160px; color:${TEXT_MUTED}; font-size:11px; text-transform:uppercase; letter-spacing:0.05em;">${idLabel}</strong> <code style="font-family:monospace; font-size:11px;">${data.paymentId}</code>
      </td></tr>
    </table>
    <div style="margin:0 0 20px; padding:14px 20px; background-color:#f0fdfa; border:1px solid #ccfbf1; border-radius:8px;">
      <p style="margin:0 0 4px; font-size:13px; font-weight:600; color:#0d9488;">📎 ${language === 'da' ? 'Vedhæftet faktura' : 'Attached invoice'}</p>
      <p style="margin:0; font-size:13px; color:${TEXT_MUTED}; line-height:1.5;">${pdfNotice}</p>
    </div>
    <p style="margin:0; font-size:13px; color:${TEXT_MUTED}; line-height:1.6;">
      ${language === 'da'
        ? 'Opbevar denne kvittering og den vedhæftede faktura til din regnskabsbog. Har du spørgsmål, er du altid velkommen til at kontakte os på alphaaiconsult@gmail.com.<br/>AlphaAI Consult ApS · CVR 46312058 · Skelagervej 124C, 8200 Aarhus N'
        : 'Please keep this receipt and the attached invoice for your accounting records. If you have any questions, feel free to contact us at alphaaiconsult@gmail.com.<br/>AlphaAI Consult ApS · CVR 46312058 · Skelagervej 124C, 8200 Aarhus N, Denmark'}
    </p>
  `;

  return wrapperHtml(content, language, language === 'da'
    ? `Du modtager denne kvittering, fordi der er trukket betaling for dit AlphaFlow-abonnement.`
    : `You are receiving this receipt because a payment was charged for your AlphaFlow subscription.`
  );
}

// ─── SUBSCRIPTION CANCELLED EMAIL (FASE 6) ─────────────────────────
// Sent when the user cancels their subscription. Confirms cancellation and
// states that access is retained until the binding period ends.
// Satisfies bank requirement (e): cancellation confirmation.

export interface SubscriptionCancelledData {
  planName: string;
  cancelledDate: string;     // ISO date
  accessUntilDate: string | null; // ISO date or null (monthly = end of current period)
  reason: string;            // 'user_request' | 'payment_failed' | 'admin_action'
  appUrl: string;
}

export function subscriptionCancelledHtml(language: Language, data: SubscriptionCancelledData): string {
  const heading = language === 'da' ? 'Bekræftelse på opsigelse' : 'Cancellation confirmation';
  const intro = language === 'da'
    ? 'Vi bekræfter hermed, at dit abonnement er opsagt.'
    : 'We hereby confirm that your subscription has been cancelled.';

  const planLabel = language === 'da' ? 'Abonnement' : 'Plan';
  const cancelledLabel = language === 'da' ? 'Opsigelsesdato' : 'Cancellation date';
  const accessLabel = language === 'da' ? 'Adgang indtil' : 'Access until';

  const accessText = data.accessUntilDate
    ? new Date(data.accessUntilDate).toLocaleDateString(language === 'da' ? 'da-DK' : 'en-GB')
    : (language === 'da' ? 'Udløb af nuværende periode' : 'End of current period');

  const loginBtn = language === 'da' ? 'Log ind i AlphaFlow' : 'Log in to AlphaFlow';

  const content = `
    <h2 style="margin:0 0 16px; color:${TEXT_DARK}; font-size:20px; font-weight:600;">${heading}</h2>
    <p style="margin:0 0 20px; font-size:14px; color:${TEXT_DARK}; line-height:1.6;">${intro}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px; background-color:${BG_LIGHT}; border-radius:8px; border:1px solid #e2e8f0;">
      <tr><td style="padding:12px 20px; font-size:13px; color:${TEXT_DARK}; border-bottom:1px solid #e2e8f0;">
        <strong style="display:inline-block; width:160px; color:${TEXT_MUTED}; font-size:11px; text-transform:uppercase; letter-spacing:0.05em;">${planLabel}</strong> ${data.planName}
      </td></tr>
      <tr><td style="padding:12px 20px; font-size:13px; color:${TEXT_DARK}; border-bottom:1px solid #e2e8f0;">
        <strong style="display:inline-block; width:160px; color:${TEXT_MUTED}; font-size:11px; text-transform:uppercase; letter-spacing:0.05em;">${cancelledLabel}</strong> ${new Date(data.cancelledDate).toLocaleDateString(language === 'da' ? 'da-DK' : 'en-GB')}
      </td></tr>
      <tr><td style="padding:12px 20px; font-size:13px; color:${TEXT_DARK};">
        <strong style="display:inline-block; width:160px; color:${TEXT_MUTED}; font-size:11px; text-transform:uppercase; letter-spacing:0.05em;">${accessLabel}</strong> ${accessText}
      </td></tr>
    </table>
    <div style="margin:16px 0; padding:16px 20px; background-color:#fef3c7; border-left:3px solid #f59e0b; border-radius:0 8px 8px 0; font-size:13px; color:#92400e; line-height:1.6;">
      ${language === 'da'
        ? '<strong>Vigtigt:</strong> Du beholder fuld adgang til AlphaFlow indtil ovenstående dato. Efter udløbet vil kontoen blive deaktiveret, men dine data opbevares i 5 år jf. Bogføringsloven §10-12.'
        : '<strong>Important:</strong> You retain full access to AlphaFlow until the date above. After expiry, your account will be deactivated, but your data is retained for 5 years per the Danish Bookkeeping Act §10-12.'}
    </div>
    ${buttonHtml(data.appUrl, loginBtn)}
  `;

  return wrapperHtml(content, language, language === 'da'
    ? `Du modtager denne e-mail, fordi du har opsagt dit abonnement hos ${APP_NAME}.`
    : `You are receiving this email because you cancelled your ${APP_NAME} subscription.`
  );
}

// ─── PAYMENT FAILED EMAIL (FASE 6) ─────────────────────────────────
// Sent when a renewal payment fails. Includes retry info and a link to
// update the payment method.
// Satisfies bank requirement (f): failed payment notification.

export interface PaymentFailedData {
  planName: string;
  amountDKK: number;
  attemptDate: string;       // ISO date
  retryDate: string | null;  // ISO date when retry will be attempted
  appUrl: string;            // link to update payment method
}

export function paymentFailedHtml(language: Language, data: PaymentFailedData): string {
  const heading = language === 'da' ? 'Betaling mislykkedes ⚠️' : 'Payment failed ⚠️';
  const intro = language === 'da'
    ? `Vi kunne ikke trække betalingen for dit <strong>${data.planName}</strong>-abonnement. Dette kan skyldes udløbet kort, manglende dækning eller at kortet er blokeret.`
    : `We were unable to charge the payment for your <strong>${data.planName}</strong> subscription. This may be due to an expired card, insufficient funds, or the card being blocked.`;

  const updateBtn = language === 'da' ? 'Opdater betalingsmetode' : 'Update payment method';

  const retryText = data.retryDate
    ? (language === 'da'
        ? `Vi vil forsøge igen den <strong>${new Date(data.retryDate).toLocaleDateString('da-DK')}</strong>.`
        : `We will retry on <strong>${new Date(data.retryDate).toLocaleDateString('en-GB')}</strong>.`)
    : (language === 'da'
        ? 'Der vil ikke blive foretaget yderligere forsøg automatisk.'
        : 'No further automatic retry will be attempted.');

  const content = `
    <h2 style="margin:0 0 16px; color:#b91c1c; font-size:20px; font-weight:600;">${heading}</h2>
    <p style="margin:0 0 20px; font-size:14px; color:${TEXT_DARK}; line-height:1.6;">${intro}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px; background-color:#fef2f2; border-radius:8px; border:1px solid #fecaca;">
      <tr><td style="padding:12px 20px; font-size:13px; color:#7f1d1d; border-bottom:1px solid #fecaca;">
        <strong style="display:inline-block; width:160px; font-size:11px; text-transform:uppercase; letter-spacing:0.05em;">${language === 'da' ? 'Abonnement' : 'Plan'}</strong> ${data.planName}
      </td></tr>
      <tr><td style="padding:12px 20px; font-size:13px; color:#7f1d1d; border-bottom:1px solid #fecaca;">
        <strong style="display:inline-block; width:160px; font-size:11px; text-transform:uppercase; letter-spacing:0.05em;">${language === 'da' ? 'Beløb (inkl. 25% moms)' : 'Amount (incl. 25% VAT)'}</strong> <strong>${data.amountDKK.toFixed(2)} kr.</strong>
      </td></tr>
      <tr><td style="padding:12px 20px; font-size:13px; color:#7f1d1d;">
        <strong style="display:inline-block; width:160px; font-size:11px; text-transform:uppercase; letter-spacing:0.05em;">${language === 'da' ? 'Forsøg den' : 'Attempted on'}</strong> ${new Date(data.attemptDate).toLocaleDateString(language === 'da' ? 'da-DK' : 'en-GB')}
      </td></tr>
    </table>
    <p style="margin:0 0 8px; font-size:14px; color:${TEXT_DARK}; line-height:1.6;">${retryText}</p>
    <p style="margin:0 0 16px; font-size:13px; color:${TEXT_MUTED}; line-height:1.6;">
      ${language === 'da'
        ? 'For at undgå afbrydelse af dit abonnement, bedes du opdatere din betalingsmetode hurtigst muligt.'
        : 'To avoid disruption of your subscription, please update your payment method as soon as possible.'}
    </p>
    ${buttonHtml(data.appUrl, updateBtn)}
  `;

  return wrapperHtml(content, language, language === 'da'
    ? `Du modtager denne e-mail, fordi en betaling for dit AlphaFlow-abonnement mislykkedes.`
    : `You are receiving this email because a payment for your AlphaFlow subscription failed.`
  );
}

// ─── PRE-RENEWAL REMINDER EMAIL (FASE 6) ───────────────────────────
// Sent X days before a binding period ends (annual/2year/3year plans) or
// before a monthly recurring renewal. Tells the customer that a renewal
// charge is upcoming.
// Satisfies bank requirement (c): pre-renewal reminder.

export interface PreRenewalReminderData {
  planName: string;
  renewalDate: string;       // ISO date of upcoming renewal
  amountDKK: number;         // amount that will be charged
  daysUntilRenewal: number;  // 14, 7, 3, 1...
  isAutoRenew: boolean;      // true if it will auto-charge, false if action needed
  appUrl: string;
}

export function preRenewalReminderHtml(language: Language, data: PreRenewalReminderData): string {
  const heading = language === 'da' ? 'Påmindelse: Fornyelse af abonnement' : 'Reminder: Subscription renewal';
  const intro = language === 'da'
    ? `Dit <strong>${data.planName}</strong>-abonnement ${
        data.isAutoRenew ? 'fornyes automatisk' : 'udløber'
      } om <strong>${data.daysUntilRenewal} ${data.daysUntilRenewal === 1 ? 'dag' : 'dage'}</strong>.`
    : `Your <strong>${data.planName}</strong> subscription will ${
        data.isAutoRenew ? 'auto-renew' : 'expire'
      } in <strong>${data.daysUntilRenewal} ${data.daysUntilRenewal === 1 ? 'day' : 'days'}</strong>.`;

  const renewalLabel = language === 'da' ? 'Fornyelsesdato' : 'Renewal date';
  const amountLabel = language === 'da' ? 'Beløb ved fornyelse (inkl. 25% moms)' : 'Amount at renewal (incl. 25% VAT)';
  const actionBtn = data.isAutoRenew
    ? (language === 'da' ? 'Se abonnement' : 'View subscription')
    : (language === 'da' ? 'Forny abonnement' : 'Renew subscription');

  const actionNote = data.isAutoRenew
    ? (language === 'da'
        ? 'Betalingen trækkes automatisk på den tilknyttede betalingsmetode. Hvis du ikke ønsker fornyelse, kan du opsige i indstillingerne inden fornyelsesdatoen.'
        : 'The payment will be charged automatically to your payment method on file. To cancel, please do so in your settings before the renewal date.')
    : (language === 'da'
        ? 'For at fortsætte med AlphaFlow skal du aktivt forny dit abonnement inden udløbet.'
        : 'To continue using AlphaFlow, please renew your subscription before it expires.');

  const content = `
    <h2 style="margin:0 0 16px; color:${TEXT_DARK}; font-size:20px; font-weight:600;">${heading}</h2>
    <p style="margin:0 0 20px; font-size:14px; color:${TEXT_DARK}; line-height:1.6;">${intro}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px; background-color:${BG_LIGHT}; border-radius:8px; border:1px solid #e2e8f0;">
      <tr><td style="padding:12px 20px; font-size:13px; color:${TEXT_DARK}; border-bottom:1px solid #e2e8f0;">
        <strong style="display:inline-block; width:160px; color:${TEXT_MUTED}; font-size:11px; text-transform:uppercase; letter-spacing:0.05em;">${language === 'da' ? 'Abonnement' : 'Plan'}</strong> ${data.planName}
      </td></tr>
      <tr><td style="padding:12px 20px; font-size:13px; color:${TEXT_DARK}; border-bottom:1px solid #e2e8f0;">
        <strong style="display:inline-block; width:160px; color:${TEXT_MUTED}; font-size:11px; text-transform:uppercase; letter-spacing:0.05em;">${renewalLabel}</strong> ${new Date(data.renewalDate).toLocaleDateString(language === 'da' ? 'da-DK' : 'en-GB')}
      </td></tr>
      <tr><td style="padding:12px 20px; font-size:13px; color:${TEXT_DARK};">
        <strong style="display:inline-block; width:160px; color:${TEXT_MUTED}; font-size:11px; text-transform:uppercase; letter-spacing:0.05em;">${amountLabel}</strong> <strong>${data.amountDKK.toFixed(2)} kr.</strong>
      </td></tr>
    </table>
    <p style="margin:0 0 16px; font-size:13px; color:${TEXT_MUTED}; line-height:1.6;">${actionNote}</p>
    ${buttonHtml(data.appUrl, actionBtn)}
  `;

  return wrapperHtml(content, language, language === 'da'
    ? `Du modtager denne påmindelse, fordi dit AlphaFlow-abonnement snart fornyes.`
    : `You are receiving this reminder because your AlphaFlow subscription is about to renew.`
  );
}

// ─── TERMS CHANGE NOTIFICATION EMAIL (FASE 6) ──────────────────────
// Sent when the terms of service version changes. Broadcast to all active
// subscribers. The email must clearly state what changed and when the new
// terms take effect.
// Satisfies bank requirement (g) + (h): terms change + material change notice.

export interface TermsChangeData {
  oldVersion: string;        // "2025-07-01-v1"
  newVersion: string;        // "2025-11-01-v1"
  effectiveDate: string;     // ISO date when new terms take effect
  summaryHtml: string;       // bullet-point summary of changes (HTML)
  termsUrl: string;          // link to the full new terms
}

export function termsChangeHtml(language: Language, data: TermsChangeData): string {
  const heading = language === 'da' ? 'Vigtigt: Ændringer af vores vilkår' : 'Important: Changes to our terms';
  const intro = language === 'da'
    ? `Vi opdaterer vores Forretningsbetingelser. De nye vilkår træder i kraft den <strong>${new Date(data.effectiveDate).toLocaleDateString('da-DK')}</strong>.`
    : `We are updating our Terms of Service. The new terms take effect on <strong>${new Date(data.effectiveDate).toLocaleDateString('en-GB')}</strong>.`;

  const oldLabel = language === 'da' ? 'Tidligere version' : 'Previous version';
  const newLabel = language === 'da' ? 'Ny version' : 'New version';
  const effLabel = language === 'da' ? 'Ikrafttrædelse' : 'Effective date';
  const summaryLabel = language === 'da' ? 'Hovedændringer' : 'Key changes';
  const readBtn = language === 'da' ? 'Læs de fulde vilkår' : 'Read the full terms';

  const content = `
    <h2 style="margin:0 0 16px; color:${TEXT_DARK}; font-size:20px; font-weight:600;">${heading}</h2>
    <p style="margin:0 0 20px; font-size:14px; color:${TEXT_DARK}; line-height:1.6;">${intro}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px; background-color:${BG_LIGHT}; border-radius:8px; border:1px solid #e2e8f0;">
      <tr><td style="padding:12px 20px; font-size:13px; color:${TEXT_DARK}; border-bottom:1px solid #e2e8f0;">
        <strong style="display:inline-block; width:160px; color:${TEXT_MUTED}; font-size:11px; text-transform:uppercase; letter-spacing:0.05em;">${oldLabel}</strong> ${data.oldVersion}
      </td></tr>
      <tr><td style="padding:12px 20px; font-size:13px; color:${TEXT_DARK}; border-bottom:1px solid #e2e8f0;">
        <strong style="display:inline-block; width:160px; color:${TEXT_MUTED}; font-size:11px; text-transform:uppercase; letter-spacing:0.05em;">${newLabel}</strong> ${data.newVersion}
      </td></tr>
      <tr><td style="padding:12px 20px; font-size:13px; color:${TEXT_DARK};">
        <strong style="display:inline-block; width:160px; color:${TEXT_MUTED}; font-size:11px; text-transform:uppercase; letter-spacing:0.05em;">${effLabel}</strong> ${new Date(data.effectiveDate).toLocaleDateString(language === 'da' ? 'da-DK' : 'en-GB')}
      </td></tr>
    </table>
    <h3 style="margin:0 0 12px; color:${TEXT_DARK}; font-size:14px; font-weight:600;">${summaryLabel}</h3>
    <div style="margin:0 0 20px; padding:16px 20px; background-color:#f9fafb; border-left:3px solid ${PRIMARY}; border-radius:0 8px 8px 0; font-size:14px; color:${TEXT_DARK}; line-height:1.7;">
      ${data.summaryHtml}
    </div>
    <p style="margin:0 0 16px; font-size:13px; color:${TEXT_MUTED}; line-height:1.6;">
      ${language === 'da'
        ? 'Ved fortsat brug af AlphaFlow efter ikrafttrædelsesdatoen accepterer du de nye vilkår. Hvis du ikke accepterer de nye vilkår, kan du opsige dit abonnement inden da.'
        : 'By continuing to use AlphaFlow after the effective date, you accept the new terms. If you do not accept the new terms, you may cancel your subscription before that date.'}
    </p>
    ${buttonHtml(data.termsUrl, readBtn)}
  `;

  return wrapperHtml(content, language, language === 'da'
    ? `Du modtager denne e-mail, fordi du er aktiv abonnent hos ${APP_NAME}, og vi er juridisk forpligtet til at informere dig om væsentlige vilkårsændringer.`
    : `You are receiving this email because you are an active ${APP_NAME} subscriber, and we are legally required to notify you of material changes to our terms.`
  );
}
