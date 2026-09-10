'use client';

import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from '@/lib/use-translation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Send,
  Loader2,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Building2,
  FileText,
  ChevronDown,
  Globe,
  ShieldCheck,
  Settings,
  Link2,
  Zap,
  Mail,
} from 'lucide-react';
import { toast } from 'sonner';

// ── Types ──────────────────────────────────────────────────────────

interface Invoice {
  id: string;
  invoiceNumber: string;
  customerName: string;
  customerAddress: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  customerCvr: string | null;
  issueDate: string;
  dueDate: string;
  lineItems: any;
  subtotal: number;
  vatTotal: number;
  total: number;
  status: string;
  notes: string | null;
  createdAt: string;
}

interface CompanyInfo {
  cvrNumber: string;
  address: string;
  phone: string;
  email: string;
  bankName: string;
  bankAccount: string;
  bankRegistration: string;
  bankIban: string | null;
}

interface EInvoiceConfig {
  enabled: boolean;
  defaultChannel: string | null;
  endpointId: string | null;
  gln: string | null;
  peppolAs4Id: string | null;
  registrationNo: string | null;
  autoSendOnFinalize: boolean;
  storecoveConnected?: boolean;
  storecoveApiKeyId?: string | null;
  storecoveLegalEntityId?: number | null;
  storecoveConnectedAt?: string | null;
}

interface SendEInvoiceDialogProps {
  invoice: Invoice | null;
  companyInfo: CompanyInfo | null;
  einvoiceConfig: EInvoiceConfig | null;
  onClose: () => void;
  onSuccess: () => void;
}

// ── Component ──────────────────────────────────────────────────────

export function SendEInvoiceDialog({
  invoice,
  companyInfo,
  einvoiceConfig,
  onClose,
  onSuccess,
}: SendEInvoiceDialogProps) {
  const { language, tc } = useTranslation();
  const isDa = language === 'da';

  // ── State ──
  const [channel, setChannel] = useState<string>(
    einvoiceConfig?.defaultChannel || 'OIOUBL'
  );
  const [isSending, setIsSending] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [sendResult, setSendResult] = useState<{
    messageId: string;
    channel: string;
    sentAt: string;
  } | null>(null);
  const [xmlPreview, setXmlPreview] = useState<string | null>(null);
  const [showXmlPreview, setShowXmlPreview] = useState(false);
  const [isLoadingXml, setIsLoadingXml] = useState(false);

  // ── Pre-flight participant reachability check ──
  // Runs when an e-invoice channel (STORECOVE/PEPPOL) is selected and the
  // customer has a CVR. If the recipient is NOT on the Peppol test/production
  // network, we show a warning with a one-click switch to PDF email.
  const [preflightResult, setPreflightResult] = useState<{ exists: boolean; checkedCvr: string } | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflightDismissed, setPreflightDismissed] = useState(false);

  const isEmailChannel = channel === 'EMAIL';
  const isEInvoiceChannel = channel === 'STORECOVE' || channel === 'PEPPOL' || channel === 'OIOUBL';
  const showPreflightWarning =
    isEInvoiceChannel &&
    preflightResult?.exists === false &&
    !preflightDismissed &&
    !!invoice?.customerCvr &&
    !!einvoiceConfig?.storecoveConnected;

  // ── Pre-flight: check if the recipient can receive e-invoices ──
  // Only runs for e-invoice channels (STORECOVE/PEPPOL) when Storecove is
  // connected and the customer has a CVR. Non-blocking: if it fails or says
  // "not reachable", the user can still force the send.
  const runPreflight = useCallback(async (cvr: string) => {
    if (!cvr || !/^\d{8}$/.test(cvr)) return;
    setPreflightLoading(true);
    setPreflightDismissed(false);
    try {
      const res = await fetch('/api/storecove/participants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheme: '0184', identifier: cvr, countryCode: 'DK' }),
      });
      if (res.ok) {
        const data = await res.json();
        setPreflightResult({ exists: !!data.exists, checkedCvr: cvr });
      } else {
        // On error, don't block — just don't show the warning
        setPreflightResult(null);
      }
    } catch {
      setPreflightResult(null);
    } finally {
      setPreflightLoading(false);
    }
  }, []);

  // Run preflight when channel or invoice changes (only for e-invoice channels)
  useEffect(() => {
    if (isEInvoiceChannel && invoice?.customerCvr && einvoiceConfig?.storecoveConnected) {
      // Re-run only if the CVR changed or we haven't checked yet
      if (preflightResult?.checkedCvr !== invoice.customerCvr) {
        runPreflight(invoice.customerCvr);
      }
    } else {
      // Reset when switching to EMAIL channel or no CVR
      setPreflightResult(null);
      setPreflightDismissed(false);
    }
  }, [channel, invoice?.customerCvr, isEInvoiceChannel, einvoiceConfig?.storecoveConnected, preflightResult?.checkedCvr, runPreflight]);

  // ── Fetch XML preview (before early return) ──
  const handlePreviewXml = useCallback(async () => {
    if (!invoice || !companyInfo) return;
    setIsLoadingXml(true);
    setShowXmlPreview(true);
    try {
      const res = await fetch(
        `/api/invoices/${invoice.id}/oioubl?channel=${channel}`,
      );
      if (res.ok) {
        const text = await res.text();
        setXmlPreview(text);
      } else {
        setXmlPreview(null);
      }
    } catch {
      setXmlPreview(null);
    } finally {
      setIsLoadingXml(false);
    }
  }, [invoice, companyInfo, channel]);

  // ── Send (e-invoice or email, before early return) ──
  const handleSend = useCallback(async () => {
    if (!invoice) return;
    setIsSending(true);
    try {
      // EMAIL channel: use the legacy PDF email route (POST /api/invoices/{id}/send)
      // E-invoice channels: use the e-invoice queue route (POST /api/invoices/{id}/send-einvoice)
      const endpoint = isEmailChannel
        ? `/api/invoices/${invoice.id}/send`
        : `/api/invoices/${invoice.id}/send-einvoice`;
      const payload = isEmailChannel
        ? { language: isDa ? 'da' : 'en' }  // subject/message optional, defaults are fine
        : { channel };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || (isDa ? 'Kunne ikke sende faktura' : 'Failed to send invoice'));
      }

      const data = await res.json();

      if (isEmailChannel) {
        // Email route returns { success, sentTo, invoiceNumber, logId }
        setSendResult({
          messageId: data.sentTo || '',  // reuse field for email address
          channel: 'EMAIL',
          sentAt: new Date().toISOString(),
        });
        setIsSent(true);
        toast.success(
          isDa ? 'Faktura sendt via e-mail!' : 'Invoice sent via email!',
          {
            description: isDa
              ? `${invoice.invoiceNumber} er sendt til ${data.sentTo}`
              : `${invoice.invoiceNumber} has been sent to ${data.sentTo}`,
          },
        );
      } else {
        // E-invoice route returns { sending: {...} }
        setSendResult({
          messageId: data.sending?.messageId || data.messageId || '',
          channel,
          sentAt: new Date().toISOString(),
        });
        setIsSent(true);
        toast.success(
          isDa ? 'E-faktura sat i kø!' : 'E-invoice queued!',
          {
            description: isDa
              ? `${invoice.invoiceNumber} er sat i kø til afsendelse via ${channel === 'OIOUBL' ? 'NemHandel' : channel === 'STORECOVE' ? 'Storecove' : 'Peppol BIS'}`
              : `${invoice.invoiceNumber} queued for sending via ${channel === 'OIOUBL' ? 'NemHandel' : channel === 'STORECOVE' ? 'Storecove' : 'Peppol BIS'}`,
          },
        );
      }
      onSuccess();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : (isDa ? 'Kunne ikke sende faktura' : 'Failed to send invoice'),
      );
    } finally {
      setIsSending(false);
    }
  }, [invoice, channel, isEmailChannel, isDa, onSuccess]);

  // ── Close & reset ──
  const handleClose = useCallback(() => {
    setIsSent(false);
    setSendResult(null);
    setShowXmlPreview(false);
    setXmlPreview(null);
    setPreflightResult(null);
    setPreflightDismissed(false);
    onClose();
  }, [onClose]);

  // ── Early return ──
  if (!invoice) return null;

  const config = einvoiceConfig;

  // ── Warnings ──
  const isNotEnabled = !config?.enabled;
  // For e-invoice channels: require CVR. For EMAIL channel: require email.
  const missingCvr = isEInvoiceChannel && !invoice.customerCvr;
  const missingEmail = isEmailChannel && !invoice.customerEmail;
  // E-invoicing must be enabled only for e-invoice channels (EMAIL doesn't need it)
  const canSend = (isEmailChannel || !isNotEnabled) && !missingCvr && !missingEmail;

  return (
    <Dialog open={!!invoice} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-lg w-[95vw] p-0 gap-0 overflow-hidden bg-white dark:bg-[#1a1f1e] rounded-2xl shadow-2xl border border-gray-200 dark:border-white/10">
        <div className="w-full overflow-hidden">
          {/* ── Header ── */}
          <div className="bg-gradient-to-r from-[#0d9488] to-[#14b8a6] dark:from-[#0f766e] dark:to-[#0d9488] px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                {isSent ? (
                  <CheckCircle2 className="h-5 w-5 text-white" />
                ) : (
                  <Send className="h-5 w-5 text-white" />
                )}
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">
                  {isSent
                    ? (isDa ? 'E-faktura sendt' : 'E-invoice sent')
                    : (isDa ? 'Send e-faktura' : 'Send e-invoice')
                  }
                </h2>
                <p className="text-sm text-white/80 mt-0.5">
                  {isDa
                    ? `Faktura ${invoice.invoiceNumber} — ${invoice.customerName}`
                    : `Invoice ${invoice.invoiceNumber} — ${invoice.customerName}`
                  }
                </p>
              </div>
            </div>
          </div>

          {/* ── Body ── */}
          <div className="p-6 space-y-4">
            {/* Not enabled warning */}
            {isNotEnabled && (
              <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 p-4 flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                    {isDa ? 'E-faktura er ikke aktiveret' : 'E-invoicing is not enabled'}
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                    {isDa
                      ? 'E-faktura er ikke aktiveret for denne virksomhed. Du skal konfigurere e-faktura-indstillinger først.'
                      : 'E-invoicing is not enabled for this company. You need to configure e-invoicing settings first.'
                    }
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 gap-2"
                    onClick={() => {
                      handleClose();
                      // Navigate to settings - parent component should handle this
                      window.location.hash = '#settings-einvoice';
                    }}
                  >
                    <Settings className="h-3.5 w-3.5" />
                    {isDa ? 'Åbn indstillinger' : 'Open settings'}
                  </Button>
                </div>
              </div>
            )}

            {/* Missing CVR warning (e-invoice channels only) */}
            {missingCvr && !isNotEnabled && (
              <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 p-4 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                    {isDa ? 'Modtager mangler CVR-nummer' : 'Recipient missing CVR number'}
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                    {isDa
                      ? 'E-faktura kræver et CVR-nummer for at identificere modtageren på Peppol/NemHandel. Tilføj kundens CVR-nummer, eller vælg \"E-mail (PDF)\" kanalen i stedet.'
                      : 'E-invoicing requires a CVR number to identify the recipient on Peppol/NemHandel. Add the customer\'s CVR number, or choose the \"Email (PDF)\" channel instead.'
                    }
                  </p>
                </div>
              </div>
            )}

            {/* Missing email warning (EMAIL channel only) */}
            {missingEmail && (
              <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 p-4 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                    {isDa ? 'Modtager mangler e-mailadresse' : 'Recipient missing email address'}
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                    {isDa
                      ? 'E-mail-kanalen kræver en e-mailadresse på fakturaen eller kontakten.'
                      : 'The email channel requires an email address on the invoice or contact.'
                    }
                  </p>
                </div>
              </div>
            )}

            {/* Pre-flight: recipient not reachable on Peppol/NemHandel */}
            {showPreflightWarning && (
              <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 p-4 flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                    {isDa ? 'Modtager kan ikke modtage e-fakturaer' : 'Recipient cannot receive e-invoices'}
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                    {isDa
                      ? `CVR ${invoice.customerCvr} er ikke registreret på Peppol/NemHandel-netværket. E-fakturaen vil blive afvist af Storecove.`
                      : `CVR ${invoice.customerCvr} is not registered on the Peppol/NemHandel network. The e-invoice will be rejected by Storecove.`
                    }
                  </p>
                  <div className="flex gap-2 mt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 gap-2"
                      onClick={() => setChannel('EMAIL')}
                    >
                      <Mail className="h-3.5 w-3.5" />
                      {isDa ? 'Send som PDF-e-mail i stedet' : 'Send as PDF email instead'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                      onClick={() => setPreflightDismissed(true)}
                    >
                      {isDa ? 'Send alligevel' : 'Send anyway'}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Success state */}
            {isSent && sendResult && (
              <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 p-4 flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0 space-y-2">
                  <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                    {sendResult.channel === 'EMAIL'
                      ? (isDa ? 'Faktura sendt via e-mail' : 'Invoice sent via email')
                      : (isDa ? 'E-faktura sat i kø' : 'E-invoice queued')
                    }
                  </p>
                  <div className="space-y-1 text-xs text-emerald-700 dark:text-emerald-400">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{isDa ? 'Kanal' : 'Channel'}</span>
                      <Badge variant="outline" className="text-[10px] px-2 border-emerald-300 dark:border-emerald-700">
                        {sendResult.channel === 'EMAIL' ? (isDa ? 'E-mail (PDF)' : 'Email (PDF)') : sendResult.channel === 'OIOUBL' ? 'OIOUBL (NemHandel)' : sendResult.channel === 'STORECOVE' ? 'Storecove (Peppol+NemHandel)' : 'Peppol BIS'}
                      </Badge>
                    </div>
                    {sendResult.messageId && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          {sendResult.channel === 'EMAIL' ? (isDa ? 'Sendt til' : 'Sent to') : (isDa ? 'Besked-ID' : 'Message ID')}
                        </span>
                        {sendResult.channel === 'EMAIL'
                          ? <span className="truncate ml-2">{sendResult.messageId}</span>
                          : <code className="font-mono text-[10px]">{sendResult.messageId}</code>
                        }
                      </div>
                    )}
                    {sendResult.channel !== 'EMAIL' && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{isDa ? 'Status' : 'Status'}</span>
                        <span>{isDa ? 'Sat i kø — kør send-worker for at transmittere' : 'Queued — run the send worker to transmit'}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{isDa ? 'Sendt' : 'Sent'}</span>
                      <span>{new Date(sendResult.sentAt).toLocaleString(isDa ? 'da-DK' : 'en-GB')}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Invoice info badges */}
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="text-xs font-medium gap-1 bg-[#0d9488]/10 text-[#0d9488] border border-[#0d9488]/20">
                <FileText className="h-3 w-3" />
                {invoice.invoiceNumber}
              </Badge>
              <Badge variant="secondary" className="text-xs font-medium gap-1">
                {tc(invoice.total)}
              </Badge>
            </div>

            {/* Recipient info */}
            <div className="rounded-lg bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 p-3">
              <div className="flex items-start gap-3">
                <Building2 className="h-4 w-4 text-gray-400 dark:text-gray-500 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {isDa ? 'Modtager' : 'Recipient'}
                  </p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {invoice.customerName}
                  </p>
                  {invoice.customerCvr && (
                    <p className="text-xs text-muted-foreground">
                      {isDa ? 'CVR' : 'CVR'}: {invoice.customerCvr}
                    </p>
                  )}
                  {invoice.customerEmail && (
                    <p className="text-xs text-muted-foreground truncate">{invoice.customerEmail}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Channel selection */}
            {!isSent && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {isDa ? 'Afsendelseskanal' : 'Sending channel'}
                </label>
                <Select value={channel} onValueChange={setChannel} disabled={isNotEnabled && !isEmailChannel}>
                  <SelectTrigger className="bg-white dark:bg-white/5 border-gray-200 dark:border-white/10">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      <SelectValue />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="STORECOVE">
                      <div className="flex items-center gap-2">
                        <Link2 className="h-3.5 w-3.5 text-violet-500" />
                        <span>Storecove ({isDa ? 'Auto Peppol+NemHandel' : 'Auto Peppol+NemHandel'})</span>
                        {einvoiceConfig?.storecoveConnected && (
                          <Badge className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[8px] px-1 py-0">
                            <Zap className="h-2.5 w-2.5" />
                            {isDa ? 'FORBINDET' : 'LIVE'}
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                    <SelectItem value="PEPPOL">
                      <div className="flex items-center gap-2">
                        <Globe className="h-3.5 w-3.5 text-blue-500" />
                        <span>Peppol BIS</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="OIOUBL">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-3.5 w-3.5 text-[#0d9488]" />
                        <span>OIOUBL ({isDa ? 'NemHandel' : 'NemHandel'})</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="EMAIL">
                      <div className="flex items-center gap-2">
                        <Mail className="h-3.5 w-3.5 text-blue-400" />
                        <span>{isDa ? 'E-mail (PDF)' : 'Email (PDF)'}</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {channel === 'STORECOVE' && isDa && 'Automatisk levering via Storecove Access Point. Sendes til både Peppol og NemHandel.'}
                  {channel === 'STORECOVE' && !isDa && 'Automatic delivery via Storecove Access Point. Routed to both Peppol and NemHandel.'}
                  {channel === 'PEPPOL' && isDa && 'Peppol BIS Billing 3.0-format. International e-fakturastandard.'}
                  {channel === 'PEPPOL' && !isDa && 'Peppol BIS Billing 3.0 format. International e-invoicing standard.'}
                  {channel === 'OIOUBL' && isDa && 'OIOUBL-format via NemHandel-netværket. Standard for offentlige danske institutioner.'}
                  {channel === 'OIOUBL' && !isDa && 'OIOUBL format via NemHandel network. Standard for Danish public institutions.'}
                  {channel === 'EMAIL' && isDa && 'Sender fakturaen som PDF vedhæftning til kundens e-mailadresse. Kræver ikke Peppol/NemHandel.'}
                  {channel === 'EMAIL' && !isDa && 'Sends the invoice as a PDF attachment to the customer\'s email address. Does not require Peppol/NemHandel.'}
                </p>
                {channel === 'STORECOVE' && !einvoiceConfig?.storecoveConnected && (
                  <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 p-2 mt-1.5 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    {isDa
                      ? 'Storecove er ikke forbundet. Afsendelse vil bruge simulationstilstand. Forbind Storecove i indstillinger.'
                      : 'Storecove is not connected. Sending will use simulation mode. Connect Storecove in settings.'}
                  </div>
                )}
                {/* Pre-flight loading indicator */}
                {preflightLoading && isEInvoiceChannel && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {isDa ? 'Tjekker om modtager kan modtage e-fakturaer...' : 'Checking if recipient can receive e-invoices...'}
                  </div>
                )}
                {/* Pre-flight OK indicator */}
                {isEInvoiceChannel && preflightResult?.exists === true && !preflightLoading && (
                  <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                    <CheckCircle2 className="h-3 w-3" />
                    {isDa ? 'Modtager er registreret på Peppol/NemHandel-netværket' : 'Recipient is registered on the Peppol/NemHandel network'}
                  </div>
                )}
              </div>
            )}

            {/* XML preview (collapsible) — hidden for EMAIL channel */}
            {!isSent && companyInfo && !isEmailChannel && (
              <Collapsible open={showXmlPreview} onOpenChange={setShowXmlPreview}>
                <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full">
                  <ChevronDown className={`h-3 w-3 transition-transform ${showXmlPreview ? 'rotate-180' : ''}`} />
                  {isDa ? 'Forhåndsvis XML' : 'Preview XML'}
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-2 space-y-2">
                    {!showXmlPreview ? null : isLoadingXml ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-5 w-5 text-[#0d9488] animate-spin" />
                      </div>
                    ) : xmlPreview ? (
                      <pre className="text-xs bg-gray-50 dark:bg-white/5 rounded-lg p-3 overflow-auto max-h-64 font-mono whitespace-pre-wrap break-all text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-white/10">
                        {xmlPreview}
                      </pre>
                    ) : (
                      <p className="text-xs text-muted-foreground p-3">
                        {isDa
                          ? 'Kunne ikke indlæse XML-forhåndsvisning.'
                          : 'Could not load XML preview.'}
                      </p>
                    )}
                    {!showXmlPreview || xmlPreview ? null : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={handlePreviewXml}
                        disabled={isLoadingXml}
                      >
                        {isLoadingXml ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                        ) : null}
                        {isDa ? 'Indlæs XML-forhåndsvisning' : 'Load XML preview'}
                      </Button>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Sender info */}
            {companyInfo && (
              <div className="rounded-lg bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 p-3">
                <div className="flex items-start gap-3">
                  <Building2 className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-xs text-muted-foreground">
                      {isDa ? 'Afsender' : 'Sender'}
                    </p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {companyInfo.address || ''} · CVR: {companyInfo.cvrNumber}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Footer ── */}
          <div className="px-6 py-4 bg-gray-50 dark:bg-white/[0.02] border-t border-gray-100 dark:border-white/5 flex items-center justify-end gap-2 rounded-b-2xl">
            <Button
              variant="ghost"
              onClick={handleClose}
              disabled={isSending}
              className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
              {isDa ? (isSent ? 'Luk' : 'Annuller') : (isSent ? 'Close' : 'Cancel')}
            </Button>
            {!isSent && (
              <Button
                onClick={handleSend}
                disabled={isSending || !canSend}
                className="bg-[#0d9488] hover:bg-[#0f766e] text-white gap-2 min-w-[140px]"
              >
                {isSending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isEmailChannel ? (
                  <Mail className="h-4 w-4" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {isSending
                  ? (isDa ? 'Sender...' : 'Sending...')
                  : isEmailChannel
                    ? (isDa ? 'Send e-mail' : 'Send email')
                    : (isDa ? 'Send e-faktura' : 'Send e-invoice')
                }
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
