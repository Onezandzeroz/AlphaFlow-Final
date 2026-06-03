'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { User } from '@/lib/auth-store';
import { useTranslation } from '@/lib/use-translation';
import { useAccessErrorHandler } from '@/hooks/use-access-error-handler';
import { useWriteAccessGuard } from '@/hooks/use-write-access-guard';
import { formatCurrency } from '@/lib/currency-utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Inbox,
  Upload,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  ChevronDown,
  Eye,
  Trash2,
  AlertTriangle,
  Send,
  Search,
  Filter,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { da, enGB } from 'date-fns/locale';

// ── Types ──────────────────────────────────────────────────────────────

interface ReceivedInvoice {
  id: string;
  supplierName: string;
  supplierCvr?: string | null;
  supplierEmail?: string | null;
  supplierPhone?: string | null;
  supplierAddress?: string | null;
  supplierCity?: string | null;
  supplierCountry?: string | null;
  invoiceNumber: string;
  issueDate: string;
  dueDate?: string | null;
  currencyCode: string;
  format: 'OIOUBL' | 'PEPPOL_BIS';
  documentType: 'INVOICE' | 'CREDIT_NOTE' | 'CORRECTED' | 'SELF_BILLED';
  lineItems: any;
  lineCount: number;
  taxExclusiveAmount: number;
  taxAmount: number;
  taxInclusiveAmount: number;
  payableAmount: number;
  paymentMeansCode?: string | null;
  paymentAccountId?: string | null;
  status: 'RECEIVED' | 'APPROVED' | 'REJECTED' | 'POSTED';
  rejectionReason?: string | null;
  rawXml?: string | null;
  responseXml?: string | null;
  responseType?: string | null;
  validationErrors?: string | null;
  validationWarnings?: string | null;
  createdAt: string;
  journalEntryId?: string | null;
}

interface EInvoiceInboxProps {
  user: User;
}

// ── Helper: format amount with invoice currency ────────────────────────

function fmtAmount(amount: number | string, currency: string) {
  return formatCurrency(Number(amount), currency);
}

// ── Component ──────────────────────────────────────────────────────────

export function EInvoiceInbox({ user }: EInvoiceInboxProps) {
  const { language, t, td } = useTranslation();
  const { handleMutationError } = useAccessErrorHandler();
  const { guardWriteAccess } = useWriteAccessGuard(user);
  const locale = language === 'da' ? da : enGB;

  // State
  const [invoices, setInvoices] = useState<ReceivedInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedInvoice, setSelectedInvoice] = useState<ReceivedInvoice | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Fetch invoices ──────────────────────────────────────────────────

  const fetchInvoices = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== 'ALL') params.set('status', statusFilter);
      if (search) params.set('search', search);
      params.set('limit', '50');

      const res = await fetch(`/api/invoices/received?${params}`);
      if (res.ok) {
        const data = await res.json();
        setInvoices(data.receivedInvoices || []);
      }
    } catch (err) {
      console.error('Failed to fetch received invoices:', err);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  // ── File upload ────────────────────────────────────────────────────

  const handleFileUpload = useCallback(async (file: File) => {
    if (!file.name.endsWith('.xml')) {
      toast.error(language === 'da' ? 'Kun XML-filer er tilladt' : 'Only XML files are allowed');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(language === 'da' ? 'Filen er for stor (max 5 MB)' : 'File too large (max 5 MB)');
      return;
    }

    setIsUploading(true);
    try {
      const xml = await file.text();
      const res = await fetch('/api/invoices/receive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xml }),
      });

      if (!res.ok) {
        const isAccess = await handleMutationError(
          res,
          language === 'da' ? 'Modtag e-faktura' : 'Receive e-invoice'
        );
        if (isAccess) return;
        const data = await res.json();
        throw new Error(data.error || 'Parse error');
      }

      const data = await res.json();
      if (data.warnings?.length > 0) {
        toast.warning(
          language === 'da' ? 'E-faktura modtaget med advarsler' : 'E-invoice received with warnings',
          { description: data.warnings.join(', ') }
        );
      } else {
        toast.success(language === 'da' ? 'E-faktura modtaget' : 'E-invoice received');
      }
      fetchInvoices();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : (language === 'da' ? 'Fejl ved upload' : 'Upload error'));
    } finally {
      setIsUploading(false);
    }
  }, [language, handleMutationError, fetchInvoices]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }, [handleFileUpload]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  // ── View invoice detail ────────────────────────────────────────────

  const handleViewInvoice = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/invoices/received/${id}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedInvoice(data.receivedInvoice);
      }
    } catch (err) {
      console.error('Failed to fetch invoice detail:', err);
    }
  }, []);

  // ── Actions: approve, reject, post ──────────────────────────────────

  const handleAction = useCallback(async (id: string, action: string, reason?: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/invoices/received/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason }),
      });

      if (!res.ok) {
        const isAccess = await handleMutationError(
          res,
          language === 'da' ? 'Opdater e-faktura' : 'Update e-invoice'
        );
        if (isAccess) return;
        const data = await res.json();
        throw new Error(data.error || 'Action failed');
      }

      const labels: Record<string, string> = {
        approve: language === 'da' ? 'E-faktura godkendt' : 'E-invoice approved',
        reject: language === 'da' ? 'E-faktura afvist' : 'E-invoice rejected',
        post: language === 'da' ? 'E-faktura bogført' : 'E-invoice posted',
      };
      toast.success(labels[action] || 'Updated');

      fetchInvoices();
      if (selectedInvoice?.id === id) {
        // Refresh detail view
        const detailRes = await fetch(`/api/invoices/received/${id}`);
        if (detailRes.ok) {
          const data = await detailRes.json();
          setSelectedInvoice(data.receivedInvoice);
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : (language === 'da' ? 'Fejl' : 'Error'));
    } finally {
      setActionLoading(null);
      setShowRejectDialog(false);
      setRejectReason('');
    }
  }, [language, handleMutationError, fetchInvoices, selectedInvoice]);

  // ── Delete ─────────────────────────────────────────────────────────

  const handleDelete = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/invoices/received/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const isAccess = await handleMutationError(
          res,
          language === 'da' ? 'Slet e-faktura' : 'Delete e-invoice'
        );
        return;
      }
      toast.success(language === 'da' ? 'E-faktura slettet' : 'E-invoice deleted');
      fetchInvoices();
    } catch (err) {
      toast.error(language === 'da' ? 'Kunne ikke slette' : 'Could not delete');
    } finally {
      setDeleteTarget(null);
      setSelectedInvoice(null);
    }
  }, [language, handleMutationError, fetchInvoices]);

  // ── Status config ───────────────────────────────────────────────────

  const statusConfig: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    RECEIVED: {
      label: language === 'da' ? 'Modtaget' : 'Received',
      cls: 'status-badge status-badge-sent',
      icon: <Inbox className="h-3 w-3" />,
    },
    APPROVED: {
      label: language === 'da' ? 'Godkendt' : 'Approved',
      cls: 'status-badge status-badge-paid',
      icon: <CheckCircle className="h-3 w-3" />,
    },
    REJECTED: {
      label: language === 'da' ? 'Afvist' : 'Rejected',
      cls: 'status-badge status-badge-cancelled',
      icon: <XCircle className="h-3 w-3" />,
    },
    POSTED: {
      label: language === 'da' ? 'Bogført' : 'Posted',
      cls: 'status-badge status-badge-posted',
      icon: <CheckCircle className="h-3 w-3" />,
    },
  };

  const formatBadge = (f: string) => (
    <Badge variant="outline" className="text-xs border-dashed px-2">
      {f === 'OIOUBL' ? 'OIOUBL' : 'PEPPol BIS'}
    </Badge>
  );

  const docTypeLabel = (dt: string) => {
    const map: Record<string, string> = {
      INVOICE: language === 'da' ? 'Faktura (380)' : 'Invoice (380)',
      CREDIT_NOTE: language === 'da' ? 'Kreditnota (381)' : 'Credit Note (381)',
      CORRECTED: language === 'da' ? 'Korrigeret' : 'Corrected',
      SELF_BILLED: language === 'da' ? 'Selvfaktura' : 'Self-billed',
    };
    return map[dt] || dt;
  };

  // ── Line items helper ───────────────────────────────────────────────

  const parsedLineItems = useMemo(() => {
    if (!selectedInvoice?.lineItems) return [];
    const items = typeof selectedInvoice.lineItems === 'string'
      ? JSON.parse(selectedInvoice.lineItems)
      : selectedInvoice.lineItems;
    return Array.isArray(items) ? items : [];
  }, [selectedInvoice]);

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="p-3 lg:p-6 space-y-4">
      {/* Upload area */}
      <Card className="stat-card border-0 shadow-lg">
        <CardContent className="p-4 lg:p-6">
          <div
            className={`border-2 border-dashed rounded-xl p-6 lg:p-8 text-center transition-colors cursor-pointer ${
              isUploading
                ? 'border-teal-300 bg-teal-50/50 dark:bg-teal-950/20'
                : 'border-muted-foreground/25 hover:border-teal-400 hover:bg-teal-50/30 dark:hover:bg-teal-950/10'
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xml"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) { handleFileUpload(f); e.target.value = ''; }
              }}
            />
            {isUploading ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 text-teal-600 animate-spin" />
                <p className="text-sm text-muted-foreground">
                  {language === 'da' ? 'Behandler e-faktura...' : 'Processing e-invoice...'}
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center">
                  <Upload className="h-6 w-6 text-teal-600 dark:text-teal-400" />
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {language === 'da'
                      ? 'Træk og slip en XML-fil her, eller klik for at vælge'
                      : 'Drag & drop an XML file here, or click to browse'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    OIOUBL / PEPPol BIS &middot; .xml &middot; max 5 MB
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={language === 'da' ? 'Søg leverandør eller fakturanummer...' : 'Search supplier or invoice number...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{language === 'da' ? 'Alle statusser' : 'All statuses'}</SelectItem>
            <SelectItem value="RECEIVED">{language === 'da' ? 'Modtaget' : 'Received'}</SelectItem>
            <SelectItem value="APPROVED">{language === 'da' ? 'Godkendt' : 'Approved'}</SelectItem>
            <SelectItem value="REJECTED">{language === 'da' ? 'Afvist' : 'Rejected'}</SelectItem>
            <SelectItem value="POSTED">{language === 'da' ? 'Bogført' : 'Posted'}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Invoices list */}
      <Card className="stat-card border-0 shadow-lg">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 text-teal-600 animate-spin" />
            </div>
          ) : invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center">
                <Inbox className="h-7 w-7 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium text-sm">
                  {language === 'da' ? 'Ingen e-fakturaer modtaget' : 'No e-invoices received'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {language === 'da'
                    ? 'Upload en XML-fil ovenfor for at modtage en e-faktura'
                    : 'Upload an XML file above to receive an e-invoice'}
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs uppercase tracking-wide">
                      {language === 'da' ? 'Leverandør' : 'Supplier'}
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wide hidden md:table-cell">
                      {language === 'da' ? 'Fakturanr.' : 'Invoice No.'}
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wide hidden sm:table-cell">
                      {language === 'da' ? 'Dato' : 'Date'}
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-right">
                      {language === 'da' ? 'Beløb' : 'Amount'}
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-center hidden lg:table-cell">
                      {language === 'da' ? 'Format' : 'Format'}
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-center">
                      {language === 'da' ? 'Status' : 'Status'}
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-right">
                      {language === 'da' ? 'Handlinger' : 'Actions'}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => {
                    const sc = statusConfig[inv.status] || statusConfig.RECEIVED;
                    return (
                      <TableRow key={inv.id} className="group">
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium text-sm truncate max-w-[200px]">
                              {inv.supplierName}
                            </span>
                            <span className="text-xs text-muted-foreground md:hidden">
                              {inv.invoiceNumber}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <span className="text-sm">{inv.invoiceNumber}</span>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                          {format(new Date(inv.issueDate), 'dd.MM.yyyy', { locale })}
                        </TableCell>
                        <TableCell className="text-right font-medium text-sm tabular-nums">
                          {fmtAmount(inv.payableAmount, inv.currencyCode)}
                        </TableCell>
                        <TableCell className="text-center hidden lg:table-cell">
                          {formatBadge(inv.format)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge className={`${sc.cls} text-xs border rounded-full`}>
                            {sc.icon} {sc.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleViewInvoice(inv.id)}
                              title={language === 'da' ? 'Se detaljer' : 'View details'}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {inv.status === 'RECEIVED' && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/30"
                                  onClick={() => guardWriteAccess(
                                    language === 'da' ? 'Godkend e-faktura' : 'Approve e-invoice',
                                    () => handleAction(inv.id, 'approve')
                                  )}
                                  disabled={actionLoading === inv.id}
                                  title={language === 'da' ? 'Godkend' : 'Approve'}
                                >
                                  {actionLoading === inv.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <CheckCircle className="h-4 w-4" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                                  onClick={() => {
                                    setDeleteTarget(inv.id);
                                    setShowRejectDialog(true);
                                  }}
                                  title={language === 'da' ? 'Afvis' : 'Reject'}
                                >
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                            {inv.status === 'APPROVED' && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-teal-600 hover:text-teal-700 hover:bg-teal-50 dark:hover:bg-teal-950/30"
                                  onClick={() => guardWriteAccess(
                                    language === 'da' ? 'Bogfør e-faktura' : 'Post e-invoice',
                                    () => handleAction(inv.id, 'post')
                                  )}
                                  disabled={actionLoading === inv.id}
                                  title={language === 'da' ? 'Bogfør' : 'Post'}
                                >
                                  {actionLoading === inv.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Send className="h-4 w-4" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                                  onClick={() => {
                                    setDeleteTarget(inv.id);
                                    setShowRejectDialog(true);
                                  }}
                                  title={language === 'da' ? 'Afvis' : 'Reject'}
                                >
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                            {(inv.status === 'RECEIVED') && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => setDeleteTarget(inv.id)}
                                title={language === 'da' ? 'Slet' : 'Delete'}
                              >
                                <Trash2 className="h-4 w-4" />
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
        </CardContent>
      </Card>

      {/* Invoice Detail Dialog */}
      <Dialog open={!!selectedInvoice} onOpenChange={(open) => !open && setSelectedInvoice(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          {selectedInvoice && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-teal-600" />
                  {selectedInvoice.invoiceNumber}
                </DialogTitle>
                <DialogDescription>
                  {selectedInvoice.supplierName} &middot;{' '}
                  {format(new Date(selectedInvoice.issueDate), 'dd.MM.yyyy', { locale })}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Status & badges */}
                <div className="flex flex-wrap items-center gap-2">
                  {(() => {
                    const sc = statusConfig[selectedInvoice.status];
                    return (
                      <Badge className={`${sc.cls} border rounded-full`}>
                        {sc.icon} {sc.label}
                      </Badge>
                    );
                  })()}
                  {formatBadge(selectedInvoice.format)}
                  <Badge variant="outline" className="text-xs">{docTypeLabel(selectedInvoice.documentType)}</Badge>
                </div>

                {/* Supplier info */}
                <Card className="bg-muted/40">
                  <CardContent className="p-4">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                      {language === 'da' ? 'Leverandør' : 'Supplier'}
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="font-medium">{selectedInvoice.supplierName}</span>
                        {selectedInvoice.supplierCvr && (
                          <p className="text-muted-foreground">CVR: {selectedInvoice.supplierCvr}</p>
                        )}
                      </div>
                      <div className="text-muted-foreground space-y-0.5">
                        {selectedInvoice.supplierAddress && <p>{selectedInvoice.supplierAddress}</p>}
                        {(selectedInvoice.supplierCity || selectedInvoice.supplierCountry) && (
                          <p>{[selectedInvoice.supplierCity, selectedInvoice.supplierCountry].filter(Boolean).join(', ')}</p>
                        )}
                        {selectedInvoice.supplierEmail && <p>{selectedInvoice.supplierEmail}</p>}
                        {selectedInvoice.supplierPhone && <p>{selectedInvoice.supplierPhone}</p>}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Line items */}
                {parsedLineItems.length > 0 && (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">{language === 'da' ? 'Beskrivelse' : 'Description'}</TableHead>
                          <TableHead className="text-xs text-right">{language === 'da' ? 'Antal' : 'Qty'}</TableHead>
                          <TableHead className="text-xs text-right">{language === 'da' ? 'Stkpris' : 'Unit price'}</TableHead>
                          <TableHead className="text-xs text-right">{language === 'da' ? 'Moms' : 'VAT'}</TableHead>
                          <TableHead className="text-xs text-right">{language === 'da' ? 'Beløb' : 'Amount'}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {parsedLineItems.map((li: any, i: number) => (
                          <TableRow key={i}>
                            <TableCell className="text-sm max-w-[200px] truncate">
                              {li.description || li.name || `#${i + 1}`}
                            </TableCell>
                            <TableCell className="text-sm text-right tabular-nums">
                              {li.quantity ?? li.amount ?? '—'}
                            </TableCell>
                            <TableCell className="text-sm text-right tabular-nums">
                              {fmtAmount(li.unitPrice || li.price || 0, selectedInvoice.currencyCode)}
                            </TableCell>
                            <TableCell className="text-sm text-right tabular-nums">
                              {li.vatPercent ?? li.taxPercent ?? '—'}%
                            </TableCell>
                            <TableCell className="text-sm text-right font-medium tabular-nums">
                              {fmtAmount(
                                (li.quantity ?? 1) * (li.unitPrice ?? li.price ?? 0),
                                selectedInvoice.currencyCode
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {/* Totals */}
                <Card className="bg-muted/40">
                  <CardContent className="p-4">
                    <div className="flex flex-col items-end gap-1 text-sm">
                      <div className="flex justify-between w-full sm:w-64">
                        <span className="text-muted-foreground">{language === 'da' ? 'Før moms' : 'Tax exclusive'}</span>
                        <span className="tabular-nums">{fmtAmount(selectedInvoice.taxExclusiveAmount, selectedInvoice.currencyCode)}</span>
                      </div>
                      <div className="flex justify-between w-full sm:w-64">
                        <span className="text-muted-foreground">{language === 'da' ? 'Moms' : 'Tax'}</span>
                        <span className="tabular-nums">{fmtAmount(selectedInvoice.taxAmount, selectedInvoice.currencyCode)}</span>
                      </div>
                      <div className="flex justify-between w-full sm:w-64">
                        <span className="text-muted-foreground">{language === 'da' ? 'Inkl. moms' : 'Tax inclusive'}</span>
                        <span className="tabular-nums">{fmtAmount(selectedInvoice.taxInclusiveAmount, selectedInvoice.currencyCode)}</span>
                      </div>
                      <div className="border-t w-full sm:w-64 my-1" />
                      <div className="flex justify-between w-full sm:w-64 font-bold">
                        <span>{language === 'da' ? 'Betalbart' : 'Payable'}</span>
                        <span className="text-teal-600 dark:text-teal-400 tabular-nums">
                          {fmtAmount(selectedInvoice.payableAmount, selectedInvoice.currencyCode)}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Rejection reason */}
                {selectedInvoice.rejectionReason && (
                  <Card className="bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800/30">
                    <CardContent className="p-4 flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-red-700 dark:text-red-400">
                          {language === 'da' ? 'Afvist årsag' : 'Rejection reason'}
                        </p>
                        <p className="text-sm text-red-600 dark:text-red-300 mt-0.5">
                          {selectedInvoice.rejectionReason}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Raw XML (collapsible) */}
                {selectedInvoice.rawXml && (
                  <Collapsible>
                    <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                      <ChevronDown className="h-3 w-3" />
                      {language === 'da' ? 'Rå XML' : 'Raw XML'}
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <pre className="mt-2 text-xs bg-muted rounded-lg p-3 overflow-auto max-h-64 font-mono whitespace-pre-wrap break-all">
                        {selectedInvoice.rawXml}
                      </pre>
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {/* Response XML (collapsible) */}
                {selectedInvoice.responseXml && (
                  <Collapsible>
                    <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                      <ChevronDown className="h-3 w-3" />
                      {language === 'da' ? 'Svar XML' : 'Response XML'}
                      {selectedInvoice.responseType && (
                        <Badge variant="outline" className="text-[10px] ml-1">{selectedInvoice.responseType}</Badge>
                      )}
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <pre className="mt-2 text-xs bg-muted rounded-lg p-3 overflow-auto max-h-64 font-mono whitespace-pre-wrap break-all">
                        {selectedInvoice.responseXml}
                      </pre>
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {/* Actions in dialog */}
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  {selectedInvoice.status === 'RECEIVED' && (
                    <>
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => guardWriteAccess(
                          language === 'da' ? 'Godkend e-faktura' : 'Approve e-invoice',
                          () => handleAction(selectedInvoice.id, 'approve')
                        )}
                        disabled={actionLoading === selectedInvoice.id}
                      >
                        {actionLoading === selectedInvoice.id ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-1" />
                        ) : (
                          <CheckCircle className="h-4 w-4 mr-1" />
                        )}
                        {language === 'da' ? 'Godkend' : 'Approve'}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          setDeleteTarget(selectedInvoice.id);
                          setShowRejectDialog(true);
                        }}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        {language === 'da' ? 'Afvis' : 'Reject'}
                      </Button>
                    </>
                  )}
                  {selectedInvoice.status === 'APPROVED' && (
                    <>
                      <Button
                        size="sm"
                        className="bg-teal-600 hover:bg-teal-700 text-white"
                        onClick={() => guardWriteAccess(
                          language === 'da' ? 'Bogfør e-faktura' : 'Post e-invoice',
                          () => handleAction(selectedInvoice.id, 'post')
                        )}
                        disabled={actionLoading === selectedInvoice.id}
                      >
                        {actionLoading === selectedInvoice.id ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-1" />
                        ) : (
                          <Send className="h-4 w-4 mr-1" />
                        )}
                        {language === 'da' ? 'Bogfør' : 'Post to journal'}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          setDeleteTarget(selectedInvoice.id);
                          setShowRejectDialog(true);
                        }}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        {language === 'da' ? 'Afvis' : 'Reject'}
                      </Button>
                    </>
                  )}
                  {selectedInvoice.status === 'POSTED' && selectedInvoice.journalEntryId && (
                    <Button size="sm" variant="outline" asChild>
                      <a href={`/posteringer?highlight=${selectedInvoice.journalEntryId}`}>
                        <FileText className="h-4 w-4 mr-1" />
                        {language === 'da' ? 'Se postering' : 'View journal entry'}
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject reason dialog */}
      <AlertDialog open={showRejectDialog && !!deleteTarget} onOpenChange={(open) => { setShowRejectDialog(open); if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {language === 'da' ? 'Afvis e-faktura' : 'Reject e-invoice'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {language === 'da'
                ? 'Angiv en årsag til afvisningen (valgfrit).'
                : 'Provide a reason for rejection (optional).'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder={language === 'da' ? 'Årsag til afvisning...' : 'Reason for rejection...'}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>{language === 'da' ? 'Annuller' : 'Cancel'}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => {
                if (deleteTarget) handleAction(deleteTarget, 'reject', rejectReason || undefined);
              }}
            >
              {language === 'da' ? 'Afvis' : 'Reject'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget && !showRejectDialog} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {language === 'da' ? 'Slet e-faktura?' : 'Delete e-invoice?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {language === 'da'
                ? 'Dette sletter e-fakturaen permanent. Denne handling kan ikke fortrydes.'
                : 'This will permanently delete the e-invoice. This action cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{language === 'da' ? 'Annuller' : 'Cancel'}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => {
                if (deleteTarget) handleDelete(deleteTarget);
              }}
            >
              {language === 'da' ? 'Slet' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
