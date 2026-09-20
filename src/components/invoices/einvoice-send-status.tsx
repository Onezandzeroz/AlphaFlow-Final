'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@/lib/use-translation';
import { useDataVersion } from '@/hooks/use-data-version';
import { formatCurrency } from '@/lib/currency-utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Inbox,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Globe,
  ChevronDown,
  ChevronUp,
  Send,
  FileText,
  FileMinus,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { da, enGB } from 'date-fns/locale';

// ── Types ──────────────────────────────────────────────────────────

interface EInvoiceSendingRecord {
  id: string;
  channel: string;
  format: string;
  recipientName: string;
  recipientCvr: string | null;
  status: string;
  sproomRawStatus?: string | null;
  sentAt: string | null;
  inTransitAt?: string | null;
  deliveredAt: string | null;
  pendingApprovalAt?: string | null;
  acceptedAt: string | null;
  rejectedAt?: string | null;
  paidAt?: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  retryCount: number;
  maxRetries: number;
  nextRetryAt: string | null;
  messageId: string | null;
  createdAt: string;
  // ── NEW: event timeline (returned by /api/invoices/[id]/einvoice-sends) ──
  events?: EInvoiceSendEventRecord[];
}

// ── NEW: Event timeline entry (one row per Sproom state transition) ──
interface EInvoiceSendEventRecord {
  id: string;
  status: string;
  sproomRawState?: string | null;
  sproomStatusCode?: number | null;
  deliveryType?: string | null;
  message?: string | null;
  failedProperties?: Array<{
    name?: string | null;
    attemptedValue?: string | null;
    validationRules?: Array<{ rule?: string | null }>;
  }> | null;
  source: string;
  eventTimestamp: string;
  createdAt: string;
}

interface ReceivedInvoiceRecord {
  id: string;
  supplierName: string;
  supplierCvr: string | null;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string | null;
  currencyCode: string;
  format: string;
  documentType: string;
  customizationId: string | null;
  status: string;
  readAt: string | null;
  payableAmount: number;
  taxExclusiveAmount: number;
  taxAmount: number;
  taxInclusiveAmount: number;
  createdAt: string;
  notes: string | null;
}

interface EInvoiceSendStatusProps {
  invoiceId: string;
}

// ── Status config ──────────────────────────────────────────────────

function getStatusConfig(status: string, isDa: boolean) {
  const configs: Record<string, { label: string; colorClass: string; icon: React.ReactNode }> = {
    PENDING: {
      label: isDa ? 'Afventer' : 'Pending',
      colorClass: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800/40',
      icon: <Clock className="h-3 w-3" />,
    },
    QUEUED: {
      label: isDa ? 'I kø' : 'Queued',
      colorClass: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800/40',
      icon: <Clock className="h-3 w-3" />,
    },
    SENDING: {
      label: isDa ? 'Sender' : 'Sending',
      colorClass: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800/40',
      icon: <Send className="h-3 w-3" />,
    },
    // ── NEW: SENT — Sproom accepted the XML (201 Created) ──
    SENT: {
      label: isDa ? 'Afsendt' : 'Sent',
      colorClass: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800/40',
      icon: <Send className="h-3 w-3" />,
    },
    // ── NEW: IN_TRANSIT — Sproom is transmitting to recipient AP ──
    IN_TRANSIT: {
      label: isDa ? 'Undervejs' : 'In transit',
      colorClass: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800/40',
      icon: <Globe className="h-3 w-3" />,
    },
    DELIVERED: {
      label: isDa ? 'Leveret' : 'Delivered',
      colorClass: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800/40',
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
    // ── NEW: PENDING_APPROVAL — recipient has the doc, awaiting accept/reject ──
    PENDING_APPROVAL: {
      label: isDa ? 'Afventer godk.' : 'Pending approval',
      colorClass: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800/40',
      icon: <Clock className="h-3 w-3" />,
    },
    ACCEPTED: {
      label: isDa ? 'Accepteret' : 'Accepted',
      colorClass: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800/40',
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
    // ── NEW: PAID — synthesised when Invoice marked PAID locally ──
    PAID: {
      label: isDa ? 'Betalt' : 'Paid',
      colorClass: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/40',
      icon: <ShieldCheck className="h-3 w-3" />,
    },
    FAILED: {
      label: isDa ? 'Fejlet' : 'Failed',
      colorClass: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800/40',
      icon: <XCircle className="h-3 w-3" />,
    },
    REJECTED: {
      label: isDa ? 'Afvist' : 'Rejected',
      colorClass: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800/40',
      icon: <XCircle className="h-3 w-3" />,
    },
    CANCELLED: {
      label: isDa ? 'Annulleret' : 'Cancelled',
      colorClass: 'bg-gray-100 dark:bg-gray-900/30 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700/40',
      icon: <XCircle className="h-3 w-3" />,
    },
    // Inbound ReceivedInvoice statuses
    RECEIVED: {
      label: isDa ? 'Modtaget' : 'Received',
      colorClass: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800/40',
      icon: <Clock className="h-3 w-3" />,
    },
    APPROVED: {
      label: isDa ? 'Accepteret' : 'Approved',
      colorClass: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800/40',
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
    POSTED: {
      label: isDa ? 'Bogført' : 'Posted',
      colorClass: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800/40',
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
    // ── NEW: SETTLED — was missing in the old config (showed as PENDING default) ──
    SETTLED: {
      label: isDa ? 'Afregnet' : 'Settled',
      colorClass: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/40',
      icon: <ShieldCheck className="h-3 w-3" />,
    },
  };
  return configs[status] || configs.PENDING;
}

function getChannelIcon(channel: string) {
  // Sproom is the only Access Point now — both channels (Auto / Peppol)
  // route through sproomClient. Use the same icon; the label differentiates.
  return <Globe className="h-3.5 w-3.5 text-blue-500" />;
}

function getChannelLabel(channel: string, isDa: boolean) {
  // Sproom Auto (alias 'STORECOVE' / 'OIOUBL' / 'NEMHANDEL') — auto-selects
  // OIOUBL for Danish recipients, Peppol BIS 3 for international.
  // Sproom Peppol (alias 'PEPPOL' / 'PEPPOL_BIS') — forces Peppol BIS 3.
  if (
    channel === 'OIOUBL' ||
    channel === 'NEMHANDEL' ||
    channel === 'NEMHANDEL_OIOUBL' ||
    channel === 'STORECOVE'
  ) {
    return isDa ? 'Sproom (Auto)' : 'Sproom (Auto)';
  }
  if (channel === 'PEPPOL' || channel === 'PEPPOL_BIS') {
    return isDa ? 'Sproom (Peppol)' : 'Sproom (Peppol)';
  }
  return channel;
}

// Inbound format label (for received invoices)
function getReceiveFormatLabel(format: string): string {
  if (format === 'OIOUBL') return 'OIOUBL';
  if (format === 'PEPPOL_BIS') return 'Peppol BIS';
  return format;
}

// Document type icon for received invoices (Invoice / Credit note)
function getDocumentTypeIcon(docType: string) {
  if (docType === 'CREDIT_NOTE') {
    return <FileMinus className="h-3.5 w-3.5 text-amber-500" />;
  }
  if (docType === 'CORRECTED' || docType === 'SELF_BILLED') {
    return <FileText className="h-3.5 w-3.5 text-blue-500" />;
  }
  // INVOICE (default)
  return <FileText className="h-3.5 w-3.5 text-muted-foreground" />;
}

function getDocumentTypeLabel(docType: string, isDa: boolean) {
  switch (docType) {
    case 'CREDIT_NOTE':
      return isDa ? 'Kreditnota' : 'Credit note';
    case 'CORRECTED':
      return isDa ? 'Korrigeret' : 'Corrected';
    case 'SELF_BILLED':
      return isDa ? 'Selvfaktura' : 'Self-billed';
    case 'INVOICE':
    default:
      return isDa ? 'Faktura' : 'Invoice';
  }
}

// ── Component ──────────────────────────────────────────────────────

export function EInvoiceSendStatus({ invoiceId }: EInvoiceSendStatusProps) {
  const { language } = useTranslation();
  const isDa = language === 'da';
  const locale = isDa ? da : enGB;

  // ── State ──
  const [records, setRecords] = useState<EInvoiceSendingRecord[]>([]);
  const [receivedRecords, setReceivedRecords] = useState<ReceivedInvoiceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [isLiveUpdating, setIsLiveUpdating] = useState(false);

  // ── Real-time refresh trigger ──
  // Subscribe to the 'einvoice-sends' data-sync scope. The Sproom webhook
  // handler calls notifyDataChange({ scope: 'einvoice-sends' }) when a
  // DocumentStatusChanged event arrives (delivered/accepted/rejected).
  // This bumps the version number → triggers the useEffect below →
  // fetches the latest status. Combined with the 15s polling fallback,
  // the dialog stays live without manual refreshes.
  const einvoiceSendsVersion = useDataVersion('einvoice-sends');
  const receivedInvoicesVersion = useDataVersion('received-invoices');

  // ── Fetch send + receive history ──
  const fetchHistory = useCallback(async (isLiveUpdate = false) => {
    if (isLiveUpdate) setIsLiveUpdating(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/einvoice-sends`);
      if (res.ok) {
        const data = await res.json();
        // Backward compat: support both `einvoiceSends` (canonical) and the
        // legacy `sends` / `records` field names (the API now returns
        // `einvoiceSends` + `receivedInvoices`).
        setRecords(data.einvoiceSends || data.sends || data.records || []);
        setReceivedRecords(data.receivedInvoices || []);
      }
    } catch (err) {
      console.error('Failed to fetch e-invoice send history:', err);
    } finally {
      setIsLoading(false);
      setIsLiveUpdating(false);
    }
  }, [invoiceId]);

  // Initial fetch + re-fetch on data-version bumps (real-time WS updates).
  useEffect(() => {
    fetchHistory();
  }, [fetchHistory, einvoiceSendsVersion, receivedInvoicesVersion]);

  // Polling fallback (every 15s) — covers cases where the WS connection
  // isn't established, or the user is on a flaky network. Stops when the
  // component unmounts (dialog closed).
  useEffect(() => {
    const interval = setInterval(() => {
      fetchHistory(true);
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchHistory]);

  // ── Retry failed send ──
  const handleRetry = useCallback(async (record: EInvoiceSendingRecord) => {
    if (record.retryCount >= record.maxRetries) {
      toast.error(
        isDa ? 'Maksimalt antal forsøg nået' : 'Maximum retry attempts reached',
        {
          description: isDa
            ? `Denne e-faktura har allerede blevet forsøgt sendt ${record.maxRetries} gange.`
            : `This e-invoice has already been attempted ${record.maxRetries} times.`,
        },
      );
      return;
    }

    setRetryingId(record.id);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/einvoice-sends/${record.id}/retry`, {
        method: 'POST',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || (isDa ? 'Kunne ikke gentage afsendelse' : 'Failed to retry'));
      }

      toast.success(
        isDa ? 'Afsendelse gentaget' : 'Send retried',
        {
          description: isDa
            ? 'E-fakturaen er sat i kø til ny afsendelse.'
            : 'The e-invoice has been queued for re-sending.',
        },
      );
      fetchHistory();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : (isDa ? 'Kunne ikke gentage' : 'Failed to retry'),
      );
    } finally {
      setRetryingId(null);
    }
  }, [invoiceId, isDa, fetchHistory]);

  // ── Loading state ──
  if (isLoading) {
    return (
      <Card className="stat-card border-0 shadow-lg">
        <CardContent className="p-4 lg:p-6">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 text-[#0d9488] animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Combined empty state (both sends AND receives empty) ──
  if (records.length === 0 && receivedRecords.length === 0) {
    return (
      <Card className="stat-card border-0 shadow-lg">
        <CardContent className="p-4 lg:p-6">
          <div className="flex flex-col items-center justify-center py-8 text-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center">
              <Inbox className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium text-sm">
                {isDa ? 'Ingen e-faktura historik' : 'No e-invoice history'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {isDa
                  ? 'Denne faktura er endnu ikke sendt eller modtaget som e-faktura.'
                  : 'This invoice has not yet been sent or received as an e-invoice.'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="stat-card border-0 shadow-lg">
      <CardContent className="p-0">
        {/* Title bar */}
        <div className="px-4 lg:px-6 py-3 border-b border-gray-100 dark:border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              {isDa ? 'Afsendelseshistorik' : 'Send history'}
            </h3>
            <Badge variant="secondary" className="text-[10px] px-1.5">
              {records.length}
            </Badge>
            {/* Live-update indicator — shows when the dialog is auto-refreshing
                (either via WS data-version bump or 15s polling). Pulsates while
                a fetch is in flight, otherwise shows a small green dot to signal
                that the dialog is live-updating. */}
            <span
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
              title={isDa ? 'Opdaterer automatisk' : 'Auto-refreshing'}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${isLiveUpdating ? 'bg-blue-500 animate-pulse' : 'bg-green-500'}`} />
              {isDa ? 'Live' : 'Live'}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground"
            onClick={() => fetchHistory()}
          >
            <RefreshCw className={isLiveUpdating ? 'h-3 w-3 mr-1 animate-spin' : 'h-3 w-3 mr-1'} />
            {isDa ? 'Opdater' : 'Refresh'}
          </Button>
        </div>

        {/* Send table — or its own empty state */}
        {records.length === 0 ? (
          <div className="px-4 lg:px-6 py-6 text-center">
            <p className="text-xs text-muted-foreground">
              {isDa ? 'Ingen e-faktura afsendelser' : 'No e-invoice sends'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs uppercase tracking-wide">
                    {isDa ? 'Kanal' : 'Channel'}
                  </TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-center">
                    {isDa ? 'Status' : 'Status'}
                  </TableHead>
                  <TableHead className="text-xs uppercase tracking-wide hidden sm:table-cell">
                    {isDa ? 'Sendt' : 'Sent'}
                  </TableHead>
                  <TableHead className="text-xs uppercase tracking-wide hidden md:table-cell">
                    {isDa ? 'Leveret' : 'Delivered'}
                  </TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-right">
                    {isDa ? 'Handling' : 'Action'}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((record) => {
                  const statusConfig = getStatusConfig(record.status, isDa);
                  const isExpanded = expandedRow === record.id;
                  const isFailed = record.status === 'FAILED' || record.status === 'REJECTED';
                  const canRetry = isFailed && record.retryCount < record.maxRetries;

                  return (
                    <TableRow key={record.id} className="group">
                      {/* Channel */}
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {getChannelIcon(record.channel)}
                          <span className="text-xs font-medium">
                            {getChannelLabel(record.channel, isDa)}
                          </span>
                        </div>
                      </TableCell>

                      {/* Status */}
                      <TableCell className="text-center">
                        <Badge className={`${statusConfig.colorClass} text-[10px] font-medium gap-1 border`}>
                          {statusConfig.icon}
                          {statusConfig.label}
                        </Badge>
                      </TableCell>

                      {/* Sent */}
                      <TableCell className="hidden sm:table-cell">
                        {record.sentAt ? (
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(record.sentAt), 'dd.MM.yyyy HH:mm', { locale })}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      {/* Delivered */}
                      <TableCell className="hidden md:table-cell">
                        {record.deliveredAt ? (
                          <span className="text-xs text-green-600 dark:text-green-400">
                            {format(new Date(record.deliveredAt), 'dd.MM.yyyy HH:mm', { locale })}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      {/* Action */}
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Retry button for failed */}
                          {canRetry && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20 gap-1"
                              onClick={() => handleRetry(record)}
                              disabled={retryingId === record.id}
                            >
                              {retryingId === record.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <RefreshCw className="h-3 w-3" />
                              )}
                              {isDa ? 'Forsøg igen' : 'Retry'}
                            </Button>
                          )}

                          {/* Expand/collapse for error details */}
                          {(record.errorMessage || record.errorCode || record.messageId) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => setExpandedRow(isExpanded ? null : record.id)}
                            >
                              {isExpanded ? (
                                <ChevronUp className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Expanded detail rows for sends */}
        {records.map((record) => {
          const isExpanded = expandedRow === record.id;
          if (!isExpanded) return null;

          return (
            <div
              key={`detail-${record.id}`}
              className="border-t border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-white/[0.02] px-4 lg:px-6 py-3"
            >
              <div className="space-y-2 text-xs">
                {/* Error info */}
                {record.errorCode && (
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-medium text-amber-700 dark:text-amber-400">
                        {isDa ? 'Fejlkode' : 'Error code'}: {record.errorCode}
                      </span>
                    </div>
                  </div>
                )}
                {record.errorMessage && (
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                    <span className="text-red-700 dark:text-red-400">
                      {record.errorMessage}
                    </span>
                  </div>
                )}

                {/* Message ID */}
                {record.messageId && (
                  <div className="flex items-start gap-2">
                    <span className="text-muted-foreground">{isDa ? 'Besked-ID' : 'Message ID'}:</span>
                    <code className="font-mono text-[10px] break-all">{record.messageId}</code>
                  </div>
                )}

                {/* Retry info */}
                {record.retryCount > 0 && (
                  <div className="flex items-start gap-2">
                    <RefreshCw className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">
                      {isDa
                        ? `Forsøgt ${record.retryCount} af ${record.maxRetries} gange`
                        : `Attempted ${record.retryCount} of ${record.maxRetries} times`}
                    </span>
                  </div>
                )}

                {/* Next retry */}
                {record.nextRetryAt && (
                  <div className="flex items-start gap-2">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">
                      {isDa ? 'Næste forsøg' : 'Next retry'}:{' '}
                      {format(new Date(record.nextRetryAt), 'dd.MM.yyyy HH:mm', { locale })}
                    </span>
                  </div>
                )}

                {/* Accepted at */}
                {record.acceptedAt && (
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" />
                    <span className="text-green-700 dark:text-green-400">
                      {isDa ? 'Accepteret' : 'Accepted'}:{' '}
                      {format(new Date(record.acceptedAt), 'dd.MM.yyyy HH:mm', { locale })}
                    </span>
                  </div>
                )}

                {/* ── NEW: Event timeline (GAP I-5 fix) ── */}
                {record.events && record.events.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-gray-200 dark:border-white/5">
                    <div className="flex items-center gap-1.5 mb-2 text-muted-foreground font-medium">
                      <Globe className="h-3.5 w-3.5" />
                      <span>{isDa ? 'Tidslinje (Sproom status-historik)' : 'Timeline (Sproom status history)'}</span>
                    </div>
                    <div className="relative pl-4 space-y-2">
                      {/* Vertical line */}
                      <div className="absolute left-[5px] top-1 bottom-1 w-px bg-gray-200 dark:bg-white/10" />
                      {record.events.map((evt, idx) => {
                        const evtConfig = getStatusConfig(evt.status, isDa);
                        const isLast = idx === record.events!.length - 1;
                        return (
                          <div key={evt.id} className="relative flex items-start gap-2">
                            {/* Timeline dot */}
                            <div className={`absolute -left-4 top-1 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-gray-900 ${evtConfig.colorClass.split(' ')[0]}`} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge className={`${evtConfig.colorClass} text-[10px] font-medium gap-1 border`}>
                                  {evtConfig.icon}
                                  {evtConfig.label}
                                </Badge>
                                {evt.sproomRawState && (
                                  <code className="text-[10px] text-muted-foreground font-mono">
                                    {evt.sproomRawState}
                                  </code>
                                )}
                                {evt.sproomStatusCode != null && (
                                  <span className="text-[10px] text-muted-foreground">
                                    #{evt.sproomStatusCode}
                                  </span>
                                )}
                                {evt.deliveryType && (
                                  <span className="text-[10px] text-muted-foreground uppercase">
                                    {evt.deliveryType}
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-muted-foreground mt-0.5">
                                {format(new Date(evt.eventTimestamp), 'dd.MM.yyyy HH:mm:ss', { locale })}
                                {!isLast && (
                                  <span className="ml-2 opacity-50">→</span>
                                )}
                              </div>
                              {evt.message && (
                                <div className="text-[11px] text-muted-foreground mt-0.5 break-words">
                                  {evt.message}
                                </div>
                              )}
                              {/* Schematron validation errors — show as list */}
                              {evt.failedProperties && evt.failedProperties.length > 0 && (
                                <div className="mt-1 space-y-1">
                                  {evt.failedProperties.map((fp, fpIdx) => (
                                    <div key={fpIdx} className="text-[10px] text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded px-2 py-1">
                                      <span className="font-mono font-medium">
                                        {fp.validationRules?.[0]?.rule || fp.name || 'Validation error'}
                                      </span>
                                      {fp.attemptedValue && (
                                        <span className="ml-2 opacity-70">
                                          ({isDa ? 'værdi' : 'value'}: <code>{fp.attemptedValue}</code>)
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                              {/* Source badge */}
                              <div className="text-[9px] text-muted-foreground/70 mt-0.5 uppercase tracking-wide">
                                {evt.source === 'sproom_webhook' && (isDa ? 'Webhook' : 'Webhook')}
                                {evt.source === 'sproom_poller' && (isDa ? 'Poller' : 'Poller')}
                                {evt.source === 'local_send' && (isDa ? 'Lokal afsendelse' : 'Local send')}
                                {evt.source === 'local_paid' && (isDa ? 'Lokal betaling' : 'Local paid')}
                                {evt.source === 'local_retry' && (isDa ? 'Lokalt forsøg' : 'Local retry')}
                                {evt.source === 'local_cancel' && (isDa ? 'Lokal annullering' : 'Local cancel')}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Recipient detail */}
                {record.recipientName && (
                  <div className="flex items-start gap-2">
                    <span className="text-muted-foreground">{isDa ? 'Modtager' : 'Recipient'}:</span>
                    <span>
                      {record.recipientName}
                      {record.recipientCvr ? ` (CVR: ${record.recipientCvr})` : ''}
                    </span>
                  </div>
                )}

                {/* Format */}
                <div className="flex items-start gap-2">
                  <span className="text-muted-foreground">{isDa ? 'Format' : 'Format'}:</span>
                  <span>{record.format}</span>
                </div>
              </div>
            </div>
          );
        })}

        {/* ─── Received e-invoices section ─────────────────────────────── */}
        <div className="border-t border-gray-100 dark:border-white/5">
          {/* Section title */}
          <div className="px-4 lg:px-6 py-3 border-b border-gray-100 dark:border-white/5 flex items-center gap-2">
            <Inbox className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              {isDa ? 'Modtagne e-fakturaer' : 'Received e-invoices'}
            </h3>
            <Badge variant="secondary" className="text-[10px] px-1.5">
              {receivedRecords.length}
            </Badge>
          </div>

          {/* Received table — or its own empty state */}
          {receivedRecords.length === 0 ? (
            <div className="px-4 lg:px-6 py-6 text-center">
              <p className="text-xs text-muted-foreground">
                {isDa ? 'Ingen modtagne e-fakturaer' : 'No received e-invoices'}
              </p>
            </div>
          ) : (
            <div>
              {/* No max-h-96 here — the dialog's own max-h-[85vh]
                  overflow-y-auto handles the scroll for the entire
                  content. A nested max-h-96 here would clip the table
                  at 384px regardless of viewport size. */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs uppercase tracking-wide">
                      {isDa ? 'Type' : 'Type'}
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wide">
                      {isDa ? 'Afsender' : 'Supplier'}
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wide hidden sm:table-cell">
                      {isDa ? 'Nr.' : 'No.'}
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wide hidden md:table-cell">
                      {isDa ? 'Format' : 'Format'}
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-center">
                      {isDa ? 'Status' : 'Status'}
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wide hidden lg:table-cell">
                      {isDa ? 'Modtaget' : 'Received'}
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-right">
                      {isDa ? 'Beløb' : 'Amount'}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receivedRecords.map((record) => {
                    const statusConfig = getStatusConfig(record.status, isDa);
                    return (
                      <TableRow key={record.id} className="group">
                        {/* Type icon */}
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            {getDocumentTypeIcon(record.documentType)}
                            <span className="text-xs font-medium hidden sm:inline">
                              {getDocumentTypeLabel(record.documentType, isDa)}
                            </span>
                          </div>
                        </TableCell>

                        {/* Supplier name */}
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-medium truncate max-w-[180px]">
                              {record.supplierName}
                            </span>
                            {record.supplierCvr && (
                              <span className="text-[10px] text-muted-foreground">
                                CVR: {record.supplierCvr}
                              </span>
                            )}
                            {/* Auto-received badge */}
                            {record.notes && (
                              record.notes.includes('Sproom webhook') ||
                              record.notes.includes('ap_webhook') ||
                              record.notes.includes('Storecove webhook')
                            ) && (
                              <Badge
                                variant="outline"
                                className="mt-0.5 w-fit text-[9px] py-0 px-1.5 font-normal text-emerald-700 border-emerald-300 bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:bg-emerald-950/40"
                                title={record.notes}
                              >
                                <ShieldCheck className="h-2.5 w-2.5 mr-0.5" />
                                Auto
                              </Badge>
                            )}
                          </div>
                        </TableCell>

                        {/* Invoice number */}
                        <TableCell className="hidden sm:table-cell">
                          <span className="text-xs font-mono">{record.invoiceNumber}</span>
                        </TableCell>

                        {/* Format */}
                        <TableCell className="hidden md:table-cell">
                          <span className="text-xs text-muted-foreground">
                            {getReceiveFormatLabel(record.format)}
                          </span>
                        </TableCell>

                        {/* Status */}
                        <TableCell className="text-center">
                          <Badge className={`${statusConfig.colorClass} text-[10px] font-medium gap-1 border`}>
                            {statusConfig.icon}
                            {statusConfig.label}
                          </Badge>
                        </TableCell>

                        {/* Received date */}
                        <TableCell className="hidden lg:table-cell">
                          {record.createdAt ? (
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(record.createdAt), 'dd.MM.yyyy HH:mm', { locale })}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>

                        {/* Amount */}
                        <TableCell className="text-right">
                          <span className="text-xs font-medium tabular-nums">
                            {formatCurrency(record.payableAmount, record.currencyCode)}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
