'use client';

import { useLanguageStore } from '@/lib/language-store';
import { useTranslation } from '@/lib/use-translation';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Inbox, FileMinus, CheckCircle, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';

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
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((ri) => {
                  const isCreditNote =
                    ri.documentType === 'CREDIT_NOTE' || ri.documentType === 'SELF_BILLED';
                  const amount = Number(ri.payableAmount) || 0;
                  const signedAmount = isCreditNote ? -amount : amount;
                  return (
                    <TableRow key={ri.id} className="border-b border-gray-50/50 table-row-teal-hover">
                      <TableCell>
                        {isCreditNote ? (
                          <div className="h-8 w-8 rounded-lg bg-green-50 dark:bg-green-900/20 flex items-center justify-center">
                            <ArrowUpCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                          </div>
                        ) : (
                          <div className="h-8 w-8 rounded-lg bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
                            <ArrowDownCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
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
                          <Badge className="bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300 text-[10px] gap-1">
                            <CheckCircle className="h-3 w-3" />
                            {isDa ? 'Bogført' : 'Posted'}
                          </Badge>
                          {ri.status === 'SETTLED' ? (
                            <Badge className="bg-[#0d9488]/10 text-[#0d9488] dark:bg-[#2dd4bf]/10 dark:text-[#2dd4bf] text-[10px] gap-1" title={ri.settledAt ? new Date(ri.settledAt).toLocaleDateString() : undefined}>
                              {isDa ? 'Afstemt' : 'Matched'}
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 text-[10px] gap-1">
                              {isDa ? 'Uafstemt' : 'Unmatched'}
                            </Badge>
                          )}
                        </div>
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
                        {ri.status === 'SETTLED' ? (
                          <Badge className="bg-[#0d9488]/10 text-[#0d9488] dark:bg-[#2dd4bf]/10 dark:text-[#2dd4bf] text-[10px] gap-1">
                            {isDa ? 'Afstemt' : 'Matched'}
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 text-[10px] gap-1">
                            {isDa ? 'Uafstemt' : 'Unmatched'}
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
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
