'use client';

import { useState } from 'react';
import { useLanguageStore } from '@/lib/language-store';
import { useTranslation } from '@/lib/use-translation';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Inbox, FileMinus, CheckCircle, ArrowDownCircle, ArrowUpCircle, ChevronDown, Code2, FileCode2 } from 'lucide-react';

export interface ReceivedInvoice {
  id: string;
  invoiceNumber: string;
  supplierName: string;
  supplierCvr: string | null;
  issueDate: string;
  dueDate: string | null;
  payableAmount: number | string;
  taxAmount: number | string;
  taxExclusiveAmount: number | string;
  currencyCode: string;
  format: string; // OIOUBL | PEPPOL_BIS
  documentType: string; // INVOICE | CREDIT_NOTE | CORRECTED | SELF_BILLED
  status: string; // POSTED | SETTLED (afregnet)
  journalEntryId: string | null;
  postedAt: string | null;
  settledAt: string | null; // when bank recon matched the payment
  createdAt: string;
  /** Raw XML received from Sproom (Peppol BIS / OIOUBL). Shown in "Rå XML" dialog. */
  rawXml?: string | null;
  /** Generated response XML (InvoiceResponse / ApplicationResponse / MLR). Shown in "Svar XML" dialog. */
  responseXml?: string | null;
  /** Type of the generated response: INVOICE_RESPONSE | APPLICATION_RESPONSE | MESSAGE_LEVEL_RESPONSE */
  responseType?: string | null;
}

interface PostedEInvoicesListProps {
  /** Pre-fetched + pre-filtered posted e-invoices to display.
   *  The parent (PosteringerPage) owns the fetch + filtering. */
  invoices: ReceivedInvoice[];
}

/**
 * Table view for posted received e-invoices (purchases). This is a "dumb"
 * component — it receives pre-filtered data from the parent and renders the
 * table + mobile cards. Stats cards + tab counts live in the parent
 * (PosteringerPage) so they match the Salg & Faktura layout.
 *
 * Green/red money-flow convention:
 *   - E-faktura (purchase):     red (money out)
 *   - E-kreditnota (reversal):  green (money back in)
 */
export function PostedEInvoicesList({ invoices }: PostedEInvoicesListProps) {
  const { language } = useLanguageStore();
  const { tc, td } = useTranslation();
  const isDa = language === 'da';

  // State for the XML dialog — when set, shows a modal with Raw XML + Response XML
  const [xmlDialogInvoice, setXmlDialogInvoice] = useState<ReceivedInvoice | null>(null);

  // Sort by issue date descending
  const sorted = [...invoices].sort(
    (a, b) => new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime()
  );

  if (sorted.length === 0) {
    return (
      <div className="p-3 lg:p-6">
        <Card className="stat-card">
          <CardContent className="p-0">
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Inbox className="h-10 w-10 text-gray-300 dark:text-gray-600" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {isDa ? 'Ingen bogførte e-fakturaer' : 'No posted e-invoices'}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {isDa
                  ? 'Når du bogfører en e-faktura i indbakken, vises den her'
                  : 'When you post an e-invoice from the inbox, it appears here'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-3 lg:p-6">
      <Card className="stat-card border-0 shadow-lg">
        <CardContent className="p-0">
          {/* Desktop table */}
          <div className="hidden lg:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 dark:bg-gray-700/50">
                  <TableHead className="w-[50px]"></TableHead>
                  <TableHead>{isDa ? 'Leverandør' : 'Supplier'}</TableHead>
                  <TableHead>{isDa ? 'Faktura nr.' : 'Invoice no.'}</TableHead>
                  <TableHead>{isDa ? 'Dato' : 'Date'}</TableHead>
                  <TableHead className="text-right">{isDa ? 'Beløb' : 'Amount'}</TableHead>
                  <TableHead>{isDa ? 'Format' : 'Format'}</TableHead>
                  <TableHead>{isDa ? 'Status' : 'Status'}</TableHead>
                  <TableHead className="w-[80px] text-right">{isDa ? 'XML' : 'XML'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((ri) => {
                  const isCreditNote =
                    ri.documentType === 'CREDIT_NOTE' || ri.documentType === 'SELF_BILLED';
                  const amount = Number(ri.payableAmount) || 0;
                  const signedAmount = isCreditNote ? -amount : amount;
                  const hasAnyXml = ri.rawXml || ri.responseXml;
                  return (
                    <TableRow key={ri.id} className="border-b border-gray-50/50 table-row-teal-hover">
                      <TableCell>
                        {isCreditNote ? (
                          <div className="h-8 w-8 rounded-lg bg-green-50 dark:bg-green-900/20 flex items-center justify-center">
                            <ArrowUpCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                          </div>
                        ) : (
                          // Købsfaktura (received) — pile-ikonet er grønt (received = positivt signal).
                          // Beløb/text forbliver rød (styret af amount-klassen længere nede).
                          <div className="h-8 w-8 rounded-lg bg-green-50 dark:bg-green-900/20 flex items-center justify-center">
                            <ArrowDownCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-medium text-gray-900 dark:text-white">
                        {ri.supplierName}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{ri.invoiceNumber}</TableCell>
                      <TableCell className="text-sm">{td(new Date(ri.issueDate))}</TableCell>
                      <TableCell className={cn(
                        'text-right font-semibold tabular-nums',
                        isCreditNote ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                      )}>
                        {tc(signedAmount)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {ri.format === 'PEPPOL_BIS' ? 'Peppol' : 'OIOUBL'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 flex-wrap">
                          <Badge className="bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300 text-[10px] gap-1 border-green-200 dark:border-green-500/20">
                            <CheckCircle className="h-3 w-3" />
                            {isDa ? 'Bogført' : 'Posted'}
                          </Badge>
                          {ri.status === 'SETTLED' ? (
                            <Badge className="bg-[#0d9488]/10 text-[#0d9488] dark:bg-[#2dd4bf]/10 dark:text-[#2dd4bf] text-[10px] gap-1" title={ri.settledAt ? new Date(ri.settledAt).toLocaleDateString() : undefined}>
                              {isDa ? 'Betalt' : 'Paid'}
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 text-[10px] gap-1 border-amber-500/20">
                              {isDa ? 'Ubetalt' : 'Unpaid'}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs gap-1"
                          disabled={!hasAnyXml}
                          onClick={() => setXmlDialogInvoice(ri)}
                          title={hasAnyXml
                            ? (isDa ? 'Vis XML' : 'View XML')
                            : (isDa ? 'Ingen XML tilgængelig' : 'No XML available')}
                        >
                          <Code2 className="h-3.5 w-3.5" />
                          XML
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="lg:hidden p-3 space-y-3">
            {sorted.map((ri) => {
              const isCreditNote =
                ri.documentType === 'CREDIT_NOTE' || ri.documentType === 'SELF_BILLED';
              const amount = Number(ri.payableAmount) || 0;
              const signedAmount = isCreditNote ? -amount : amount;
              const hasAnyXml = ri.rawXml || ri.responseXml;
              return (
                <div
                  key={ri.id}
                  className="bg-white dark:bg-[#1a1f1e] rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-white/5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate text-gray-900 dark:text-white">
                        {ri.supplierName}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                        {ri.invoiceNumber}
                      </p>
                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                        <Badge className={cn(
                          'text-[10px] px-1.5 py-0 border-0 gap-1',
                          isCreditNote
                            ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                            : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                        )}>
                          {isCreditNote
                            ? (isDa ? <><FileMinus className="h-2.5 w-2.5" /> E-kreditnota</> : <><FileMinus className="h-2.5 w-2.5" /> E-credit note</>)
                            : (isDa ? <><ArrowDownCircle className="h-2.5 w-2.5" /> E-faktura</> : <><ArrowDownCircle className="h-2.5 w-2.5" /> E-invoice</>)}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {ri.format === 'PEPPOL_BIS' ? 'Peppol' : 'OIOUBL'}
                        </Badge>
                        <Badge className="bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300 text-[10px] gap-1 border-green-200 dark:border-green-500/20">
                          {isDa ? 'Bogført' : 'Posted'}
                        </Badge>
                        {ri.status === 'SETTLED' ? (
                          <Badge className="bg-[#0d9488]/10 text-[#0d9488] dark:bg-[#2dd4bf]/10 dark:text-[#2dd4bf] text-[10px] gap-1">
                            {isDa ? 'Betalt' : 'Paid'}
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 text-[10px] gap-1 border-amber-500/20">
                            {isDa ? 'Ubetalt' : 'Unpaid'}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={cn(
                        'text-base font-bold tabular-nums',
                        isCreditNote ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                      )}>
                        {tc(signedAmount)}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {td(new Date(ri.issueDate))}
                      </p>
                    </div>
                  </div>
                  {hasAnyXml && (
                    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-white/5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs gap-1 w-full"
                        onClick={() => setXmlDialogInvoice(ri)}
                      >
                        <Code2 className="h-3.5 w-3.5" />
                        {isDa ? 'Vis XML' : 'View XML'}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* XML Dialog — shows Raw XML + Response XML collapsibles */}
      <Dialog open={!!xmlDialogInvoice} onOpenChange={(open) => { if (!open) setXmlDialogInvoice(null); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          {xmlDialogInvoice && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  <FileCode2 className="h-5 w-5 text-emerald-600" />
                  <span>{xmlDialogInvoice.supplierName}</span>
                  <Badge variant="outline" className="text-[10px] font-mono">
                    {xmlDialogInvoice.invoiceNumber}
                  </Badge>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-3">
                {/* Meta info */}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="outline" className="text-[10px]">
                    {xmlDialogInvoice.format === 'PEPPOL_BIS' ? 'Peppol BIS 3.0' : 'OIOUBL 2.1'}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {xmlDialogInvoice.documentType === 'CREDIT_NOTE'
                      ? (isDa ? 'Kreditnota' : 'Credit note')
                      : (isDa ? 'Faktura' : 'Invoice')}
                  </Badge>
                  <span className="text-muted-foreground">
                    {td(new Date(xmlDialogInvoice.issueDate))}
                  </span>
                  <span className="text-muted-foreground">·</span>
                  <span className="font-semibold tabular-nums">
                    {tc(Number(xmlDialogInvoice.payableAmount) || 0)} {xmlDialogInvoice.currencyCode}
                  </span>
                </div>

                {/* Raw XML (received from Sproom) */}
                {xmlDialogInvoice.rawXml && (
                  <Collapsible defaultOpen={false}>
                    <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                      <ChevronDown className="h-3 w-3" />
                      {isDa ? 'Rå XML (modtaget)' : 'Raw XML (received)'}
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <pre className="mt-2 text-xs bg-muted rounded-lg p-3 overflow-auto max-h-64 font-mono whitespace-pre-wrap break-all">
                        {xmlDialogInvoice.rawXml}
                      </pre>
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {/* Response XML (generated by AlphaFlow after posting) */}
                {xmlDialogInvoice.responseXml && (
                  <Collapsible defaultOpen={true}>
                    <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                      <ChevronDown className="h-3 w-3" />
                      {isDa ? 'Svar XML' : 'Response XML'}
                      {xmlDialogInvoice.responseType && (
                        <Badge variant="outline" className="text-[10px] ml-1 font-mono">
                          {xmlDialogInvoice.responseType}
                        </Badge>
                      )}
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <pre className="mt-2 text-xs bg-muted rounded-lg p-3 overflow-auto max-h-96 font-mono whitespace-pre-wrap break-all">
                        {xmlDialogInvoice.responseXml}
                      </pre>
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        {isDa
                          ? 'Genereret af AlphaFlow ved bogføring (se src/lib/einvoice-response.ts).'
                          : 'Generated by AlphaFlow on posting (see src/lib/einvoice-response.ts).'}
                      </p>
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {!xmlDialogInvoice.rawXml && !xmlDialogInvoice.responseXml && (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    {isDa ? 'Ingen XML tilgængelig for denne faktura.' : 'No XML available for this invoice.'}
                  </p>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
