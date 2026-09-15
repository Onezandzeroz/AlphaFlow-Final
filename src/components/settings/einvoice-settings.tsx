'use client';

import { useState, useEffect, useCallback } from 'react';
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
  Activity,
  PlusCircle,
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
  deliveryMode: 'manual' | 'automatic' | null;
  registeredAt: string | null;
  registrationStatus: 'registered' | 'not_registered' | 'pending' | null;
  // Sproom (Access Point — Peppol + NemHandel)
  sproomChildCompanyId?: string | null;
  sproomConnectedAt?: string | null;
  sproomNemHandelRegistered?: boolean;
  sproomPeppolRegistered?: boolean;
  activeAccessPoint?: 'sproom' | 'simulation';
}

interface NemHandelRegistration {
  registrationNo: string | null;
  registeredAt: string | null;
  status: 'registered' | 'not_registered' | 'pending' | null;
}

interface SproomConnectionStatus {
  connected: boolean;
  childCompanyId?: string | null;
  connectedAt?: string | null;
  lastTestedAt?: string | null;
  healthy?: boolean;
  nemhandelRegistered?: boolean;
  peppolRegistered?: boolean;
  einvoiceEnabled?: boolean;
  defaultChannel?: string | null;
  endpointId?: string | null;
  deliveryMode?: string | null;
  cvrNumber?: string;
  cvrVerified?: boolean;
  // Platform-level config (server-resolved). Sproom is the only AP, so
  // 'simulation' indicates Sproom isn't configured (no
  // SPROOM_API_TOKEN in .env).
  activeAccessPoint?: 'sproom' | 'simulation';
  sproomConfigured?: boolean;
}

interface PeppolParticipantResult {
  exists: boolean;
  scheme: string;
  identifier: string;
  name?: string;
  countryCode?: string;
  accessPoints?: Array<{ id: string; name: string }>;
  simulated?: boolean;
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
  const [deliveryMode, setDeliveryMode] = useState<'manual' | 'automatic' | null>(null);

  // Registration data (read-only from server)
  const [registration, setRegistration] = useState<NemHandelRegistration>({
    registrationNo: null,
    registeredAt: null,
    status: null,
  });

  // Company CVR + verification status (gates Sproom child company creation)
  const [companyCvr, setCompanyCvr] = useState('');
  const [cvrVerified, setCvrVerified] = useState(false);

  // Sproom connection state (Access Point — Peppol + NemHandel)
  // Sproom is AlphaFlow's only AP. The Sproom card is shown whenever the
  // user selects Automatic delivery mode.
  const [sproomStatus, setSproomStatus] = useState<SproomConnectionStatus | null>(null);
  const [isCreatingSproomChild, setIsCreatingSproomChild] = useState(false);
  const [isTestingSproom, setIsTestingSproom] = useState(false);

  // Derived: is an Access Point connected? EndpointID + Peppol AS4 ID
  // are auto-managed by Sproom's create-child-company route, so the
  // manual-edit lock applies when Sproom is connected.
  const apConnected = !!sproomStatus?.connected;

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
        setDeliveryMode(data.deliveryMode);
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

  // Fetch company CVR + verification status for endpointId auto-fill
  // and for gating the Sproom child-company creation button
  const fetchCompanyCvr = useCallback(async () => {
    try {
      const res = await fetch('/api/company');
      if (res.ok) {
        const data = await res.json();
        if (data.companyInfo?.cvrNumber) {
          setCompanyCvr(data.companyInfo.cvrNumber);
          setEndpointId(prev => prev || `0184:${data.companyInfo.cvrNumber}`);
        }
        // cvrVerifiedAt != null means the CVR has been verified against
        // the Erhvervsstyrelsen CVR register (KYC gate for Sproom)
        setCvrVerified(!!data.companyInfo?.cvrVerifiedAt);
      }
    } catch {
      // Ignore — endpoint ID stays empty
    }
  }, []);

  // ── Fetch Sproom status ──
  // The /api/sproom/status route runs testConnection() with a 10s timeout,
  // so this can take a moment when the AP is reachable but slow. The card
  // renders with the cached state on first paint and re-renders when the
  // fetch resolves.
  const fetchSproomStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/sproom/status');
      if (res.ok) {
        const data = await res.json();
        setSproomStatus(data as SproomConnectionStatus);
      }
    } catch {
      // Ignore — status stays null, Sproom card won't render
    }
  }, []);

  useEffect(() => {
    fetchSettings();
    fetchCompanyCvr();
    fetchSproomStatus();
  }, [fetchSettings, fetchCompanyCvr, fetchSproomStatus]);

  // ── Create child company in Sproom (tenant-initiated) ──
  // Uses the platform Sproom parent credentials from .env, gated on CVR
  // verification. The route also registers the child in NemHandel + Peppol
  // and auto-configures einvoiceEnabled / endpointId / peppolAs4Id.
  const handleCreateSproomChild = useCallback(async () => {
    if (!cvrVerified) {
      toast.error(isDa
        ? 'Bekræft dit CVR-nummer i Virksomhedsindstillinger først.'
        : 'Verify your CVR number in Company settings first.');
      return;
    }
    setIsCreatingSproomChild(true);
    try {
      const res = await fetch('/api/sproom/create-child-company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        const isAccess = await handleMutationError(
          res,
          isDa ? 'Opret Sproom child company' : 'Create Sproom child company',
        );
        if (isAccess) { setIsCreatingSproomChild(false); return; }
        return;
      }

      const data = await res.json();
      const nemhandel = data.nemhandelRegistered;
      const peppol = data.peppolRegistered;
      toast.success(
        isDa ? 'Child company oprettet i Sproom!' : 'Child company created in Sproom!',
        {
          description: isDa
            ? `ID: ${data.childCompanyId} · NemHandel: ${nemhandel ? 'Tilmeldt' : 'Afventer'} · Peppol: ${peppol ? 'Tilmeldt' : 'Afventer'}`
            : `ID: ${data.childCompanyId} · NemHandel: ${nemhandel ? 'Registered' : 'Pending'} · Peppol: ${peppol ? 'Registered' : 'Pending'}`,
        },
      );
      fetchSproomStatus();
      fetchSettings(); // refresh einvoiceEnabled / endpointId / peppolAs4Id
    } catch (err) {
      toast.error(err instanceof Error ? err.message : (isDa ? 'Oprettelse fejlede' : 'Creation failed'));
    } finally {
      setIsCreatingSproomChild(false);
    }
  }, [cvrVerified, isDa, handleMutationError, fetchSproomStatus, fetchSettings]);

  // ── Test Sproom connection ──
  const handleTestSproom = useCallback(async () => {
    setIsTestingSproom(true);
    try {
      await fetchSproomStatus();
      toast.success(
        sproomStatus?.healthy
          ? (isDa ? 'Sproom-forbindelsen er aktiv' : 'Sproom connection is active')
          : (isDa ? 'Sproom-forbindelsen kunne ikke bekræftes' : 'Sproom connection could not be confirmed'),
      );
    } catch {
      toast.error(isDa ? 'Test fejlede' : 'Test failed');
    } finally {
      setIsTestingSproom(false);
    }
  }, [isDa, fetchSproomStatus, sproomStatus]);

  // ── Peppol/NemHandel participant lookup ──
  // Always uses Sproom's /api/sproom/participants endpoint (Sproom is
  // the only Access Point). Sproom uses scheme "DK:CVR" for Danish CVR
  // lookups; the route defaults sensibly when the scheme is omitted.
  const handleLookupParticipant = useCallback(async () => {
    if (!participantLookupId.trim()) {
      toast.error(isDa ? 'Indtast et CVR- eller identifikationsnummer' : 'Enter a CVR or identifier number');
      return;
    }
    setIsLookingUpParticipant(true);
    try {
      const res = await fetch('/api/sproom/participants', {
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

  // ── Save settings ──
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      // For automatic mode, enabled=true and endpointId is required.
      // For manual mode, enabled=false (user downloads XML manually).
      const isAutomatic = deliveryMode === 'automatic';
      const payload: Record<string, unknown> = {
        enabled: isAutomatic,
        deliveryMode,
        autoSendOnFinalize: isAutomatic ? autoSendOnFinalize : false,
        gln: gln || null,
        peppolAs4Id: peppolAs4Id || null,
      };

      if (isAutomatic) {
        payload.defaultChannel = defaultChannel;
        payload.endpointId = endpointId || `0184:${companyCvr}`;
      } else {
        payload.defaultChannel = defaultChannel || null;
        payload.endpointId = endpointId || null;
      }

      const res = await fetch('/api/company/einvoice-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
  }, [deliveryMode, defaultChannel, endpointId, companyCvr, gln, peppolAs4Id, autoSendOnFinalize, isDa, handleMutationError, fetchSettings]);

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
      {/* ═══ DELIVERY MODE CHOICE CARD ═══ */}
      <Card className="stat-card card-hover-lift border-0 shadow-lg dark:border dark:border-white/5">
        <CardHeader className="pb-4">
          <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#0d9488] to-[#14b8a6] flex items-center justify-center shrink-0">
              <Zap className="h-4 w-4 text-white" />
            </div>
            {isDa ? 'Leveringsmåde' : 'Delivery Method'}
          </CardTitle>
          <CardDescription className="text-sm text-gray-500 dark:text-gray-400">
            {isDa
              ? 'Vælg hvordan du vil levere e-fakturaer til modtagere.'
              : 'Choose how you want to deliver e-invoices to recipients.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* ── Manual option ── */}
            <button
              type="button"
              onClick={() => {
                setDeliveryMode('manual');
                setEnabled(false);
              }}
              className={`relative rounded-xl p-4 text-left transition-all duration-200 border-2 ${
                deliveryMode === 'manual'
                  ? 'border-[#0d9488] bg-[#f0fdfa] dark:bg-[#0d9488]/10 dark:border-[#14b8a6]'
                  : 'border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 hover:border-gray-300 dark:hover:border-white/20'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
                  deliveryMode === 'manual'
                    ? 'bg-gradient-to-br from-[#0d9488] to-[#14b8a6]'
                    : 'bg-gray-100 dark:bg-white/10'
                }`}>
                  <FileText className={`h-5 w-5 ${deliveryMode === 'manual' ? 'text-white' : 'text-gray-500 dark:text-gray-400'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${deliveryMode === 'manual' ? 'text-[#0d9488] dark:text-[#14b8a6]' : 'text-gray-900 dark:text-white'}`}>
                    {isDa ? 'Manuel download' : 'Manual download'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {isDa
                      ? 'Generer OIOUBL-XML og upload manuelt til NemHandel-portalen eller send via anden Access Point.'
                      : 'Generate OIOUBL XML and manually upload to NemHandel portal or send via another Access Point.'}
                  </p>
                </div>
              </div>
              {deliveryMode === 'manual' && (
                <div className="absolute top-2 right-2">
                  <CheckCircle2 className="h-5 w-5 text-[#0d9488] dark:text-[#14b8a6]" />
                </div>
              )}
            </button>

            {/* ── Automatic option ── */}
            <button
              type="button"
              onClick={() => {
                setDeliveryMode('automatic');
                setEnabled(true);
              }}
              className={`relative rounded-xl p-4 text-left transition-all duration-200 border-2 ${
                deliveryMode === 'automatic'
                  ? 'border-[#8b5cf6] bg-[#f5f3ff] dark:bg-[#8b5cf6]/10 dark:border-[#a78bfa]'
                  : 'border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 hover:border-gray-300 dark:hover:border-white/20'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
                  deliveryMode === 'automatic'
                    ? 'bg-gradient-to-br from-violet-500 to-purple-600'
                    : 'bg-gray-100 dark:bg-white/10'
                }`}>
                  <Zap className={`h-5 w-5 ${deliveryMode === 'automatic' ? 'text-white' : 'text-gray-500 dark:text-gray-400'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${deliveryMode === 'automatic' ? 'text-violet-600 dark:text-violet-400' : 'text-gray-900 dark:text-white'}`}>
                    {isDa ? 'Automatisk eLevering' : 'Automatic eDelivery'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {isDa
                      ? 'Send direkte fra AlphaFlow via NemHandel/Peppol. Kræver EndpointID og Sproom Access Point.'
                      : 'Send directly from AlphaFlow via NemHandel/Peppol. Requires EndpointID and Sproom Access Point.'}
                  </p>
                </div>
              </div>
              {deliveryMode === 'automatic' && (
                <div className="absolute top-2 right-2">
                  <CheckCircle2 className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                </div>
              )}
            </button>
          </div>

          {/* ── Manual mode info ── */}
          {deliveryMode === 'manual' && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400 info-box-primary rounded-lg p-3">
                <Info className="h-4 w-4 shrink-0 mt-0.5 text-[#14b8a6] dark:text-[#99f6e4]" />
                <div className="space-y-2">
                  <p className="font-semibold text-gray-700 dark:text-gray-300">
                    {isDa ? 'Hvordan fungerer manuel e-fakturering?' : 'How does manual e-invoicing work?'}
                  </p>
                  <ol className="list-decimal list-inside space-y-0.5 leading-relaxed">
                    <li>{isDa ? 'Opret en faktura i AlphaFlow' : 'Create an invoice in AlphaFlow'}</li>
                    <li>{isDa ? 'Klik "Download OIOUBL-XML" på fakturaen' : 'Click "Download OIOUBL XML" on the invoice'}</li>
                    <li>{isDa ? 'Upload XML-filen til NemHandel-portalen eller din Access Point' : 'Upload the XML file to the NemHandel portal or your Access Point'}</li>
                  </ol>
                  <p className="leading-relaxed">
                    {isDa
                      ? 'Denne metode kræver ikke EndpointID eller Access Point opsætning, men du skal manuelt uploade hver faktura.'
                      : 'This method does not require EndpointID or Access Point setup, but you must manually upload each invoice.'}
                  </p>
                </div>
              </div>

              {/* Save button for manual mode */}
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
                    : (isDa ? 'Gem valg' : 'Save choice')
                  }
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ AUTOMATIC MODE: E-INVOICE CONFIG CARD ═══ */}
      {deliveryMode === 'automatic' && (
        <Card className="stat-card card-hover-lift border-0 shadow-lg dark:border dark:border-white/5">
          <CardHeader className="pb-4">
            <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#0d9488] to-[#14b8a6] flex items-center justify-center shrink-0">
                <Settings className="h-4 w-4 text-white" />
              </div>
              {isDa ? 'Automatisk e-faktura indstillinger' : 'Automatic e-invoice settings'}
            </CardTitle>
            <CardDescription className="text-sm text-gray-500 dark:text-gray-400">
              {isDa
                ? 'Konfigurer afsendelse af e-fakturaer via NemHandel og Peppol.'
                : 'Configure e-invoice sending via NemHandel and Peppol.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* ── Default channel ── */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {isDa ? 'Standardkanal' : 'Default channel'}
                <span className="text-red-500 ml-0.5">*</span>
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

            {/* ── EndpointID ── */}
            {/* When Sproom is connected, this is MANAGED by the AP
                (auto-set to 0184:<CVR>) and must NOT be edited manually. */}
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
                  className="h-10 bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 pr-24"
                  readOnly={apConnected}
                  disabled={apConnected}
                />
                {apConnected ? (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 text-[10px] font-medium text-[#0d9488] dark:text-[#14b8a6] bg-[#0d9488]/10 dark:bg-[#14b8a6]/10 px-2 py-0.5 rounded">
                    <ShieldCheck className="h-3 w-3" />
                    {isDa ? `Auto fra Sproom` : `Auto from Sproom`}
                  </span>
                ) : companyCvr && !endpointId ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 text-[10px] text-[#0d9488] hover:bg-[#0d9488]/10"
                    onClick={() => setEndpointId(`0184:${companyCvr}`)}
                  >
                    {isDa ? 'Auto-udfyld' : 'Auto-fill'}
                  </Button>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {apConnected
                  ? (isDa
                      ? `Håndteres automatisk af din Sproom child company. Kan ikke ændres manuelt.`
                      : `Managed automatically by your Sproom child company. Cannot be edited manually.`)
                  : (isDa
                      ? 'Dit unikke EndpointID i NemHandel-netværket. Schema 0184 = DK CVR.'
                      : 'Your unique EndpointID in the NemHandel network. Scheme 0184 = DK CVR.')}
              </p>
            </div>

            {/* ── GLN/EAN number ── */}
            {/* Genuinely per-tenant — always editable. */}
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
            {/* When Sproom is connected, this is MANAGED by the AP
                (auto-set to 0188:CVR<CVR>) and must NOT be edited manually. */}
            <div className="space-y-1.5">
              <Label htmlFor="peppolAs4Id" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {isDa ? 'Peppol AS4 ID' : 'Peppol AS4 ID'}
                {apConnected
                  ? <span className="text-red-500 ml-0.5">*</span>
                  : <span className="text-muted-foreground ml-1 font-normal">({isDa ? 'frivilligt' : 'optional'})</span>
                }
              </Label>
              <div className="relative">
                <Input
                  id="peppolAs4Id"
                  value={peppolAs4Id}
                  onChange={(e) => setPeppolAs4Id(e.target.value)}
                  placeholder={`0188:CVR${companyCvr || 'xxxx'}`}
                  className="h-10 bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 pr-24"
                  readOnly={apConnected}
                  disabled={apConnected}
                />
                {apConnected ? (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 text-[10px] font-medium text-[#0d9488] dark:text-[#14b8a6] bg-[#0d9488]/10 dark:bg-[#14b8a6]/10 px-2 py-0.5 rounded">
                    <ShieldCheck className="h-3 w-3" />
                    {isDa ? `Auto fra Sproom` : `Auto from Sproom`}
                  </span>
                ) : companyCvr && !peppolAs4Id ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 text-[10px] text-blue-500 hover:bg-blue-500/10"
                    onClick={() => setPeppolAs4Id(`0188:CVR${companyCvr}`)}
                  >
                    {isDa ? 'Auto-udfyld' : 'Auto-fill'}
                  </Button>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {apConnected
                  ? (isDa
                      ? `Håndteres automatisk af din Sproom child company. Kan ikke ændres manuelt.`
                      : `Managed automatically by your Sproom child company. Cannot be edited manually.`)
                  : (isDa
                      ? 'Peppol AS4 Participant ID til Peppol-netværket. Format: 0188:CVRnummer.'
                      : 'Peppol AS4 Participant ID for the Peppol network. Format: 0188:CVRnumber.')}
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
          </CardContent>
        </Card>
      )}

      {/* ═══ AUTOMATIC MODE: NEMHANDELSREGISTERET CARD ═══ */}
      {deliveryMode === 'automatic' && (
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
            {registration.status !== 'registered' && (
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
                          ? 'Lovkrav ifølge bogføringsloven og Kravbekendtgørelsen (BEK nr. 97 af 2023)'
                          : 'Legal requirement per the Danish Bookkeeping Act and the Requirements Executive Order (BEK 97 of 2023)'}
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
      )}

      {/* ═══ AUTOMATIC MODE: SPROOM ACCESS POINT CARD ═══ */}
      {/* Shown whenever the user selects Automatic delivery mode. Sproom is
          AlphaFlow's only Access Point — supports both Peppol and NemHandel. */}
      {deliveryMode === 'automatic' && (
        <Card className="stat-card card-hover-lift border-0 shadow-lg dark:border dark:border-white/5">
          <CardHeader className="pb-4">
            <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#0d9488] to-[#14b8a6] flex items-center justify-center shrink-0">
                <Link2 className="h-4 w-4 text-white" />
              </div>
              {isDa ? 'Sproom Access Point' : 'Sproom Access Point'}
              {sproomStatus?.connected && (
                <Badge className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800/40 text-xs gap-1 ml-auto">
                  <CheckCircle2 className="h-3 w-3" />
                  {isDa ? 'Forbundet' : 'Connected'}
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="text-sm text-gray-500 dark:text-gray-400">
              {isDa
                ? 'Peppol + NemHandel Access Point udbyder til automatisk e-faktura levering.'
                : 'Peppol + NemHandel Access Point provider for automatic e-invoice delivery.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* ── Connection status ── */}
            <div className={`rounded-xl p-4 border ${
              sproomStatus?.connected && sproomStatus?.healthy
                ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/40'
                : sproomStatus?.connected
                  ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800/40'
                  : 'bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-white/10'
            }`}>
              <div className="flex items-center gap-4">
                <div className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 ${
                  sproomStatus?.connected && sproomStatus?.healthy
                    ? 'bg-gradient-to-br from-emerald-500 to-green-500'
                    : sproomStatus?.connected
                      ? 'bg-gradient-to-br from-yellow-400 to-amber-500'
                      : 'bg-gradient-to-br from-gray-400 to-gray-500'
                }`}>
                  {sproomStatus?.connected ? (
                    <Link2 className="h-6 w-6 text-white" />
                  ) : (
                    <Unlink className="h-6 w-6 text-white" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {sproomStatus?.connected && sproomStatus?.healthy
                        ? (isDa ? 'Forbundet med Sproom' : 'Connected to Sproom')
                        : sproomStatus?.connected
                          ? (isDa ? 'Forbundet (ingen forbindelse)' : 'Connected (unhealthy)')
                          : (isDa ? 'Ikke forbundet' : 'Not connected')
                      }
                    </span>
                    {sproomStatus?.connected && sproomStatus?.healthy && (
                      <Badge className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800/40 text-[10px] gap-1">
                        <Activity className="h-3 w-3" />
                        {isDa ? 'Sund' : 'Healthy'}
                      </Badge>
                    )}
                    {/* NemHandel + Peppol registration badges */}
                    {sproomStatus?.connected && (
                      <>
                        {sproomStatus.nemhandelRegistered ? (
                          <Badge className="bg-[#0d9488]/10 dark:bg-[#0d9488]/20 text-[#0d9488] dark:text-[#14b8a6] border-[#0d9488]/30 dark:border-[#14b8a6]/40 text-[10px] gap-1">
                            <ShieldCheck className="h-3 w-3" />
                            {isDa ? 'NemHandel' : 'NemHandel'}
                          </Badge>
                        ) : (
                          <Badge className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800/40 text-[10px] gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            {isDa ? 'NemHandel afventer' : 'NemHandel pending'}
                          </Badge>
                        )}
                        {sproomStatus.peppolRegistered ? (
                          <Badge className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800/40 text-[10px] gap-1">
                            <Globe className="h-3 w-3" />
                            Peppol
                          </Badge>
                        ) : (
                          <Badge className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800/40 text-[10px] gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            {isDa ? 'Peppol afventer' : 'Peppol pending'}
                          </Badge>
                        )}
                      </>
                    )}
                  </div>
                  {sproomStatus?.childCompanyId && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {isDa ? 'Child company ID' : 'Child company ID'}:{' '}
                      <span className="font-mono">{sproomStatus.childCompanyId}</span>
                    </p>
                  )}
                  {sproomStatus?.connectedAt && (
                    <p className="text-xs text-muted-foreground">
                      {isDa ? 'Forbundet' : 'Connected'}:{' '}
                      {format(new Date(sproomStatus.connectedAt), 'dd.MM.yyyy HH:mm', { locale })}
                    </p>
                  )}
                  {sproomStatus?.lastTestedAt && (
                    <p className="text-xs text-muted-foreground">
                      {isDa ? 'Sidst testet' : 'Last tested'}:{' '}
                      {format(new Date(sproomStatus.lastTestedAt), 'dd.MM.yyyy HH:mm', { locale })}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* ── Create child company / Test connection ──
                Sproom uses parent-level OAuth2 credentials from .env
                (SPROOM_API_TOKEN). Tenants create their
                own child company here (KYC = CVR verified). The route
                also auto-registers in NemHandel + Peppol networks and
                auto-configures einvoiceEndpointId + peppolAs4Id. */}
            {!sproomStatus?.connected ? (
              <div className="space-y-3">
                {cvrVerified ? (
                  <>
                    <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 p-3 text-xs text-emerald-700 dark:text-emerald-400 flex items-start gap-2">
                      <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>
                        {isDa
                          ? `CVR ${companyCvr} er verificeret. Du kan oprette en child company i Sproom — AlphaFlow bruger platformens Sproom-konto automatisk og tilmelder dig både NemHandel og Peppol.`
                          : `CVR ${companyCvr} is verified. You can create a child company in Sproom — AlphaFlow uses the platform Sproom account automatically and registers you on both NemHandel and Peppol.`}
                      </span>
                    </div>
                    <Button
                      onClick={handleCreateSproomChild}
                      disabled={isCreatingSproomChild}
                      className="w-full bg-[#0d9488] hover:bg-[#0f766e] text-white gap-2 font-medium transition-all"
                    >
                      {isCreatingSproomChild ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <PlusCircle className="h-4 w-4" />
                      )}
                      {isCreatingSproomChild
                        ? (isDa ? 'Opretter...' : 'Creating...')
                        : (isDa ? 'Opret child company i Sproom' : 'Create child company in Sproom')
                      }
                    </Button>
                  </>
                ) : (
                  <div className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-lg p-3">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>
                      {isDa
                        ? 'Du skal verificere dit CVR-nummer i Virksomhedsindstillinger før du kan oprette en child company i Sproom. Sproom kræver at KYC håndteres af AlphaFlow som kontrahent.'
                        : 'You must verify your CVR number in Company settings before creating a child company in Sproom. Sproom requires KYC to be handled by AlphaFlow as the contractor.'}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex gap-2">
                <Button
                  onClick={handleTestSproom}
                  disabled={isTestingSproom}
                  variant="outline"
                  className="flex-1 gap-2 font-medium border-gray-200 dark:border-white/10"
                >
                  {isTestingSproom ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Activity className="h-4 w-4" />
                  )}
                  {isDa ? 'Test forbindelse' : 'Test connection'}
                </Button>
              </div>
            )}

            {/* ── Peppol/NemHandel Participant Lookup ── */}
            {sproomStatus?.connected && (
              <>
                <Separator />
                <div className="space-y-3">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                    <Search className="h-4 w-4" />
                    {isDa ? 'Peppol/NemHandel modtager-opslag' : 'Peppol/NemHandel Recipient Lookup'}
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
                            {isDa ? 'Modtager fundet på Peppol/NemHandel-netværket' : 'Recipient found on Peppol/NemHandel network'}
                          </p>
                          {participantLookupResult.name && (
                            <p className="text-emerald-700 dark:text-emerald-400">
                              {participantLookupResult.name}
                            </p>
                          )}
                          <p className="text-muted-foreground">
                            {isDa ? 'Schema' : 'Scheme'}: {participantLookupResult.scheme} | ID: {participantLookupResult.identifier}
                          </p>
                          {participantLookupResult.simulated && (
                            <p className="text-muted-foreground italic">
                              {isDa ? '(simuleret — Sproom er ikke konfigureret på platformen)' : '(simulated — Sproom not configured on platform)'}
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="font-medium text-red-800 dark:text-red-300 flex items-center gap-1">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {isDa
                            ? 'Modtager ikke fundet på Peppol/NemHandel-netværket. Kontroller CVR-nummeret.'
                            : 'Recipient not found on Peppol/NemHandel network. Check the identifier.'}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ── Sproom info section ── */}
            <div className="space-y-3">
              <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400 info-box-primary rounded-lg p-3">
                <Info className="h-4 w-4 shrink-0 mt-0.5 text-[#14b8a6] dark:text-[#99f6e4]" />
                <div className="space-y-2">
                  <p className="font-semibold text-gray-700 dark:text-gray-300">
                    {isDa ? 'Hvad er Sproom?' : 'What is Sproom?'}
                  </p>
                  <p className="leading-relaxed">
                    {isDa
                      ? 'Sproom er en certificeret Access Point udbyder for både Peppol og NemHandel. AlphaFlow sender raw OIOUBL/PeppolBIS3 XML direkte til Sproom, som leverer den videre til modtageren på det korrekte netværk — uden manuel upload.'
                      : 'Sproom is a certified Access Point provider for both Peppol and NemHandel. AlphaFlow sends raw OIOUBL/PeppolBIS3 XML directly to Sproom, which delivers it to the recipient on the correct network — without manual upload.'}
                  </p>
                  <p className="leading-relaxed">
                    {isDa
                      ? 'Workflow: Generer XML → Send til Sproom API → Automatisk leveret via Peppol/NemHandel. Sproom understøtter statuspolling og webhook-signaturer (RSA-SHA256).'
                      : 'Workflow: Generate XML → Send to Sproom API → Auto-delivered via Peppol/NemHandel. Sproom supports status polling and webhook signatures (RSA-SHA256).'}
                  </p>
                  <div className="flex flex-col gap-1 pt-1">
                    <p className="font-medium text-gray-700 dark:text-gray-300">
                      {isDa ? 'Fordele' : 'Benefits'}
                    </p>
                    <ul className="list-disc list-inside space-y-0.5">
                      <li>
                        {isDa
                          ? 'Ét barn-virksomhed ID dækker både Peppol og NemHandel'
                          : 'One child company ID covers both Peppol and NemHandel'}
                      </li>
                      <li>
                        {isDa
                          ? 'Direkte raw-XML upload (ingen JSON-konvertering)'
                          : 'Direct raw-XML upload (no JSON conversion)'}
                      </li>
                      <li>
                        {isDa
                          ? 'Realtids statussporing via /api/documents/{id}/state'
                          : 'Real-time status tracking via /api/documents/{id}/state'}
                      </li>
                      <li>
                        {isDa
                          ? 'RSA-signede webhooks (SHA256withRSA)'
                          : 'RSA-signed webhooks (SHA256withRSA)'}
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
                    href="https://sproom.net/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#0d9488] hover:underline dark:text-[#99f6e4]"
                  >
                    sproom.net
                  </a>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  <a
                    href="https://sproom.net/api"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#0d9488] hover:underline dark:text-[#99f6e4]"
                  >
                    {isDa ? 'API-dokumentation' : 'API Documentation'}
                  </a>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
