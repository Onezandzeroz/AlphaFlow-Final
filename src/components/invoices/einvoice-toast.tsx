'use client';

/**
 * Rich e-invoice toast component.
 *
 * Renders a large, information-rich toast for e-invoice lifecycle events.
 * Shows: document type icon, status badge, counterparty name + CVR,
 * invoice/credit note number, amount + currency, and issue date.
 *
 * Used by hermes-toast.ts via toast.custom() for e-invoice specific toasts.
 * Other toasts (settings, generic actions) use the standard sonner styling.
 */

import { FileText, Receipt, CheckCircle2, XCircle, Clock, Send, Globe, Banknote, Loader2, Ban } from 'lucide-react';
import { format } from 'date-fns';
import { da, enGB } from 'date-fns/locale';

export interface EInvoiceToastData {
  status: string;
  documentType?: string | null;
  counterpartyName?: string | null;
  counterpartyCvr?: string | null;
  invoiceNumber?: string | null;
  amount?: string | null;
  currency?: string | null;
  issueDate?: string | null;
  isDa: boolean;
}

const STATUS_CONFIG: Record<string, {
  label: string;
  labelEn: string;
  colorClass: string;
  icon: React.ReactNode;
}> = {
  PENDING: { label: 'Afventer', labelEn: 'Pending', colorClass: 'bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800', icon: <Clock className="h-4 w-4" /> },
  QUEUED: { label: 'I kø', labelEn: 'Queued', colorClass: 'bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800', icon: <Clock className="h-4 w-4" /> },
  SENDING: { label: 'Afsendes', labelEn: 'Sending', colorClass: 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800', icon: <Loader2 className="h-4 w-4" /> },
  SENT: { label: 'Afsendt', labelEn: 'Sent', colorClass: 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800', icon: <Send className="h-4 w-4" /> },
  IN_TRANSIT: { label: 'Undervejs', labelEn: 'In transit', colorClass: 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800', icon: <Globe className="h-4 w-4" /> },
  DELIVERED: { label: 'Leveret', labelEn: 'Delivered', colorClass: 'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800', icon: <CheckCircle2 className="h-4 w-4" /> },
  PENDING_APPROVAL: { label: 'Afventer godkendelse', labelEn: 'Pending approval', colorClass: 'bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800', icon: <Clock className="h-4 w-4" /> },
  ACCEPTED: { label: 'Godkendt', labelEn: 'Approved', colorClass: 'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800', icon: <CheckCircle2 className="h-4 w-4" /> },
  PAID: { label: 'Betalt', labelEn: 'Paid', colorClass: 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800', icon: <Banknote className="h-4 w-4" /> },
  FAILED: { label: 'Fejlet', labelEn: 'Failed', colorClass: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800', icon: <XCircle className="h-4 w-4" /> },
  REJECTED: { label: 'Afvist', labelEn: 'Rejected', colorClass: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800', icon: <XCircle className="h-4 w-4" /> },
  CANCELLED: { label: 'Annulleret', labelEn: 'Cancelled', colorClass: 'bg-gray-100 text-gray-600 border-gray-300 dark:bg-gray-900/30 dark:text-gray-400 dark:border-gray-700', icon: <Ban className="h-4 w-4" /> },
  RECEIVED: { label: 'Modtaget', labelEn: 'Received', colorClass: 'bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-900/30 dark:text-teal-400 dark:border-teal-800', icon: <FileText className="h-4 w-4" /> },
};

export function EInvoiceToast({ data }: { data: EInvoiceToastData }) {
  const isDa = data.isDa;
  const isCreditNote = (data.documentType ?? '').toUpperCase() === 'CREDIT_NOTE';
  const cfg = STATUS_CONFIG[data.status] ?? STATUS_CONFIG.PENDING;

  const docLabel = isCreditNote
    ? (isDa ? 'E-kreditnota' : 'E-credit note')
    : (isDa ? 'E-faktura' : 'E-invoice');

  const docIcon = isCreditNote
    ? <Receipt className="h-6 w-6 text-violet-500" />
    : <FileText className="h-6 w-6 text-blue-500" />;

  const formattedAmount = data.amount
    ? `${data.amount} ${data.currency ?? 'DKK'}`
    : null;

  const formattedDate = data.issueDate
    ? format(new Date(data.issueDate), 'dd.MM.yyyy', { locale: isDa ? da : enGB })
    : null;

  return (
    <div className="flex flex-col gap-3 w-full p-2">
      {/* Header row: icon + status badge */}
      <div className="flex items-center gap-3">
        <div className={`flex items-center justify-center h-10 w-10 rounded-full shrink-0 ${
          isCreditNote
            ? 'bg-violet-100 dark:bg-violet-900/30'
            : 'bg-blue-100 dark:bg-blue-900/30'
        }`}>
          {docIcon}
        </div>
        <div className="flex flex-col flex-1 min-w-0">
          <span className="text-sm font-semibold text-foreground">
            {docLabel} {isDa ? cfg.label : cfg.labelEn}
          </span>
          <span className="text-xs text-muted-foreground">
            {data.counterpartyName ?? ''}
          </span>
        </div>
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium shrink-0 ${cfg.colorClass}`}>
          {cfg.icon}
          <span>{isDa ? cfg.label : cfg.labelEn}</span>
        </div>
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        {data.invoiceNumber && (
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">{isDa ? 'Nummer' : 'Number'}:</span>
            <span className="font-medium text-foreground">{data.invoiceNumber}</span>
          </div>
        )}
        {data.counterpartyCvr && (
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">CVR:</span>
            <span className="font-medium text-foreground">{data.counterpartyCvr}</span>
          </div>
        )}
        {formattedAmount && (
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">{isDa ? 'Beløb' : 'Amount'}:</span>
            <span className="font-semibold text-foreground tabular-nums">{formattedAmount}</span>
          </div>
        )}
        {formattedDate && (
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">{isDa ? 'Dato' : 'Date'}:</span>
            <span className="font-medium text-foreground">{formattedDate}</span>
          </div>
        )}
      </div>
    </div>
  );
}
