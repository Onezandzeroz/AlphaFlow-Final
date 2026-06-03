'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@/lib/use-translation';
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
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Send,
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
  sentAt: string | null;
  deliveredAt: string | null;
  acceptedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  retryCount: number;
  maxRetries: number;
  nextRetryAt: string | null;
  messageId: string | null;
  createdAt: string;
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
    DELIVERED: {
      label: isDa ? 'Leveret' : 'Delivered',
      colorClass: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800/40',
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
    ACCEPTED: {
      label: isDa ? 'Accepteret' : 'Accepted',
      colorClass: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800/40',
      icon: <CheckCircle2 className="h-3 w-3" />,
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
  };
  return configs[status] || configs.PENDING;
}

function getChannelIcon(channel: string) {
  if (channel === 'OIOUBL' || channel === 'NEMHANDEL') {
    return <ShieldCheck className="h-3.5 w-3.5 text-[#0d9488]" />;
  }
  return <Globe className="h-3.5 w-3.5 text-blue-500" />;
}

function getChannelLabel(channel: string, isDa: boolean) {
  if (channel === 'OIOUBL' || channel === 'NEMHANDEL') {
    return isDa ? 'OIOUBL' : 'OIOUBL';
  }
  if (channel === 'PEPPOL') {
    return 'Peppol BIS';
  }
  return channel;
}

// ── Component ──────────────────────────────────────────────────────

export function EInvoiceSendStatus({ invoiceId }: EInvoiceSendStatusProps) {
  const { language } = useTranslation();
  const isDa = language === 'da';
  const locale = isDa ? da : enGB;

  // ── State ──
  const [records, setRecords] = useState<EInvoiceSendingRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // ── Fetch send history ──
  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/einvoice-sends`);
      if (res.ok) {
        const data = await res.json();
        setRecords(data.sends || data.records || []);
      }
    } catch (err) {
      console.error('Failed to fetch e-invoice send history:', err);
    } finally {
      setIsLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    fetchHistory();
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

  // ── Empty state ──
  if (records.length === 0) {
    return (
      <Card className="stat-card border-0 shadow-lg">
        <CardContent className="p-4 lg:p-6">
          <div className="flex flex-col items-center justify-center py-8 text-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center">
              <Inbox className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium text-sm">
                {isDa ? 'Ingen e-faktura afsendelser' : 'No e-invoice sends'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {isDa
                  ? 'Denne faktura er endnu ikke sendt som e-faktura.'
                  : 'This invoice has not yet been sent as an e-invoice.'}
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
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground"
            onClick={fetchHistory}
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            {isDa ? 'Opdater' : 'Refresh'}
          </Button>
        </div>

        {/* Table */}
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

        {/* Expanded detail rows */}
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
      </CardContent>
    </Card>
  );
}
