'use client';

/**
 * EInvoiceTrackingPage — globalt sporings-view for e-faktura afsendelser.
 *
 * Viser ALLE e-faktura afsendelser for tenant på én side — ikke kun per-
 * invoice. Tenants får et samlet overblik over deres "pipeline":
 *   - Pipeline-statistik (count pr. status)
 *   - Filtre (status, kanal, søgning)
 *   - Tabel med alle sendings + invoice info
 *   - Expandable timeline pr. sending (fra /api/einvoice-sends/[id])
 *
 * Drives af GET /api/einvoice-sends (liste+stats) og GET /api/einvoice-sends/[id]
 * (timeline detail). Real-time opdatering via 'einvoice-sends' data-sync scope
 * (bumpes af webhook-handler når Sproom sender DocumentStatusChanged events).
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@/lib/use-translation';
import { useDataVersion } from '@/hooks/use-data-version';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  Search,
  Activity,
} from 'lucide-react';
import { format } from 'date-fns';
import { da, enGB } from 'date-fns/locale';

// ── Types ──────────────────────────────────────────────────────────

interface EInvoiceSendingSummary {
  id: string;
  invoiceId: string;
  channel: string;
  format: string;
  recipientName: string;
  recipientCvr: string | null;
  recipientEndpointId: string | null;
  status: string;
  sproomRawStatus: string | null;
  sentAt: string | null;
  inTransitAt: string | null;
  deliveredAt: string | null;
  pendingApprovalAt: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
  paidAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  retryCount: number;
  maxRetries: number;
  nextRetryAt: string | null;
  messageId: string | null;
  createdAt: string;
  updatedAt: string;
  invoice: {
    id: string;
    invoiceNumber: string;
    documentType: string;
    total: number;
    currency: string;
    issueDate: string;
    dueDate: string;
    paidDate: string | null;
  };
}

interface EInvoiceSendEventRecord {
  id: string;
  status: string;
  sproomRawState: string | null;
  sproomStatusCode: number | null;
  deliveryType: string | null;
  message: string | null;
  failedProperties: Array<{
    name?: string | null;
    attemptedValue?: string | null;
    validationRules?: Array<{ rule?: string | null }>;
  }> | null;
  source: string;
  eventTimestamp: string;
  createdAt: string;
}

interface EInvoiceTrackingPageProps {
  /** Optional: callback when user clicks an invoice row (to navigate to it). */
  onInvoiceClick?: (invoiceId: string) => void;
}

// ── Status config (mirrors einvoice-send-status.tsx) ────────────────

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
    SENT: {
      label: isDa ? 'Afsendt' : 'Sent',
      colorClass: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800/40',
      icon: <Send className="h-3 w-3" />,
    },
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
  };
  return configs[status] || configs.PENDING;
}

function getDocumentTypeIcon(docType: string) {
  if (docType === 'CREDIT_NOTE') return <FileMinus className="h-3.5 w-3.5 text-amber-500" />;
  return <FileText className="h-3.5 w-3.5 text-muted-foreground" />;
}

function getChannelLabel(channel: string, isDa: boolean) {
  if (channel === 'OIOUBL' || channel === 'NEMHANDEL' || channel === 'NEMHANDEL_OIOUBL' || channel === 'STORECOVE') {
    return isDa ? 'Sproom (Auto)' : 'Sproom (Auto)';
  }
  if (channel === 'PEPPOL' || channel === 'PEPPOL_BIS') {
    return isDa ? 'Sproom (Peppol)' : 'Sproom (Peppol)';
  }
  return channel;
}

// ── Component ──────────────────────────────────────────────────────

export function EInvoiceTrackingPage({ onInvoiceClick }: EInvoiceTrackingPageProps) {
  const { language } = useTranslation();
  const isDa = language === 'da';
  const locale = isDa ? da : enGB;

  // ── State ──
  const [sends, setSends] = useState<EInvoiceSendingSummary[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 1 });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Expanded timeline per sending
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [events, setEvents] = useState<EInvoiceSendEventRecord[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);

  // ── Real-time refresh (WS data-changed event) ──
  const einvoiceSendsVersion = useDataVersion('einvoice-sends');

  // ── Fetch list ──
  const fetchSends = useCallback(async (silent = false) => {
    if (silent) setIsRefreshing(true); else setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: '1',
        limit: '100',
        includeStats: 'true',
      });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (channelFilter !== 'all') params.set('channel', channelFilter);
      if (searchQuery) params.set('search', searchQuery);

      const res = await fetch(`/api/einvoice-sends?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setSends(data.sends || []);
        setStats(data.stats || {});
        setPagination(data.pagination || { page: 1, limit: 50, total: 0, totalPages: 1 });
      }
    } catch (err) {
      console.error('Failed to fetch e-invoice sends:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [statusFilter, channelFilter, searchQuery]);

  useEffect(() => {
    fetchSends();
  }, [fetchSends, einvoiceSendsVersion]);

  // ── Fetch timeline for a sending ──
  const fetchTimeline = useCallback(async (sendingId: string) => {
    setIsLoadingEvents(true);
    try {
      const res = await fetch(`/api/einvoice-sends/${sendingId}`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
      }
    } catch (err) {
      console.error('Failed to fetch timeline:', err);
    } finally {
      setIsLoadingEvents(false);
    }
  }, []);

  const toggleExpand = (sendingId: string) => {
    if (expandedId === sendingId) {
      setExpandedId(null);
      setEvents([]);
    } else {
      setExpandedId(sendingId);
      fetchTimeline(sendingId);
    }
  };

  // ── Pipeline stats cards ──
  const STATUS_ORDER = [
    'PENDING', 'QUEUED', 'SENDING', 'SENT', 'IN_TRANSIT', 'DELIVERED',
    'PENDING_APPROVAL', 'ACCEPTED', 'PAID', 'FAILED', 'REJECTED', 'CANCELLED',
  ];

  const totalSends = Object.values(stats).reduce((sum, n) => sum + n, 0);

  return (
    <div className="space-y-4 p-4 lg:p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-blue-500" />
          <h1 className="text-lg font-semibold">
            {isDa ? 'E-faktura sporing' : 'E-invoice tracking'}
          </h1>
          {totalSends > 0 && (
            <Badge variant="secondary" className="text-xs">
              {totalSends} {isDa ? 'afsendelser total' : 'total sends'}
            </Badge>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchSends(true)}
          disabled={isRefreshing}
          className="gap-1.5"
        >
          {isRefreshing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {isDa ? 'Opdater' : 'Refresh'}
        </Button>
      </div>

      {/* Pipeline stats cards */}
      {!isLoading && totalSends > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {STATUS_ORDER.map((status) => {
            const count = stats[status] || 0;
            if (count === 0) return null;
            const config = getStatusConfig(status, isDa);
            return (
              <button
                key={status}
                onClick={() => setStatusFilter(statusFilter === status ? 'all' : status)}
                className={`text-left p-2.5 rounded-lg border transition-all hover:shadow-sm ${statusFilter === status ? 'ring-2 ring-blue-500 ring-offset-1' : ''} ${config.colorClass}`}
              >
                <div className="flex items-center gap-1.5">
                  {config.icon}
                  <span className="text-[10px] font-medium uppercase tracking-wide">{config.label}</span>
                </div>
                <div className="text-xl font-bold mt-0.5">{count}</div>
              </button>
            );
          })}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            type="text"
            placeholder={isDa ? 'Søg modtager, CVR eller fakturanummer...' : 'Search recipient, CVR or invoice number...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue placeholder={isDa ? 'Status' : 'Status'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{isDa ? 'Alle statusser' : 'All statuses'}</SelectItem>
            {STATUS_ORDER.map((s) => (
              <SelectItem key={s} value={s}>{getStatusConfig(s, isDa).label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={channelFilter} onValueChange={setChannelFilter}>
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue placeholder={isDa ? 'Kanal' : 'Channel'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{isDa ? 'Alle kanaler' : 'All channels'}</SelectItem>
            <SelectItem value="NEMHANDEL_OIOUBL">Sproom (Auto)</SelectItem>
            <SelectItem value="PEPPOL_BIS">Sproom (Peppol)</SelectItem>
            <SelectItem value="STORECOVE">Sproom (Auto - legacy)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Sends table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">
                {isDa ? 'Indlæser afsendelser...' : 'Loading sends...'}
              </span>
            </div>
          ) : sends.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Inbox className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">
                {isDa ? 'Ingen e-faktura afsendelser fundet' : 'No e-invoice sends found'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="min-w-[140px]">{isDa ? 'Faktura' : 'Invoice'}</TableHead>
                    <TableHead className="min-w-[160px]">{isDa ? 'Modtager' : 'Recipient'}</TableHead>
                    <TableHead className="min-w-[110px]">{isDa ? 'Status' : 'Status'}</TableHead>
                    <TableHead className="hidden md:table-cell min-w-[120px]">{isDa ? 'Kanal' : 'Channel'}</TableHead>
                    <TableHead className="hidden sm:table-cell min-w-[110px]">{isDa ? 'Afsendt' : 'Sent'}</TableHead>
                    <TableHead className="hidden lg:table-cell min-w-[110px]">{isDa ? 'Leveret' : 'Delivered'}</TableHead>
                    <TableHead className="hidden xl:table-cell min-w-[110px]">{isDa ? 'Accepteret/Betalt' : 'Accepted/Paid'}</TableHead>
                    <TableHead className="text-right min-w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sends.map((send) => {
                    const statusConfig = getStatusConfig(send.status, isDa);
                    const isExpanded = expandedId === send.id;
                    const displayDate =
                      send.paidAt || send.acceptedAt || send.rejectedAt || send.deliveredAt || send.sentAt;

                    return (
                      <>
                        <TableRow
                          key={send.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => toggleExpand(send.id)}
                        >
                          {/* Invoice */}
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              {getDocumentTypeIcon(send.invoice.documentType)}
                              <div className="min-w-0">
                                <div className="text-xs font-medium truncate">
                                  {send.invoice.invoiceNumber}
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                  {send.invoice.total.toLocaleString('da-DK', { minimumFractionDigits: 2 })} {send.invoice.currency}
                                </div>
                              </div>
                            </div>
                          </TableCell>

                          {/* Recipient */}
                          <TableCell>
                            <div className="min-w-0">
                              <div className="text-xs font-medium truncate">
                                {send.recipientName}
                              </div>
                              {send.recipientCvr && (
                                <div className="text-[10px] text-muted-foreground">
                                  CVR: {send.recipientCvr}
                                </div>
                              )}
                            </div>
                          </TableCell>

                          {/* Status */}
                          <TableCell>
                            <Badge className={`${statusConfig.colorClass} text-[10px] font-medium gap-1 border`}>
                              {statusConfig.icon}
                              {statusConfig.label}
                            </Badge>
                            {send.sproomRawStatus && (
                              <div className="text-[9px] text-muted-foreground mt-0.5 font-mono">
                                {send.sproomRawStatus}
                              </div>
                            )}
                          </TableCell>

                          {/* Channel */}
                          <TableCell className="hidden md:table-cell">
                            <div className="flex items-center gap-1.5">
                              <Globe className="h-3 w-3 text-blue-500" />
                              <span className="text-xs">
                                {getChannelLabel(send.channel, isDa)}
                              </span>
                            </div>
                          </TableCell>

                          {/* Sent */}
                          <TableCell className="hidden sm:table-cell">
                            {send.sentAt ? (
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(send.sentAt), 'dd.MM.yyyy HH:mm', { locale })}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>

                          {/* Delivered */}
                          <TableCell className="hidden lg:table-cell">
                            {send.deliveredAt ? (
                              <span className="text-xs text-green-600 dark:text-green-400">
                                {format(new Date(send.deliveredAt), 'dd.MM.yyyy HH:mm', { locale })}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>

                          {/* Accepted/Paid */}
                          <TableCell className="hidden xl:table-cell">
                            {send.paidAt ? (
                              <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                <ShieldCheck className="h-3 w-3" />
                                {format(new Date(send.paidAt), 'dd.MM.yyyy', { locale })}
                              </span>
                            ) : send.acceptedAt ? (
                              <span className="text-xs text-green-600 dark:text-green-400">
                                {format(new Date(send.acceptedAt), 'dd.MM.yyyy', { locale })}
                              </span>
                            ) : send.rejectedAt ? (
                              <span className="text-xs text-red-600 dark:text-red-400">
                                {format(new Date(send.rejectedAt), 'dd.MM.yyyy', { locale })}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>

                          {/* Expand */}
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => toggleExpand(send.id)}
                            >
                              {isExpanded ? (
                                <ChevronUp className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>

                        {/* Expanded timeline row */}
                        {isExpanded && (
                          <TableRow key={`${send.id}-detail`} className="bg-muted/20">
                            <TableCell colSpan={8} className="p-4">
                              {isLoadingEvents ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  {isDa ? 'Indlæser tidslinje...' : 'Loading timeline...'}
                                </div>
                              ) : events.length === 0 ? (
                                <div className="text-sm text-muted-foreground py-4">
                                  {isDa ? 'Ingen events fundet.' : 'No events found.'}
                                </div>
                              ) : (
                                <div className="space-y-3">
                                  <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                                    <Globe className="h-3.5 w-3.5" />
                                    {isDa ? 'Tidslinje' : 'Timeline'}
                                    <span className="text-xs opacity-70">({events.length} {isDa ? 'events' : 'events'})</span>
                                  </div>
                                  <div className="relative pl-5 space-y-2">
                                    <div className="absolute left-[6px] top-1 bottom-1 w-px bg-gray-200 dark:bg-white/10" />
                                    {events.map((evt, idx) => {
                                      const evtConfig = getStatusConfig(evt.status, isDa);
                                      return (
                                        <div key={evt.id} className="relative flex items-start gap-3">
                                          <div className={`absolute -left-5 top-1.5 h-3 w-3 rounded-full ring-2 ring-white dark:ring-gray-900 ${evtConfig.colorClass.split(' ')[0]}`} />
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
                                              <span className="ml-2 opacity-50 uppercase tracking-wide">{evt.source}</span>
                                            </div>
                                            {evt.message && (
                                              <div className="text-xs text-muted-foreground mt-0.5 break-words">
                                                {evt.message}
                                              </div>
                                            )}
                                            {evt.failedProperties && evt.failedProperties.length > 0 && (
                                              <div className="mt-1 space-y-1">
                                                {evt.failedProperties.map((fp, fpIdx) => (
                                                  <div key={fpIdx} className="text-[10px] text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded px-2 py-1">
                                                    <span className="font-mono font-medium">
                                                      {fp.validationRules?.[0]?.rule || fp.name || 'Validation error'}
                                                    </span>
                                                    {fp.attemptedValue && (
                                                      <span className="ml-2 opacity-70">
                                                        (value: <code>{fp.attemptedValue}</code>)
                                                      </span>
                                                    )}
                                                  </div>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                  {onInvoiceClick && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="mt-2"
                                      onClick={() => onInvoiceClick(send.invoiceId)}
                                    >
                                      {isDa ? 'Åbn faktura' : 'Open invoice'}
                                    </Button>
                                  )}
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
