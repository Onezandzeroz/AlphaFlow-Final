/**
 * PDF Invoice Generator for AlphaFlow subscription payments.
 *
 * Generates a professional Danish-style invoice PDF marked as "BETALT" (Paid)
 * using pdf-lib. Attached to the payment-receipt email.
 *
 * Seller: AlphaAI Consult ApS · CVR 46312058
 */

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { format } from 'date-fns';
import { da } from 'date-fns/locale/da';

// ─── Seller constants ─────────────────────────────────────────────

const SELLER = {
  name: 'AlphaAI Consult ApS',
  cvr: '46312058',
  address1: 'Skelagervej 124C',
  address2: '8200 Aarhus N',
  country: 'Danmark',
  email: 'support@alphaflow.dk',
  website: 'www.alphaflow.dk',
  phone: '61736076',
  bankName: 'Lunar Bank A/S',
  bankAddress: 'Hack Kampmanns Plads 10, 8000 Aarhus, Danmark',
  bankAccount: '2003084399',
  bankReg: '6695',
} as const;

// ─── Color palette ────────────────────────────────────────────────

const TEAL = rgb(0.051, 0.58, 0.533);
const TEAL_LIGHT = rgb(0.94, 0.99, 0.98);
const DARK = rgb(0.1, 0.1, 0.1);
const GRAY = rgb(0.42, 0.44, 0.5);
const LIGHT_GRAY = rgb(0.88, 0.91, 0.94);
const GREEN_STAMP = rgb(0.07, 0.65, 0.54);

// ─── Types ────────────────────────────────────────────────────────

export interface InvoicePdfData {
  planName: string;
  amountExclVatDKK: number;
  vatDKK: number;
  totalDKK: number;
  monthlyPriceDKK?: number;  // unit price per month (excl. VAT)
  bindingMonths?: number;    // number of months charged
  paymentDate: Date;
  paymentId: string;
  period: string;
  isRenewal: boolean;
  customerCompanyName: string;
  customerEmail: string;
  customerCvr?: string | null;
  customerAddress?: string | null;
  cardLast4?: string | null;
  invoiceNumber?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: Date): string {
  return format(d, 'd. MMMM yyyy', { locale: da });
}

function fmtDateShort(d: Date): string {
  return format(d, 'dd-MM-yyyy');
}

// ─── Main generator ───────────────────────────────────────────────

export async function generateInvoicePdf(data: InvoicePdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();

  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontItalic = await doc.embedFont(StandardFonts.HelveticaOblique);

  const margin = 50;
  const contentWidth = width - margin * 2;

  // ── Top teal header bar ──
  page.drawRectangle({ x: 0, y: height - 6, width, height: 6, color: TEAL });

  // ── SELLER block (top-left) ──
  let y = height - margin - 10;
  page.drawText(SELLER.name, { x: margin, y, size: 16, font: fontBold, color: TEAL });
  y -= 16;
  page.drawText(`${SELLER.address1}, ${SELLER.address2}`, { x: margin, y, size: 9, font: fontRegular, color: GRAY });
  y -= 12;
  page.drawText(`CVR-nr.: ${SELLER.cvr}`, { x: margin, y, size: 9, font: fontRegular, color: GRAY });
  y -= 12;
  page.drawText(`${SELLER.email}  ·  ${SELLER.phone}`, { x: margin, y, size: 9, font: fontRegular, color: GRAY });

  // ── INVOICE title (top-right) ──
  const invoiceLabel = data.isRenewal ? 'Faktura (Fornyelse)' : 'Faktura';
  const invTitleWidth = fontBold.widthOfTextAtSize(invoiceLabel, 24);
  page.drawText(invoiceLabel, {
    x: width - margin - invTitleWidth,
    y: height - margin - 10,
    size: 24,
    font: fontBold,
    color: DARK,
  });

  // ── Invoice meta (top-right, below title) ──
  const invNumber = data.invoiceNumber || `AF-${data.paymentId.slice(-8).toUpperCase()}`;
  y = height - margin - 40;
  const metaX = width - margin - 160;

  const metaRows: [string, string][] = [
    ['Fakturanr.', invNumber],
    ['Fakturadato', fmtDateShort(data.paymentDate)],
    ['Betalings-ID', data.paymentId.slice(0, 16) + '…'],
  ];

  for (const [label, value] of metaRows) {
    page.drawText(label, { x: metaX, y, size: 8, font: fontBold, color: GRAY });
    page.drawText(value, { x: metaX + 68, y, size: 9, font: fontRegular, color: DARK });
    y -= 14;
  }

  // ── Divider ──
  y -= 8;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: LIGHT_GRAY });
  y -= 20;

  // ── CUSTOMER block (left) ──
  page.drawText('Faktureres til:', { x: margin, y, size: 8, font: fontBold, color: GRAY });
  y -= 14;
  page.drawText(data.customerCompanyName, { x: margin, y, size: 11, font: fontBold, color: DARK });
  y -= 14;
  if (data.customerAddress) {
    page.drawText(data.customerAddress, { x: margin, y, size: 9, font: fontRegular, color: DARK });
    y -= 12;
  }
  if (data.customerCvr) {
    page.drawText(`CVR-nr.: ${data.customerCvr}`, { x: margin, y, size: 9, font: fontRegular, color: DARK });
    y -= 12;
  }
  page.drawText(data.customerEmail, { x: margin, y, size: 9, font: fontRegular, color: DARK });

  // ── BETALT stamp (right side) ──
  const stampX = width - margin - 110;
  const stampY = y + 20;
  page.drawRectangle({
    x: stampX - 10, y: stampY - 14,
    width: 120, height: 36,
    borderColor: GREEN_STAMP,
    borderWidth: 2,
    opacity: 0.9,
  });
  const betaltText = 'BETALT';
  const betaltW = fontBold.widthOfTextAtSize(betaltText, 22);
  page.drawText(betaltText, {
    x: stampX + (100 - betaltW) / 2,
    y: stampY - 6,
    size: 22,
    font: fontBold,
    color: GREEN_STAMP,
    opacity: 0.85,
  });

  // ── Divider ──
  y -= 20;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: LIGHT_GRAY });
  y -= 16;

  // ── Line items table ──
  const tableX = margin;
  const tableW = contentWidth;
  const colDesc = tableW * 0.44;
  const colPeriod = tableW * 0.24;
  const colUnitPrice = tableW * 0.14;
  const colVat = tableW * 0.08;

  // Table header
  page.drawRectangle({ x: tableX, y: y - 4, width: tableW, height: 20, color: TEAL_LIGHT });
  const headerY = y + 4;
  page.drawText('Beskrivelse', { x: tableX + 8, y: headerY, size: 8, font: fontBold, color: TEAL });
  page.drawText('Periode', { x: tableX + colDesc + 8, y: headerY, size: 8, font: fontBold, color: TEAL });
  page.drawText('Enhedspris', { x: tableX + colDesc + colPeriod + 8, y: headerY, size: 8, font: fontBold, color: TEAL });
  page.drawText('Moms', { x: tableX + colDesc + colPeriod + colUnitPrice + 8, y: headerY, size: 8, font: fontBold, color: TEAL });
  page.drawText('I alt', { x: tableX + colDesc + colPeriod + colUnitPrice + colVat + 8, y: headerY, size: 8, font: fontBold, color: TEAL });
  y -= 24;

  // Single row
  const rowY = y + 3;
  page.drawText(data.planName, { x: tableX + 8, y: rowY, size: 9, font: fontRegular, color: DARK });
  page.drawText(data.period, { x: tableX + colDesc + 8, y: rowY, size: 8, font: fontRegular, color: GRAY });
  // Show unit price per month in "Enhedspris" column (e.g. 145,00 kr.)
  const unitPrice = (data.monthlyPriceDKK != null) ? data.monthlyPriceDKK : (data.bindingMonths && data.bindingMonths > 1 ? data.amountExclVatDKK / data.bindingMonths : data.amountExclVatDKK);
  page.drawText(`${fmt(unitPrice)} kr.`, { x: tableX + colDesc + colPeriod + 8, y: rowY, size: 9, font: fontRegular, color: DARK });
  page.drawText('25%', { x: tableX + colDesc + colPeriod + colUnitPrice + 8, y: rowY, size: 9, font: fontRegular, color: GRAY });
  page.drawText(`${fmt(data.totalDKK)} kr.`, { x: tableX + colDesc + colPeriod + colUnitPrice + colVat + 8, y: rowY, size: 9, font: fontBold, color: DARK });
  y -= 24;

  // Bottom table border
  page.drawLine({ start: { x: tableX, y }, end: { x: tableX + tableW, y }, thickness: 1, color: LIGHT_GRAY });

  // ── Totals block (right-aligned) ──
  y -= 16;
  const totalsX = width - margin - 280;

  // Momsgrundlag with breakdown (e.g. "145,00 kr. × 36 md. = 5.220,00 kr.")
  const basisText = (data.monthlyPriceDKK != null && data.bindingMonths && data.bindingMonths > 0)
    ? `${fmt(data.monthlyPriceDKK)} kr. × ${data.bindingMonths} md. = ${fmt(data.amountExclVatDKK)} kr.`
    : `${fmt(data.amountExclVatDKK)} kr.`;

  // Right-aligned value helper: text RIGHT edge ends at width - margin
  const rightX = width - margin;

  page.drawText('Momsgrundlag (ekscl. moms):', { x: totalsX, y, size: 9, font: fontRegular, color: GRAY });
  const basisTextWidth = fontRegular.widthOfTextAtSize(basisText, 9);
  page.drawText(basisText, { x: rightX - basisTextWidth, y, size: 9, font: fontRegular, color: DARK });
  y -= 16;

  const vatRateText = '25 %';
  page.drawText('Momssats:', { x: totalsX, y, size: 9, font: fontRegular, color: GRAY });
  const vatRateW = fontRegular.widthOfTextAtSize(vatRateText, 9);
  page.drawText(vatRateText, { x: rightX - vatRateW, y, size: 9, font: fontRegular, color: DARK });
  y -= 16;

  const vatAmountText = `${fmt(data.vatDKK)} kr.`;
  page.drawText('Momsbeløb:', { x: totalsX, y, size: 9, font: fontRegular, color: GRAY });
  const vatAmountW = fontRegular.widthOfTextAtSize(vatAmountText, 9);
  page.drawText(vatAmountText, { x: rightX - vatAmountW, y, size: 9, font: fontRegular, color: DARK });
  y -= 4;
  page.drawLine({ start: { x: totalsX, y }, end: { x: rightX, y }, thickness: 1.5, color: TEAL });
  y -= 18;

  const totalText = `${fmt(data.totalDKK)} kr.`;
  page.drawText('I alt (inkl. moms):', { x: totalsX, y, size: 11, font: fontBold, color: DARK });
  const totalW = fontBold.widthOfTextAtSize(totalText, 12);
  page.drawText(totalText, { x: rightX - totalW, y, size: 12, font: fontBold, color: TEAL });

  // ── Payment info section ──
  y -= 36;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: LIGHT_GRAY });
  y -= 18;

  page.drawText('Betalingsoplysninger', { x: margin, y, size: 10, font: fontBold, color: DARK });
  y -= 16;
  page.drawText(`Betalingsmetode: ${data.cardLast4 ? `Kort •••• ${data.cardLast4}` : 'Betalingskort'}`, { x: margin, y, size: 9, font: fontRegular, color: GRAY });
  y -= 13;
  page.drawText(`Dato betalt: ${fmtDate(data.paymentDate)}`, { x: margin, y, size: 9, font: fontRegular, color: GRAY });
  y -= 13;
  page.drawText(`Reference: ${data.paymentId}`, { x: margin, y, size: 8, font: fontItalic, color: GRAY });

  // ── Bank details section ──
  y -= 28;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.5, color: LIGHT_GRAY });
  y -= 14;
  page.drawText('Bankoplysninger (AlphaAI Consult ApS)', { x: margin, y, size: 8, font: fontBold, color: GRAY });
  y -= 12;
  page.drawText(`${SELLER.bankName}`, { x: margin, y, size: 8, font: fontRegular, color: GRAY });
  y -= 11;
  page.drawText(`${SELLER.bankAddress}`, { x: margin, y, size: 8, font: fontRegular, color: GRAY });
  y -= 11;
  page.drawText(`Reg.nr.: ${SELLER.bankReg}  ·  Kontonr.: ${SELLER.bankAccount}`, { x: margin, y, size: 8, font: fontRegular, color: GRAY });

  // ── Footer ──
  y -= 30;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.5, color: TEAL });
  y -= 14;
  page.drawText('Denne faktura er elektronisk genereret og betalt online via AlphaFlow.', { x: margin, y, size: 7, font: fontItalic, color: GRAY });
  y -= 10;
  page.drawText(`${SELLER.name}  ·  CVR-nr. ${SELLER.cvr}  ·  ${SELLER.website}  ·  ${SELLER.email}`, { x: margin, y, size: 7, font: fontRegular, color: GRAY });

  // ── PDF Metadata ──
  doc.setTitle(`Faktura ${invNumber} — ${data.customerCompanyName}`);
  doc.setAuthor(SELLER.name);
  doc.setSubject(`Faktura for ${data.planName}`);
  doc.setCreator('AlphaFlow Regnskab & Bogføring');
  doc.setProducer('AlphaFlow');

  return doc.save();
}
