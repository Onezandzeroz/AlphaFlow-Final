'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from '@/lib/use-translation';
import { useAccessErrorHandler } from '@/hooks/use-access-error-handler';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ResponsiveSwitch } from '@/components/ui/responsive-switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Globe,
  ShieldCheck,
  Loader2,
  Info,
  AlertTriangle,
  CheckCircle2,
  Settings,
  ExternalLink,
  Building2,
  Zap,
  FileText,
  Link2,
  Unlink,
  Search,
  Key,
  Activity,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { da, enGB } from 'date-fns/locale';

// ── Types ──────────────────────────────────────────────────────────

interface User {
  id: string;
  email: string;
  activeCompanyRole?: string | null | undefined;
  isSuperDev?: boolean;
  activeCompanyName?: string | null;
  hasAppOwner?: boolean;
}

interface EInvoiceSettingsData {
  enabled: boolean;
  defaultChannel: string | null;
  endpointId: string | null;
  gln: string | null;
  peppolAs4Id: string | null;
  registrationNo: string | null;
  autoSendOnFinalize: boolean;
  registeredAt: string | null;
  registrationStatus: 'registered' | 'not_registered' | 'pending' | null;
  storecoveConnected: boolean;
  storecoveApiKeyId: string | null;
  storecoveLegalEntityId: number | null;
  storecoveConnectedAt: string | null;
}

interface NemHandelRegistration {
  registrationNo: string | null;
  registeredAt: string | null;
  status: 'registered' | 'not_registered' | 'pending' | null;
}

interface StorecoveConnectionStatus {
  connected: boolean;
  apiKeyId?: string;
  legalEntityId?: number | null;
  connectedAt?: string | null;
  lastTestedAt?: string | null;
  healthy?: boolean;
  einvoiceEnabled?: boolean;
  defaultChannel?: string | null;
  cvrNumber?: string;
}

interface PeppolParticipantResult {
  exists: boolean;
  scheme: string;
  identifier: string;
  name?: string;
  countryCode?: string;
  accessPoints?: Array<{ id: string; name: string }>;
}

interface EInvoiceSettingsProps {
  user: User;
}

// ── Component ──────────────────────────────────────────────────────

export function EInvoiceSettings({ user }: EInvoiceSettingsProps) {
  const { language } = useTranslation();
  const isDa = language === 'da';
  const locale = isDa ? da : enGB;
  const { handleMutationError } = useAccessErrorHandler();

  // ── State ──
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

  // Settings form
  const [enabled, setEnabled] = useState(false);
  const [defaultChannel, setDefaultChannel] = useState('OIOUBL');
  const [endpointId, setEndpointId] = useState('');
  const [gln, setGln] = useState('');
  const [peppolAs4Id, setPeppolAs4Id] = useState('');
  const [autoSendOnFinalize, setAutoSendOnFinalize] = useState(false);

  // Registration data (read-only from server)
  const [registration, setRegistration] = useState<NemHandelRegistration>({
    registrationNo: null,
    registeredAt: null,
    status: null,
  });

  // Company CVR (for auto-filling endpointId)
  const [companyCvr, setCompanyCvr] = useState('');

  // Storecove connection state
  const [storecoveApiKey, setStorecoveApiKey] = useState('');
  const [storecoveLegalEntityId, setStorecoveLegalEntityId] = useState('');
  const [storecoveStatus, setStorecoveStatus] = useState<StorecoveConnectionStatus | null>(null);
  const [isConnectingStorecove, setIsConnectingStorecove] = useState(false);
  const [isDisconnectingStorecove, setIsDisconnectingStorecove] = useState(false);
  const [isTestingStorecove, setIsTestingStorecove] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  // Peppol participant lookup
  const [participantLookupId, setParticipantLookupId] = useState('');
  const [participantLookupResult, setParticipantLookupResult] = useState<PeppolParticipantResult | null>(null);
  const [isLookingUpParticipant, setIsLookingUpParticipant] = useState(false);

  // ── Fetch settings ──
  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/company/einvoice-settings');
      if (res.ok) {
        const data: EInvoiceSettingsData = await res.json();
        setEnabled(data.enabled);
        setDefaultChannel(data.defaultChannel || 'OIOUBL');
        setEndpointId(data.endpointId || '');
        setGln(data.gln || '');
        setPeppolAs4Id(data.peppolAs4Id || '');
        setAutoSendOnFinalize(data.autoSendOnFinalize);
        setRegistration({
          registrationNo: data.registrationNo,
          registeredAt: data.registeredAt,
          status: data.registrationStatus,
        });
      }
    } catch (err) {
      console.error('Failed to fetch e-invoice settings:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch company CVR for endpointId auto-fill
  const fetchCompanyCvr = useCallback(async () => {
    try {
      const res = await fetch('/api/company');
      if (res.ok) {
        const data = await res.json();
        if (data.companyInfo?.cvrNumber) {
          setCompanyCvr(data.companyInfo.cvrNumber);
          setEndpointId(prev => prev || `0184:${data.companyInfo.cvrNumber}`);
        }
      }
    } catch {
      // Ignore — endpoint ID stays empty
    }
  }, []);

  // ── Fetch Storecove status ──
  const fetchStorecoveStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/storecove/status');
      if (res.ok) {
        const data = await res.json();
        setStorecoveStatus(data);
      }
    } catch {
      // Ignore — status stays null
    }
  }, []);

  useEffect(() => {
    fetchSettings();
    fetchCompanyCvr();
    fetchStorecoveStatus();
  }, [fetchSettings, fetchCompanyCvr, fetchStorecoveStatus]);

  // ── Connect Storecove ──
  const handleConnectStorecove = useCallback(async () => {
    if (!storecoveApiKey.trim()) {
      toast.error(isDa ? 'Indtast en API-nøgle' : 'Enter an API key');
      return;
    }
    setIsConnectingStorecove(true);
    try {
      const res = await fetch('/api/storecove/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: storecoveApiKey,
          legalEntityId: storecoveLegalEntityId ? parseInt(storecoveLegalEntityId) : undefined,
        }),
      });

      if (!res.ok) {
        const isAccess = await handleMutationError(res, isDa ? 'Forbind Storecove' : 'Connect Storecove');
        if (isAccess) { setIsConnectingStorecove(false); return; }
        return; // handleMutationError already showed error toast
      }

      const data = await res.json();
      toast.success(
        isDa ? 'Storecove forbundet!' : 'Storecove connected!',
        {
          description: isDa
            ? `${data.legalEntitiesCount || 0} juridiske enheder fundet`
            : `${data.legalEntitiesCount || 0} legal entities found`,
        },
      );
      setStorecoveApiKey('');
      fetchStorecoveStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : (isDa ? 'Forbindelse fejlede' : 'Connection failed'));
    } finally {
      setIsConnectingStorecove(false);
    }
  }, [storecoveApiKey, storecoveLegalEntityId, isDa, handleMutationError, fetchStorecoveStatus]);

  // ── Disconnect Storecove ──
  const handleDisconnectStorecove = useCallback(async () => {
    setIsDisconnectingStorecove(true);
    try {
      const res = await fetch('/api/storecove/connect', { method: 'PUT' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || (isDa ? 'Afbrudt fejlede' : 'Disconnect failed'));
      }
      toast.success(isDa ? 'Storecove afbrudt' : 'Storecove disconnected');
      fetchStorecoveStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : (isDa ? 'Afbrudt fejlede' : 'Disconnect failed'));
    } finally {
      setIsDisconnectingStorecove(false);
    }
  }, [isDa, fetchStorecoveStatus]);

  // ── Test Storecove connection ──
  const handleTestStorecove = useCallback(async () => {
    setIsTestingStorecove(true);
    try {
      await fetchStorecoveStatus();
      toast.success(
        storecoveStatus?.healthy
          ? (isDa ? 'Forbindelsen er aktiv' : 'Connection is active')
          : (isDa ? 'Forbindelsen kunne ikke bekræftes' : 'Connection could not be confirmed'),
      );
    } catch {
      toast.error(isDa ? 'Test fejlede' : 'Test failed');
    } finally {
      setIsTestingStorecove(false);
    }
  }, [isDa, fetchStorecoveStatus, storecoveStatus]);

  // ── Peppol participant lookup ──
  const handleLookupParticipant = useCallback(async () => {
    if (!participantLookupId.trim()) {
      toast.error(isDa ? 'Indtast et CVR- eller identifikationsnummer' : 'Enter a CVR or identifier number');
      return;
    }
    setIsLookingUpParticipant(true);
    try {
      const res = await fetch('/api/storecove/participants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: participantLookupId.replace(/\s/g, ''),
          countryCode: 'DK',
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || (isDa ? 'Opslag fejlede' : 'Lookup failed'));
      }

      const data: PeppolParticipantResult = await res.json();
      setParticipantLookupResult(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : (isDa ? 'Opslag fejlede' : 'Lookup failed'));
      setParticipantLookupResult(null);
    } finally {
      setIsLookingUpParticipant(false);
    }
  }, [participantLookupId, isDa]);

  // ── Derived: auto-computed Peppol AS4 ID ──
  const computedPeppolId = useMemo(() => {
    if (peppolAs4Id) return peppolAs4Id;
    if (companyCvr) return `0188:CVR${companyCvr}`;
    return '';
  }, [peppolAs4Id, companyCvr]);

  // ── Save settings ──
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/company/einvoice-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled,
          defaultChannel,
          endpointId: endpointId || `0184:${companyCvr}`,
          gln: gln || null,
          peppolAs4Id: peppolAs4Id || null,
          autoSendOnFinalize,
        }),
      });

      if (!res.ok) {
        const isAccess = await handleMutationError(
          res,
          isDa ? 'Gem e-faktura indstillinger' : 'Save e-invoice settings',
        );
        if (isAccess) { setIsSaving(false); return; }
        return; // handleMutationError already showed error toast
      }

      toast.success(
        isDa ? 'Indstillinger gemt!' : 'Settings saved!',
        {
          description: isDa
            ? 'Dine e-faktura indstillinger er opdateret.'
            : 'Your e-invoicing settings have been updated.',
        },
      );
      fetchSettings();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : (isDa ? 'Kunne ikke gemme' : 'Failed to save'),
      );
    } finally {
      setIsSaving(false);
    }
  }, [enabled, defaultChannel, endpointId, companyCvr, gln, peppolAs4Id, autoSendOnFinalize, isDa, handleMutationError, fetchSettings]);

  // ── Register with NemHandelsregisteret ──
  const handleRegister = useCallback(async () => {
    setIsRegistering(true);
    try {
      const res = await fetch('/api/company/einvoice-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpointId: endpointId || `0184:${companyCvr}`,
          gln: gln || null,
        }),
      });

      if (!res.ok) {
        const isAccess = await handleMutationError(
          res,
          isDa ? 'Tilmeld NemHandelsregisteret' : 'Register with NemHandelsregisteret',
        );
        if (isAccess) { setIsRegistering(false); return; }
        return; // handleMutationError already showed error toast
      }

      const data = await res.json();
      toast.success(
        isDa ? 'Tilmeldt NemHandelsregisteret!' : 'Registered with NemHandelsregisteret!',
        {
          description: isDa
            ? `Registreringsnummer: ${data.registrationNo || '—'}`
            : `Registration number: ${data.registrationNo || '—'}`,
        },
      );
      fetchSettings();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : (isDa ? 'Tilmelding fejlede' : 'Registration failed'),
      );
    } finally {
      setIsRegistering(false);
    }
  }, [endpointId, companyCvr, gln, isDa, handleMutationError, fetchSettings]);

  // ── Registration status badge ──
  const getRegistrationStatusBadge = () => {
    switch (registration.status) {
      case 'registered':
        return (
          <Badge className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800/40 text-xs gap-1">
            <CheckCircle2 className="h-3 w-3" />
            {isDa ? 'Tilmeldt' : 'Registered'}
          </Badge>
        );
      case 'pending':
        return (
          <Badge className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800/40 text-xs gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            {isDa ? 'Afventer' : 'Pending'}
          </Badge>
        );
      default:
        return (
          <Badge className="bg-gray-100 dark:bg-gray-900/30 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700/40 text-xs gap-1">
            <Building2 className="h-3 w-3" />
            {isDa ? 'Ikke tilmeldt' : 'Not registered'}
          </Badge>
        );
    }
  };

  // ── Loading skeleton ──
  if (isLoading) {
    return (
      <div className="space-y-4 lg:space-y-6">
        <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
          <CardHeader className="pb-4">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-72" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </CardContent>
        </Card>
        <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
          <CardHeader className="pb-4">
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-20 w-full rounded-xl" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* ═══ E-INVOICE CONFIG CARD ═══ */}
      <Card className="stat-card card-hover-lift border-0 shadow-lg dark:border dark:border-white/5">
        <CardHeader className="pb-4">
          <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#0d9488] to-[#14b8a6] flex items-center justify-center shrink-0">
              <Settings className="h-4 w-4 text-white" />
            </div>
            {isDa ? 'E-faktura indstillinger' : 'E-invoicing settings'}
          </CardTitle>
          <CardDescription className="text-sm text-gray-500 dark:text-gray-400">
            {isDa
              ? 'Konfigurer afsendelse af e-fakturaer via NemHandel og Peppol.'
              : 'Configure e-invoice sending via NemHandel and Peppol.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* ── Enable toggle ── */}
          <div className="flex items-center justify-between rounded-xl p-4 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-[#0d9488]/10 flex items-center justify-center shrink-0">
                <Zap className="h-4 w-4 text-[#0d9488]" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {isDa ? 'Aktiver e-faktura' : 'Enable e-invoicing'}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isDa
                    ? 'Tillad afsendelse af fakturaer via OIOUBL/Peppol'
                    : 'Allow sending invoices via OIOUBL/Peppol'}
                </p>
              </div>
            </div>
            <ResponsiveSwitch
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </div>

          {enabled && (
            <>
              {/* ── Default channel ── */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {isDa ? 'Standardkanal' : 'Default channel'}
                </Label>
                <Select value={defaultChannel} onValueChange={setDefaultChannel}>
                  <SelectTrigger className="h-10 w-full bg-white dark:bg-white/5 border-gray-200 dark:border-white/10">
                    <div className="flex items-center gap-2">
                      {defaultChannel === 'OIOUBL' ? (
                        <ShieldCheck className="h-4 w-4 text-[#0d9488]" />
                      ) : (
                        <Globe className="h-4 w-4 text-blue-500" />
                      )}
                      <SelectValue />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OIOUBL">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-3.5 w-3.5 text-[#0d9488]" />
                        <span>OIOUBL ({isDa ? 'NemHandel' : 'NemHandel'})</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="PEPPOL">
                      <div className="flex items-center gap-2">
                        <Globe className="h-3.5 w-3.5 text-blue-500" />
                        <span>Peppol BIS</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {defaultChannel === 'OIOUBL'
                    ? (isDa
                      ? 'OIOUBL er standardformatet for danske offentlige institutioner.'
                      : 'OIOUBL is the standard format for Danish public institutions.')
                    : (isDa
                      ? 'Peppol BIS er en international e-fakturastandard.'
                      : 'Peppol BIS is an international e-invoicing standard.')}
                </p>
              </div>

              <Separator />

              {/* ── EndpointID (auto-filled from CVR with scheme 0184) ── */}
              <div className="space-y-1.5">
                <Label htmlFor="endpointId" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {isDa ? 'EndpointID' : 'EndpointID'}
                  <span className="text-red-500 ml-0.5">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="endpointId"
                    value={endpointId}
                    onChange={(e) => setEndpointId(e.target.value)}
                    placeholder={`0184:${companyCvr || 'CVR-nummer'}`}
                    className="h-10 bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 pr-20"
                  />
                  {companyCvr && !endpointId && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-8 text-[10px] text-[#0d9488] hover:bg-[#0d9488]/10"
                      onClick={() => setEndpointId(`0184:${companyCvr}`)}
                    >
                      {isDa ? 'Auto-udfyld' : 'Auto-fill'}
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {isDa
                    ? 'Dit unikke EndpointID i NemHandel-netværket. Schema 0184 = DK CVR.'
                    : 'Your unique EndpointID in the NemHandel network. Scheme 0184 = DK CVR.'}
                </p>
              </div>

              {/* ── GLN/EAN number ── */}
              <div className="space-y-1.5">
                <Label htmlFor="gln" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {isDa ? 'GLN/EAN-nummer' : 'GLN/EAN number'}
                  <span className="text-muted-foreground ml-1 font-normal">({isDa ? 'frivilligt' : 'optional'})</span>
                </Label>
                <Input
                  id="gln"
                  value={gln}
                  onChange={(e) => setGln(e.target.value)}
                  placeholder={isDa ? 'f.eks. 5790001234567' : 'e.g. 5790001234567'}
                  className="h-10 bg-white dark:bg-white/5 border-gray-200 dark:border-white/10"
                />
                <p className="text-xs text-muted-foreground">
                  {isDa
                    ? 'Global Location Number bruges af nogle offentlige institutioner til identifikation.'
                    : 'Global Location Number is used by some public institutions for identification.'}
                </p>
              </div>

              {/* ── Peppol AS4 ID ── */}
              <div className="space-y-1.5">
                <Label htmlFor="peppolAs4Id" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {isDa ? 'Peppol AS4 ID' : 'Peppol AS4 ID'}
                  <span className="text-muted-foreground ml-1 font-normal">({isDa ? 'frivilligt' : 'optional'})</span>
                </Label>
                <div className="relative">
                  <Input
                    id="peppolAs4Id"
                    value={peppolAs4Id}
                    onChange={(e) => setPeppolAs4Id(e.target.value)}
                    placeholder={`0188:CVR${companyCvr || 'xxxx'}`}
                    className="h-10 bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 pr-20"
                  />
                  {companyCvr && !peppolAs4Id && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-8 text-[10px] text-blue-500 hover:bg-blue-500/10"
                      onClick={() => setPeppolAs4Id(`0188:CVR${companyCvr}`)}
                    >
                      {isDa ? 'Auto-udfyld' : 'Auto-fill'}
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {isDa
                    ? 'Peppol AS4 Participant ID til Peppol-netværket. Format: 0188:CVRnummer.'
                    : 'Peppol AS4 Participant ID for the Peppol network. Format: 0188:CVRnumber.'}
                  {companyCvr && !peppolAs4Id && (
                    <span className="text-[#0d9488] dark:text-[#99f6e4] ml-1">
                      {isDa ? 'Foreslået' : 'Suggested'}: {computedPeppolId}
                    </span>
                  )}
                </p>
              </div>

              <Separator />

              {/* ── Auto-send on finalize ── */}
              <div className="flex items-center justify-between rounded-xl p-4 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="h-8 w-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                    <Zap className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {isDa ? 'Automatisk afsendelse' : 'Auto-send on finalize'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {isDa
                        ? 'Send e-faktura automatisk når fakturaen godkendes/finaliseres.'
                        : 'Automatically send e-invoice when the invoice is approved/finalized.'}
                    </p>
                  </div>
                </div>
                <ResponsiveSwitch
                  checked={autoSendOnFinalize}
                  onCheckedChange={setAutoSendOnFinalize}
                />
              </div>

              {/* ── Save button ── */}
              <div className="flex justify-end pt-1">
                <Button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="bg-[#0d9488] hover:bg-[#0f766e] text-white gap-2 min-w-[140px] font-medium transition-all"
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  {isSaving
                    ? (isDa ? 'Gemmer...' : 'Saving...')
                    : (isDa ? 'Gem indstillinger' : 'Save settings')
                  }
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ═══ NEMHANDELSREGISTERET CARD ═══ */}
      <Card className="stat-card card-hover-lift border-0 shadow-lg dark:border dark:border-white/5">
        <CardHeader className="pb-4">
          <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shrink-0">
              <Building2 className="h-4 w-4 text-white" />
            </div>
            {isDa ? 'NemHandelsregisteret' : 'NemHandelsregisteret'}
          </CardTitle>
          <CardDescription className="text-sm text-gray-500 dark:text-gray-400">
            {isDa
              ? 'Registrering i det danske NemHandelsregister for e-fakturamodtagelse.'
              : 'Registration in the Danish NemHandel register for e-invoice reception.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* ── Registration status ── */}
          <div className={`rounded-xl p-4 border ${
            registration.status === 'registered'
              ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/40'
              : registration.status === 'pending'
                ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800/40'
                : 'bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-white/10'
          }`}>
            <div className="flex items-center gap-4">
              <div className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 ${
                registration.status === 'registered'
                  ? 'bg-gradient-to-br from-emerald-500 to-green-500'
                  : registration.status === 'pending'
                    ? 'bg-gradient-to-br from-yellow-400 to-amber-500'
                    : 'bg-gradient-to-br from-gray-400 to-gray-500'
              }`}>
                {registration.status === 'registered' ? (
                  <CheckCircle2 className="h-6 w-6 text-white" />
                ) : registration.status === 'pending' ? (
                  <Loader2 className="h-6 w-6 text-white animate-spin" />
                ) : (
                  <Building2 className="h-6 w-6 text-white" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    {registration.status === 'registered'
                      ? (isDa ? 'Registreret i NemHandelsregisteret' : 'Registered in NemHandelsregisteret')
                      : registration.status === 'pending'
                        ? (isDa ? 'Registrering afventer' : 'Registration pending')
                        : (isDa ? 'Ikke registreret' : 'Not registered')
                    }
                  </span>
                  {getRegistrationStatusBadge()}
                </div>
                {registration.registrationNo && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {isDa ? 'Registreringsnummer' : 'Registration number'}:{' '}
                    <span className="font-mono font-medium">{registration.registrationNo}</span>
                  </p>
                )}
                {registration.registeredAt && (
                  <p className="text-xs text-muted-foreground">
                    {isDa ? 'Registreringsdato' : 'Registration date'}:{' '}
                    {format(new Date(registration.registeredAt), 'dd.MM.yyyy', { locale })}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ── Register button ── */}
          {!enabled && (
            <div className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-lg p-3">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                {isDa
                  ? 'Du skal aktivere e-faktura først for at tilmelde NemHandelsregisteret.'
                  : 'You must enable e-invoicing first to register with NemHandelsregisteret.'}
              </span>
            </div>
          )}

          {enabled && registration.status !== 'registered' && (
            <Button
              onClick={handleRegister}
              disabled={isRegistering || !companyCvr}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2 font-medium transition-all"
            >
              {isRegistering ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="h-4 w-4" />
              )}
              {isRegistering
                ? (isDa ? 'Tilmelder...' : 'Registering...')
                : (isDa ? 'Tilmeld NemHandelsregisteret' : 'Register with NemHandelsregisteret')
              }
            </Button>
          )}

          {/* ── NemHandel info section ── */}
          <div className="space-y-3">
            <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400 info-box-primary rounded-lg p-3">
              <Info className="h-4 w-4 shrink-0 mt-0.5 text-[#14b8a6] dark:text-[#99f6e4]" />
              <div className="space-y-2">
                <p className="font-semibold text-gray-700 dark:text-gray-300">
                  {isDa ? 'Hvad er NemHandel?' : 'What is NemHandel?'}
                </p>
                <p className="leading-relaxed">
                  {isDa
                    ? 'NemHandel er det danske infrastruktur-netværk for elektronisk fakturering (e-faktura). Det er et lovkrav for offentlige institutioner at kunne modtage og sende e-fakturaer via NemHandel-netværket.'
                    : 'NemHandel is the Danish infrastructure network for electronic invoicing (e-invoice). It is a legal requirement for public institutions to receive and send e-invoices via the NemHandel network.'}
                </p>
                <p className="leading-relaxed">
                  {isDa
                    ? 'For at sende e-fakturaer til offentlige institutioner (stat, regioner, kommuner), skal din virksomhed være tilmeldt NemHandelsregisteret med et gyldigt EndpointID.'
                    : 'To send e-invoices to public institutions (government, regions, municipalities), your company must be registered in NemHandelsregisteret with a valid EndpointID.'}
                </p>
                <div className="flex flex-col gap-1 pt-1">
                  <p className="font-medium text-gray-700 dark:text-gray-300">
                    {isDa ? 'Hvorfor er det påkrævet?' : 'Why is it required?'}
                  </p>
                  <ul className="list-disc list-inside space-y-0.5">
                    <li>
                      {isDa
                        ? 'Lovkrav ifølge bogføringslovens krav til standard bogføringssystemer (BEK 98)'
                        : 'Legal requirement per the Danish Bookkeeping Act standard accounting system requirements (BEK 98)'}
                    </li>
                    <li>
                      {isDa
                        ? 'Krav N21 + N22 fra Erhvervsstyrelsens compliance-tjekliste'
                        : 'Requirements N21 + N22 from the Danish Business Authority compliance checklist'}
                    </li>
                    <li>
                      {isDa
                        ? 'Giver adgang til at sende fakturaer til alle offentlige institutioner i Danmark'
                        : 'Provides access to send invoices to all public institutions in Denmark'}
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* External link */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <FileText className="h-3.5 w-3.5 shrink-0" />
              <span>
                {isDa ? 'Læs mere på' : 'Read more at'}{' '}
                <a
                  href="https://digst.dk/it-loesninger/nemhandel/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#0d9488] hover:underline dark:text-[#99f6e4]"
                >
                  digst.dk/nemhandel
                  <ExternalLink className="h-3 w-3 inline ml-0.5" />
                </a>
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ═══ STORECOVE ACCESS POINT CARD ═══ */}
      <Card className="stat-card card-hover-lift border-0 shadow-lg dark:border dark:border-white/5">
        <CardHeader className="pb-4">
          <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0">
              <Link2 className="h-4 w-4 text-white" />
            </div>
            {isDa ? 'Storecove Access Point' : 'Storecove Access Point'}
            {storecoveStatus?.connected && (
              <Badge className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800/40 text-xs gap-1 ml-auto">
                <CheckCircle2 className="h-3 w-3" />
                {isDa ? 'Forbundet' : 'Connected'}
              </Badge>
            )}
          </CardTitle>
          <CardDescription className="text-sm text-gray-500 dark:text-gray-400">
            {isDa
              ? 'Peppol Access Point udbyder til automatisk e-faktura levering.'
              : 'Peppol Access Point provider for automatic e-invoice delivery.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* ── Connection status ── */}
          <div className={`rounded-xl p-4 border ${
            storecoveStatus?.connected && storecoveStatus?.healthy
              ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/40'
              : storecoveStatus?.connected
                ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800/40'
                : 'bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-white/10'
          }`}>
            <div className="flex items-center gap-4">
              <div className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 ${
                storecoveStatus?.connected && storecoveStatus?.healthy
                  ? 'bg-gradient-to-br from-emerald-500 to-green-500'
                  : storecoveStatus?.connected
                    ? 'bg-gradient-to-br from-yellow-400 to-amber-500'
                    : 'bg-gradient-to-br from-gray-400 to-gray-500'
              }`}>
                {storecoveStatus?.connected ? (
                  <Link2 className="h-6 w-6 text-white" />
                ) : (
                  <Unlink className="h-6 w-6 text-white" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    {storecoveStatus?.connected && storecoveStatus?.healthy
                      ? (isDa ? 'Forbundet med Storecove' : 'Connected to Storecove')
                      : storecoveStatus?.connected
                        ? (isDa ? 'Forbundet (ingen forbindelse)' : 'Connected (unhealthy)')
                        : (isDa ? 'Ikke forbundet' : 'Not connected')
                    }
                  </span>
                  {storecoveStatus?.connected && storecoveStatus?.healthy && (
                    <Badge className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800/40 text-[10px] gap-1">
                      <Activity className="h-3 w-3" />
                      {isDa ? 'Sund' : 'Healthy'}
                    </Badge>
                  )}
                </div>
                {storecoveStatus?.apiKeyId && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {isDa ? 'API-nøgle' : 'API Key'}: <span className="font-mono">••••{storecoveStatus.apiKeyId}</span>
                  </p>
                )}
                {storecoveStatus?.legalEntityId && (
                  <p className="text-xs text-muted-foreground">
                    {isDa ? 'Juridisk enhed ID' : 'Legal Entity ID'}: <span className="font-mono">{storecoveStatus.legalEntityId}</span>
                  </p>
                )}
                {storecoveStatus?.connectedAt && (
                  <p className="text-xs text-muted-foreground">
                    {isDa ? 'Forbundet' : 'Connected'}: {format(new Date(storecoveStatus.connectedAt), 'dd.MM.yyyy HH:mm', { locale })}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ── Connect / Disconnect ── */}
          {!storecoveStatus?.connected ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="storecoveApiKey" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  <Key className="h-3.5 w-3.5 inline mr-1" />
                  {isDa ? 'Storecove API-nøgle' : 'Storecove API Key'}
                  <span className="text-red-500 ml-0.5">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="storecoveApiKey"
                    type={showApiKey ? 'text' : 'password'}
                    value={storecoveApiKey}
                    onChange={(e) => setStorecoveApiKey(e.target.value)}
                    placeholder={isDa ? 'Indsæt din Storecove API-nøgle...' : 'Paste your Storecove API key...'}
                    className="h-10 bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 pr-20"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 text-[10px] text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? (isDa ? 'Skjul' : 'Hide') : (isDa ? 'Vis' : 'Show')}
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="storecoveLegalEntityId" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {isDa ? 'Juridisk enhed ID' : 'Legal Entity ID'}
                  <span className="text-muted-foreground ml-1 font-normal">({isDa ? 'frivilligt' : 'optional'})</span>
                </Label>
                <Input
                  id="storecoveLegalEntityId"
                  type="number"
                  value={storecoveLegalEntityId}
                  onChange={(e) => setStorecoveLegalEntityId(e.target.value)}
                  placeholder={isDa ? 'f.eks. 12345' : 'e.g. 12345'}
                  className="h-10 bg-white dark:bg-white/5 border-gray-200 dark:border-white/10"
                />
                <p className="text-xs text-muted-foreground">
                  {isDa
                    ? 'Kan findes i dit Storecove-dashboard under Legal Entities.'
                    : 'Can be found in your Storecove dashboard under Legal Entities.'}
                </p>
              </div>
              <Button
                onClick={handleConnectStorecove}
                disabled={isConnectingStorecove || !storecoveApiKey.trim()}
                className="w-full bg-violet-600 hover:bg-violet-700 text-white gap-2 font-medium transition-all"
              >
                {isConnectingStorecove ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4" />
                )}
                {isConnectingStorecove
                  ? (isDa ? 'Forbinder...' : 'Connecting...')
                  : (isDa ? 'Forbind Storecove' : 'Connect Storecove')
                }
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                onClick={handleTestStorecove}
                disabled={isTestingStorecove}
                variant="outline"
                className="flex-1 gap-2 font-medium border-gray-200 dark:border-white/10"
              >
                {isTestingStorecove ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Activity className="h-4 w-4" />
                )}
                {isDa ? 'Test forbindelse' : 'Test connection'}
              </Button>
              <Button
                onClick={handleDisconnectStorecove}
                disabled={isDisconnectingStorecove}
                variant="outline"
                className="gap-2 font-medium text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 border-gray-200 dark:border-white/10"
              >
                {isDisconnectingStorecove ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Unlink className="h-4 w-4" />
                )}
                {isDa ? 'Afbryd' : 'Disconnect'}
              </Button>
            </div>
          )}

          {/* ── Peppol Participant Lookup ── */}
          {storecoveStatus?.connected && (
            <>
              <Separator />
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                  <Search className="h-4 w-4" />
                  {isDa ? 'Peppol modtager-opslag' : 'Peppol Recipient Lookup'}
                </p>
                <div className="flex gap-2">
                  <Input
                    value={participantLookupId}
                    onChange={(e) => setParticipantLookupId(e.target.value)}
                    placeholder={isDa ? 'CVR-nummer (f.eks. 12345678)' : 'CVR number (e.g. 12345678)'}
                    className="h-10 bg-white dark:bg-white/5 border-gray-200 dark:border-white/10"
                    onKeyDown={(e) => e.key === 'Enter' && handleLookupParticipant()}
                  />
                  <Button
                    onClick={handleLookupParticipant}
                    disabled={isLookingUpParticipant}
                    variant="outline"
                    className="gap-2 shrink-0 border-gray-200 dark:border-white/10"
                  >
                    {isLookingUpParticipant ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                {/* Lookup result */}
                {participantLookupResult && (
                  <div className={`rounded-lg p-3 border text-xs ${
                    participantLookupResult.exists
                      ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/40'
                      : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/40'
                  }`}>
                    {participantLookupResult.exists ? (
                      <div className="space-y-1">
                        <p className="font-medium text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {isDa ? 'Modtager fundet på Peppol-netværket' : 'Recipient found on Peppol network'}
                        </p>
                        {participantLookupResult.name && (
                          <p className="text-emerald-700 dark:text-emerald-400">
                            {participantLookupResult.name}
                          </p>
                        )}
                        <p className="text-muted-foreground">
                          {isDa ? 'Schema' : 'Scheme'}: {participantLookupResult.scheme} | ID: {participantLookupResult.identifier}
                        </p>
                        {participantLookupResult.accessPoints && participantLookupResult.accessPoints.length > 0 && (
                          <p className="text-muted-foreground">
                            {isDa ? 'Access Point' : 'Access Point'}: {participantLookupResult.accessPoints[0].name}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="font-medium text-red-800 dark:text-red-300 flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {isDa
                          ? 'Modtager ikke fundet på Peppol-netværket. Kontroller CVR-nummeret.'
                          : 'Recipient not found on Peppol network. Check the identifier.'}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── Storecove info section ── */}
          <div className="space-y-3">
            <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400 info-box-primary rounded-lg p-3">
              <Info className="h-4 w-4 shrink-0 mt-0.5 text-violet-500 dark:text-violet-400" />
              <div className="space-y-2">
                <p className="font-semibold text-gray-700 dark:text-gray-300">
                  {isDa ? 'Hvad er Storecove?' : 'What is Storecove?'}
                </p>
                <p className="leading-relaxed">
                  {isDa
                    ? 'Storecove er en certificeret Peppol Access Point udbyder, der lader AlphaFlow sende e-fakturaer direkte til modtagere på Peppol-netværket og NemHandel — uden manuel upload.'
                    : 'Storecove is a certified Peppol Access Point provider that lets AlphaFlow send e-invoices directly to recipients on the Peppol network and NemHandel — without manual upload.'}
                </p>
                <p className="leading-relaxed">
                  {isDa
                    ? 'Workflow: Generer XML → Valider → Send til Storecove API → Automatisk leveret via Peppol/NemHandel.'
                    : 'Workflow: Generate XML → Validate → Send to Storecove API → Auto-delivered via Peppol/NemHandel.'}
                </p>
                <div className="flex flex-col gap-1 pt-1">
                  <p className="font-medium text-gray-700 dark:text-gray-300">
                    {isDa ? 'Fordele' : 'Benefits'}
                  </p>
                  <ul className="list-disc list-inside space-y-0.5">
                    <li>
                      {isDa
                        ? 'Automatisk levering til både Peppol og NemHandel netværk'
                        : 'Automatic delivery to both Peppol and NemHandel networks'}
                    </li>
                    <li>
                      {isDa
                        ? 'Realtids statussporing med webhooks'
                        : 'Real-time delivery status tracking with webhooks'}
                    </li>
                    <li>
                      {isDa
                        ? 'Peppol modtager-opslag inden afsendelse'
                        : 'Peppol recipient lookup before sending'}
                    </li>
                    <li>
                      {isDa
                        ? 'Ingen manuel upload til NemHandel-portalen'
                        : 'No manual upload to NemHandel portal'}
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* External links */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                <a
                  href="https://www.storecove.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-violet-600 hover:underline dark:text-violet-400"
                >
                  storecove.com
                </a>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <a
                  href="https://www.storecove.com/docs/api/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-violet-600 hover:underline dark:text-violet-400"
                >
                  {isDa ? 'API-dokumentation' : 'API Documentation'}
                </a>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
