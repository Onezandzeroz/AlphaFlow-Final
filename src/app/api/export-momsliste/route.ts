import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { tenantFilter, Permission } from '@/lib/rbac';
import { computeVATRegister } from '@/lib/vat-utils';
import { withGuard } from '@/lib/route-guard';
import { db } from '@/lib/db';
import { getSaftVatCode } from '@/lib/saft-vat-codes';

/**
 * GET /api/export-momsliste
 *
 * Eksporterer en separat momsliste (VAT list) i CSV- eller XML-format.
 * Dette er den fil der kan indsendes til Skattestyrelsen som supplement
 * til SAF-T-eksporten, eller bruges internt til momsafregning.
 *
 * Query params:
 *   from=YYYY-MM-DD  (required)
 *   to=YYYY-MM-DD    (required)
 *   format=csv|xml   (default: csv)
 */

const formatNumber = (num: number) => num.toFixed(2);

function escapeCsv(value: string): string {
  if (value.includes(';') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export const GET = withGuard(
  { auth: true, requireCompany: true, permissions: [Permission.REPORTS_VIEW] },
  async (request, ctx) => {
    try {
      const { searchParams } = new URL(request.url);
      const fromStr = searchParams.get('from');
      const toStr = searchParams.get('to');
      const format = (searchParams.get('format') || 'csv').toLowerCase();

      if (!fromStr || !toStr) {
        return NextResponse.json(
          { error: 'Missing required query parameters: from and to (YYYY-MM-DD)' },
          { status: 400 },
        );
      }

      const fromDate = new Date(fromStr);
      const toDate = new Date(toStr);
      toDate.setHours(23, 59, 59, 999);

      if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
        return NextResponse.json(
          { error: 'Invalid date format. Use YYYY-MM-DD.' },
          { status: 400 },
        );
      }

      const vatResult = await computeVATRegister({
        ...tenantFilter(ctx),
        status: 'POSTED',
        cancelled: false,
        date: { gte: fromDate, lte: toDate },
      });

      const company = ctx.activeCompanyId
        ? await db.company.findUnique({
            where: { id: ctx.activeCompanyId },
            select: { name: true, cvrNumber: true },
          })
        : null;
      const companyName = company?.name || ctx.businessName || 'Ukendt';
      const companyCVR = company?.cvrNumber || '';

      const allEntries = [
        ...vatResult.outputVAT.map(v => ({ ...v, direction: 'Udgående' as const })),
        ...vatResult.inputVAT.map(v => ({ ...v, direction: 'Indgående' as const })),
      ].filter(v => v.netAmount !== 0 || v.debitTotal !== 0 || v.creditTotal !== 0);

      const enrichedEntries = allEntries.map(v => {
        const saftCode = getSaftVatCode(v.code);
        return {
          alphaFlowCode: v.code,
          standardCode: saftCode?.standardCode || '',
          description: saftCode?.description || v.code,
          rate: v.rate,
          group: saftCode?.group || '',
          deductible: saftCode?.deductible || '',
          direction: v.direction,
          baseAmount: Math.abs(v.netAmount),
          vatAmount: Math.abs(v.netAmount) * v.rate / 100,
          debitTotal: v.debitTotal,
          creditTotal: v.creditTotal,
        };
      });

      if (format === 'xml') {
        const xml = generateMomslisteXml(
          companyName, companyCVR, fromStr, toStr, enrichedEntries,
          vatResult.totalOutputVAT, vatResult.totalInputVAT, vatResult.netVATPayable,
        );
        return new NextResponse(xml, {
          status: 200,
          headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Content-Disposition': `attachment; filename="momsliste-${fromStr}_til_${toStr}.xml"`,
          },
        });
      }

      const csv = generateMomslisteCsv(
        companyName, companyCVR, fromStr, toStr, enrichedEntries,
        vatResult.totalOutputVAT, vatResult.totalInputVAT, vatResult.netVATPayable,
      );
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="momsliste-${fromStr}_til_${toStr}.csv"`,
        },
      });
    } catch (error) {
      logger.error('[MOMSLISTE EXPORT] Error:', error);
      return NextResponse.json(
        { error: 'Failed to generate momsliste', details: error instanceof Error ? error.message : 'Unknown error' },
        { status: 500 },
      );
    }
  },
);

interface MomslisteEntry {
  alphaFlowCode: string;
  standardCode: string;
  description: string;
  rate: number;
  group: string;
  deductible: string;
  direction: string;
  baseAmount: number;
  vatAmount: number;
  debitTotal: number;
  creditTotal: number;
}

function generateMomslisteCsv(
  companyName: string, cvr: string, from: string, to: string,
  entries: MomslisteEntry[], totalOutput: number, totalInput: number, netPayable: number,
): string {
  const lines: string[] = [];
  lines.push(`# Momsliste (VAT List)`);
  lines.push(`# Virksomhed: ${escapeCsv(companyName)}`);
  lines.push(`# CVR: ${cvr}`);
  lines.push(`# Periode: ${from} til ${to}`);
  lines.push(`# Genereret: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('Retning;Momskode;Standardkode;Beskrivelse;Gruppe;Sats%;Grundlag (DKK);Momsbeløb (DKK);Fradragsret;Debet (DKK);Kredit (DKK)');
  for (const e of entries) {
    lines.push([
      e.direction, e.alphaFlowCode, e.standardCode, escapeCsv(e.description),
      escapeCsv(e.group), e.rate.toString(), formatNumber(e.baseAmount),
      formatNumber(e.vatAmount), e.deductible,
      formatNumber(e.debitTotal), formatNumber(e.creditTotal),
    ].join(';'));
  }
  lines.push('');
  lines.push(`# Totaler`);
  lines.push(`# Udgående moms (salg):;${formatNumber(totalOutput)} DKK`);
  lines.push(`# Indgående moms (køb):;${formatNumber(totalInput)} DKK`);
  lines.push(`# Net moms til betaling/refusion:;${formatNumber(netPayable)} DKK`);
  return lines.join('\n');
}

function generateMomslisteXml(
  companyName: string, cvr: string, from: string, to: string,
  entries: MomslisteEntry[], totalOutput: number, totalInput: number, netPayable: number,
): string {
  const ex = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const entryXml = entries.map(e => `    <VATEntry>
      <Direction>${e.direction === 'Udgående' ? 'Output' : 'Input'}</Direction>
      <TaxCode>${ex(e.alphaFlowCode)}</TaxCode>
      <StandardTaxCode>${ex(e.standardCode)}</StandardTaxCode>
      <Description>${ex(e.description)}</Description>
      <Group>${ex(e.group)}</Group>
      <TaxPercentage>${e.rate}</TaxPercentage>
      <BaseAmount>${formatNumber(e.baseAmount)}</BaseAmount>
      <VATAmount>${formatNumber(e.vatAmount)}</VATAmount>
      <Deductible>${ex(e.deductible)}</Deductible>
      <DebitTotal>${formatNumber(e.debitTotal)}</DebitTotal>
      <CreditTotal>${formatNumber(e.creditTotal)}</CreditTotal>
    </VATEntry>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<Momsliste xmlns="urn:alphaflow:momsliste:v1">
  <Header>
    <CompanyName>${ex(companyName)}</CompanyName>
    <CVRNumber>${ex(cvr)}</CVRNumber>
    <PeriodFrom>${from}</PeriodFrom>
    <PeriodTo>${to}</PeriodTo>
    <DateCreated>${new Date().toISOString()}</DateCreated>
  </Header>
  <Entries>
${entryXml}
  </Entries>
  <Totals>
    <TotalOutputVAT>${formatNumber(totalOutput)}</TotalOutputVAT>
    <TotalInputVAT>${formatNumber(totalInput)}</TotalInputVAT>
    <NetVATPayable>${formatNumber(netPayable)}</NetVATPayable>
  </Totals>
</Momsliste>`;
}
