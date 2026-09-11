'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { useTranslation } from '@/lib/use-translation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Shield, Eye, Search, Building2, Users, AlertTriangle, X, Loader2,
  ChevronRight, Crown, Clock, MoreVertical, Play, Ban, Timer,
  Bot, CheckCircle2, XCircle, CreditCard,
  UserX, Trash2, Mail, Calendar,
} from 'lucide-react';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import { da } from 'date-fns/locale';

// ─── Types ──────────────────────────────────────────────────────────────

interface TrialInfo {
  isActive: boolean;
  earliestExpiry: string | null;
  activeMembers: number;
}

interface Tenant {
  id: string;
  name: string;
  email: string;
  cvrNumber: string;
  cvrVerifiedAt: string | null;
  companyType: string | null;
  isDemo: boolean;
  isActive: boolean;
  memberCount: number;
  createdAt: string;
  trial: TrialInfo;
  subscriptionRevoked?: boolean;
  // ── Plan tier info (FASE 5) ──
  planTier?: string;
  planPurchasedAt?: string | null;
  planExpiresAt?: string | null;
  planNotes?: string | null;
}

// ─── Component ──────────────────────────────────────────────────────────

export function OversightSettings() {
  const user = useAuthStore(state => state.user);
  const checkAuth = useAuthStore(state => state.checkAuth);
  const startOversight = useAuthStore(state => state.startOversight);
  const stopOversight = useAuthStore(state => state.stopOversight);
  const { language } = useTranslation();
  const isDa = language === 'da';

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [switching, setSwitching] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [promoting, setPromoting] = useState(false);
  const [promoteConfirmOpen, setPromoteConfirmOpen] = useState(false);
  const [trialLoading, setTrialLoading] = useState<string | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState<string | null>(null);
  const [hermesLoading, setHermesLoading] = useState<string | null>(null);
  const [hermesTenants, setHermesTenants] = useState<Map<string, boolean>>(new Map());
  const [hermesDataAccessTenants, setHermesDataAccessTenants] = useState<Map<string, boolean>>(new Map());

  // ── Unverified users (hard-delete abandoned sign-ups) ──
  interface UnverifiedUser {
    id: string;
    email: string;
    businessName: string | null;
    createdAt: string;
    hasVerificationToken: boolean;
    companies: Array<{
      id: string;
      name: string;
      isDemo: boolean;
      isSoleMember: boolean;
      role: string;
      createdAt: string;
    }>;
  }
  const [unverifiedUsers, setUnverifiedUsers] = useState<UnverifiedUser[]>([]);
  const [unverifiedLoading, setUnverifiedLoading] = useState(false);
  const [unverifiedSearch, setUnverifiedSearch] = useState('');
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<UnverifiedUser | null>(null);

  const isSuperDev = user?.isSuperDev ?? false;
  const isOversightMode = user?.isOversightMode ?? false;
  const oversightCompanyName = user?.oversightCompanyName;
  const isAlphaAiCompany = user?.activeCompanyName?.startsWith('AlphaAi') ?? false;

  const fetchTenants = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      const res = await fetch(`/api/oversight/tenants?${params}`);
      if (res.ok) {
        const data = await res.json();
        const rawTenants: Tenant[] = (data.tenants || []).map((t: Tenant) => ({
          ...t,
          trial: t.trial ?? { isActive: false, earliestExpiry: null, activeMembers: 0 },
        }));
        // Pin AlphaAi (AppOwner) company to top
        const alphaAiTenants = rawTenants.filter((t) => t.name.startsWith('AlphaAi'));
        const otherTenants = rawTenants.filter((t) => !t.name.startsWith('AlphaAi'));
        setTenants([...alphaAiTenants, ...otherTenants]);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [search]);

  // ─── Fetch Hermes status for all tenants ────────────────────────
  const fetchHermesTenants = useCallback(async () => {
    if (!isSuperDev) return;
    try {
      const res = await fetch('/api/hermes/tenants');
      if (res.ok) {
        const data = await res.json();
        const enabledMap = new Map<string, boolean>();
        const dataAccessMap = new Map<string, boolean>();
        for (const t of data.tenants || []) {
          enabledMap.set(t.companyId, t.hermesEnabled);
          dataAccessMap.set(t.companyId, t.dataAccessEnabled);
        }
        setHermesTenants(enabledMap);
        setHermesDataAccessTenants(dataAccessMap);
      }
    } catch { /* ignore */ }
  }, [isSuperDev]);

  // ─── Fetch unverified users ────────────────────────────────────
  const fetchUnverifiedUsers = useCallback(async () => {
    setUnverifiedLoading(true);
    try {
      const params = new URLSearchParams();
      if (unverifiedSearch) params.set('search', unverifiedSearch);
      const res = await fetch(`/api/oversight/unverified-users?${params}`);
      if (res.ok) {
        const data = await res.json();
        setUnverifiedUsers(data.users || []);
      }
    } catch {
      // silently fail
    } finally {
      setUnverifiedLoading(false);
    }
  }, [unverifiedSearch]);

  // ─── Delete an unverified user ─────────────────────────────────
  const handleDeleteUnverified = async (u: UnverifiedUser) => {
    setDeletingUserId(u.id);
    try {
      const res = await fetch(`/api/oversight/users/${u.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || 'Sletning mislykkedes');
      }
      toast.success(
        isDa ? 'Bruger slettet' : 'User deleted',
        {
          description: isDa
            ? `${u.email} er permanent slettet${data.deleted?.companiesDeleted > 0 ? ` (${data.deleted.companiesDeleted} virksomhed(er) også fjernet)` : ''}`
            : `${u.email} has been permanently deleted${data.deleted?.companiesDeleted > 0 ? ` (${data.deleted.companiesDeleted} company/companies also removed)` : ''}`,
        }
      );
      setDeleteConfirmUser(null);
      // Refresh the list
      fetchUnverifiedUsers();
      // Also refresh tenants (in case orphaned companies were deleted)
      fetchTenants();
    } catch (err) {
      toast.error(
        isDa ? 'Kunne ikke slette bruger' : 'Could not delete user',
        { description: err instanceof Error ? err.message : undefined }
      );
    } finally {
      setDeletingUserId(null);
    }
  };

  useEffect(() => {
    if (isSuperDev) {
      setLoading(true);
      fetchTenants();
      fetchHermesTenants();
    } else {
      setLoading(false);
    }
  }, [isSuperDev, fetchTenants, fetchHermesTenants]);

  // ─── Hermes toggle management ──────────────────────────────────

  const handleToggleHermes = async (tenant: Tenant, enabled: boolean) => {
    setHermesLoading(tenant.id);
    try {
      const res = await fetch('/api/hermes/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: tenant.id, enabled }),
      });
      if (res.ok) {
        const newMap = new Map(hermesTenants);
        newMap.set(tenant.id, enabled);
        setHermesTenants(newMap);
        toast.success(
          enabled
            ? (isDa ? `Hermes aktiveret for ${tenant.name}` : `Hermes enabled for ${tenant.name}`)
            : (isDa ? `Hermes deaktiveret for ${tenant.name}` : `Hermes disabled for ${tenant.name}`)
        );
      } else {
        toast.error(isDa ? 'Kunne ikke opdatere Hermes' : 'Failed to update Hermes');
      }
    } catch {
      toast.error(isDa ? 'Kunne ikke opdatere Hermes' : 'Failed to update Hermes');
    } finally {
      setHermesLoading(null);
    }
  };

  // ─── Trial management ────────────────────────────────────────

  const handleTrialAction = async (tenant: Tenant, action: 'set' | 'cancel', days?: number) => {
    setTrialLoading(tenant.id);
    try {
      const res = await fetch('/api/oversight/trial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: tenant.id, action, days }),
      });
      const data = await res.json();

      if (res.ok && data.failed === 0) {
        const msg = action === 'set'
          ? (isDa
            ? `${days}-dages prøveperiode aktiveret for ${tenant.name}`
            : `${days}-day trial activated for ${tenant.name}`)
          : (isDa
            ? `Prøveperiode annulleret for ${tenant.name}`
            : `Trial cancelled for ${tenant.name}`);
        toast.success(isDa ? 'Prøveperiode opdateret' : 'Trial updated', {
          description: `${msg} (${data.succeeded} ${isDa ? 'medlemmer' : 'members'})`,
        });
        // Refresh tenant list to update trial indicators
        await fetchTenants();
      } else {
        const failCount = data.failed ?? 0;
        toast.error(
          isDa ? 'Kunne ikke opdatere prøveperiode' : 'Failed to update trial',
          { description: `${failCount} ${isDa ? 'fejlede' : 'failed'}${data.results?.[0]?.error ? `: ${data.results[0].error}` : ''}` },
        );
      }
    } catch (error) {
      toast.error(
        isDa ? 'Kunne ikke opdatere prøveperiode' : 'Failed to update trial',
        { description: error instanceof Error ? error.message : undefined },
      );
    } finally {
      setTrialLoading(null);
    }
  };

  // ─── Subscription access revocation (App Owner only) ───────────
  //
  // Revoke or restore the revenue-based free-tier access for all members
  // of a tenant. This ONLY affects subscription access — a tenant with a
  // valid .tbkey proof retains write access regardless.

  const handleSubscriptionAction = async (tenant: Tenant, action: 'revoke' | 'restore') => {
    const confirmMsg = action === 'revoke'
      ? (isDa
        ? `Fjern abonnementsadgang for ${tenant.name}?\n\nDette blokerer den gratis omsætningsbaserede adgang for alle ${tenant.memberCount} medlemmer. Medlemmer med et gyldigt .tbkey proof bevarer stadig skriveadgang.`
        : `Revoke subscription access for ${tenant.name}?\n\nThis blocks the revenue-based free-tier access for all ${tenant.memberCount} members. Members with a valid .tbkey proof will still keep write access.`)
      : (isDa
        ? `Gendan abonnementsadgang for ${tenant.name}?`
        : `Restore subscription access for ${tenant.name}?`);

    if (typeof window !== 'undefined' && !window.confirm(confirmMsg)) {
      return;
    }

    setSubscriptionLoading(tenant.id);
    try {
      const res = await fetch('/api/oversight/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: tenant.id, action }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        toast.success(
          action === 'revoke'
            ? (isDa ? 'Abonnementsadgang fjernet' : 'Subscription access revoked')
            : (isDa ? 'Abonnementsadgang gendannet' : 'Subscription access restored'),
          {
            description: `${tenant.name} (${data.affected} ${isDa ? 'medlemmer' : 'members'})`,
          },
        );
        await fetchTenants();
      } else {
        toast.error(
          isDa ? 'Kunne ikke opdatere abonnementsadgang' : 'Failed to update subscription access',
          { description: data.error || (isDa ? 'Ukendt fejl' : 'Unknown error') },
        );
      }
    } catch (error) {
      toast.error(
        isDa ? 'Kunne ikke opdatere abonnementsadgang' : 'Failed to update subscription access',
        { description: error instanceof Error ? error.message : undefined },
      );
    } finally {
      setSubscriptionLoading(null);
    }
  };

  // ─── Plan tier management (App Owner only) ────────────────────
  //
  // Activate a specific plan tier for a tenant. Sets Company.planTier,
  // planPurchasedAt, planExpiresAt (based on binding period).

  const handleSetPlanTier = async (tenant: Tenant, planId: string) => {
    const planLabels: Record<string, { da: string; en: string }> = {
      free: { da: 'Gratis', en: 'Free' },
      monthly: { da: 'Månedlig', en: 'Monthly' },
      annual: { da: 'Pro (årlig)', en: 'Pro (annual)' },
      '2year': { da: 'Business (2-årig)', en: 'Business (2-year)' },
      '3year': { da: 'Business Extended (3-årig)', en: 'Business Extended (3-year)' },
    };
    const label = planLabels[planId]?.[isDa ? 'da' : 'en'] || planId;

    const confirmMsg = isDa
      ? `Aktivér "${label}" for ${tenant.name}?\n\nDette sætter tenantens plan-tier og opdaterer tilgængelige features for alle ${tenant.memberCount} medlemmer.`
      : `Activate "${label}" for ${tenant.name}?\n\nThis sets the tenant's plan tier and updates available features for all ${tenant.memberCount} members.`;

    if (typeof window !== 'undefined' && !window.confirm(confirmMsg)) {
      return;
    }

    setSubscriptionLoading(tenant.id);
    try {
      const res = await fetch('/api/oversight/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: tenant.id, action: 'setPlan', planId }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        toast.success(
          isDa ? `Plan aktiveret: ${label}` : `Plan activated: ${label}`,
          { description: tenant.name },
        );
        await fetchTenants();
      } else {
        toast.error(
          isDa ? 'Kunne ikke aktivere plan' : 'Failed to activate plan',
          { description: data.error || (isDa ? 'Ukendt fejl' : 'Unknown error') },
        );
      }
    } catch (error) {
      toast.error(
        isDa ? 'Kunne ikke aktivere plan' : 'Failed to activate plan',
        { description: error instanceof Error ? error.message : undefined },
      );
    } finally {
      setSubscriptionLoading(null);
    }
  };

  // ─── Promote / Oversight handlers ─────────────────────────────

  const handlePromoteToSuperDev = async () => {
    setPromoting(true);
    try {
      const res = await fetch('/api/auth/promote-superdev', { method: 'POST' });
      const data = await res.json();

      if (res.ok) {
        toast.success(
          isDa ? 'Forfremmet til App-ejer!' : 'Promoted to App Owner!',
          {
            description: isDa
              ? 'Log ud og ind igen for at aktivere tilsynsfunktionen'
              : 'Log out and back in to activate the oversight feature',
          }
        );
        await checkAuth();
      } else {
        toast.error(
          isDa ? 'Kunne ikke forfremme' : 'Failed to promote',
          { description: data.error || (isDa ? 'Ukendt fejl' : 'Unknown error') }
        );
      }
    } catch (error) {
      toast.error(
        isDa ? 'Kunne ikke forfremme' : 'Failed to promote',
        { description: error instanceof Error ? error.message : undefined }
      );
    } finally {
      setPromoting(false);
      setPromoteConfirmOpen(false);
    }
  };

  const handleStartOversight = async (tenant: Tenant) => {
    setSwitching(tenant.id);
    try {
      await startOversight(tenant.id);
      toast.success(
        isDa ? `Overvåger nu ${tenant.name}` : `Now overseeing ${tenant.name}`,
        { description: isDa ? 'Alle data vises skrivebeskyttet' : 'All data shown in read-only mode' }
      );
    } catch (error) {
      toast.error(
        isDa ? 'Kunne ikke starte overvågning' : 'Failed to start oversight',
        { description: error instanceof Error ? error.message : undefined }
      );
    } finally {
      setSwitching(null);
      setConfirmOpen(false);
      setSelectedTenant(null);
    }
  };

  const handleStopOversight = async () => {
    try {
      await stopOversight();
      toast.success(
        isDa ? 'Overvågning afsluttet' : 'Oversight ended',
        { description: isDa ? 'Tilbage til din egen virksomhed' : 'Back to your own company' }
      );
    } catch {
      toast.error(isDa ? 'Kunne ikke afslutte overvågning' : 'Failed to end oversight');
    }
  };

  // ─── Helpers ──────────────────────────────────────────────────

  function formatTrialExpiry(iso: string): string {
    try {
      const date = new Date(iso);
      const dist = formatDistanceToNow(date, { addSuffix: false, locale: isDa ? da : undefined });
      return dist;
    } catch {
      return '';
    }
  }

  // ─── Non-SuperDev: Show promotion card (only for AlphaAi company) ──

  if (!isSuperDev) {
    if (!isAlphaAiCompany) {
      return null;
    }

    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-[#1a2e2a] dark:text-[#e2e8e6] flex items-center gap-2">
            <Shield className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            {isDa ? 'Tilsyn' : 'Oversight'}
          </h3>
          <p className="text-sm text-[#6b7c75]">
            {isDa
              ? 'AlphaAi App-ejer funktion — se alle virksomheder i skrivebeskyttet tilstand'
              : 'AlphaAi App Owner feature — view all companies in read-only mode'}
          </p>
        </div>

        <Card className="border-2 border-dashed border-amber-300 dark:border-amber-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <Crown className="h-5 w-5" />
              {isDa ? 'Bliv AlphaAi App-ejer' : 'Become AlphaAi App Owner'}
            </CardTitle>
            <CardDescription>
              {isDa
                ? 'Som App-ejer får du skrivebeskyttet adgang til alle virksomheder i systemet (god mode)'
                : 'As App Owner you get read-only access to all companies in the system (god mode)'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 p-4 space-y-3">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                {isDa ? 'Hvad du får:' : 'What you get:'}
              </p>
              <ul className="space-y-2 text-sm text-amber-700 dark:text-amber-400">
                <li className="flex items-start gap-2">
                  <Eye className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    {isDa
                      ? 'Skrivebeskyttet adgang til alle virksomheders data'
                      : 'Read-only access to all companies\' data'}
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Shield className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    {isDa
                      ? 'Alle ændringer er blokeret — kun læseadgang'
                      : 'All modifications are blocked — read-only access only'}
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Building2 className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    {isDa
                      ? 'Adgang logges i revisionslogen for gennemsigtighed'
                      : 'Access is logged in the audit trail for transparency'}
                  </span>
                </li>
              </ul>
            </div>

            <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 rounded-lg p-3">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <p>
                {isDa
                  ? 'Begrænset til én App-ejer pr. system. Når du er blevet forfremmet, kan ingen andre blive App-ejer.'
                  : 'Limited to one App Owner per system. Once promoted, no one else can become App Owner.'}
              </p>
            </div>

            <Button
              onClick={() => setPromoteConfirmOpen(true)}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white gap-2"
            >
              <Crown className="h-4 w-4" />
              {isDa ? 'Bliv App-ejer' : 'Become App Owner'}
            </Button>
          </CardContent>
        </Card>

        {/* Promote confirm dialog */}
        <Dialog open={promoteConfirmOpen} onOpenChange={setPromoteConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <Crown className="h-5 w-5" />
                {isDa ? 'Bekræft App-ejer forfremmelse' : 'Confirm App Owner Promotion'}
              </DialogTitle>
              <DialogDescription>
                {isDa
                  ? 'Du er ved at blive forfremmet til AlphaAi App-ejer. Dette giver dig skrivebeskyttet adgang til alle virksomheder i systemet.'
                  : 'You are about to be promoted to AlphaAi App Owner. This grants you read-only access to all companies in the system.'}
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 p-3 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium mb-1">
                  {isDa ? 'Vigtigt:' : 'Important:'}
                </p>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>{isDa ? 'Kun én App-ejer kan eksistere ad gangen' : 'Only one App Owner can exist at a time'}</li>
                  <li>{isDa ? 'Al oversight-adgang logges i revisionslogen' : 'All oversight access is logged in the audit trail'}</li>
                  <li>{isDa ? 'Du skal logge ud og ind igen efter forfremmelse' : 'You must log out and back in after promotion'}</li>
                </ul>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setPromoteConfirmOpen(false)}
                className="flex-1"
              >
                {isDa ? 'Annuller' : 'Cancel'}
              </Button>
              <Button
                onClick={handlePromoteToSuperDev}
                disabled={promoting}
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white gap-2"
              >
                {promoting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Crown className="h-4 w-4" />
                )}
                {isDa ? 'Bekræft forfremmelse' : 'Confirm Promotion'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ─── Active oversight mode banner ──────────────────────────────────

  if (isOversightMode) {
    return (
      <Card className="border-2 border-amber-400 dark:border-amber-600 shadow-lg">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <Eye className="h-5 w-5" />
            {isDa ? 'Overvågningstilstand aktiv' : 'Oversight Mode Active'}
          </CardTitle>
          <CardDescription className="text-sm">
            {isDa
              ? 'Du ser data fra en anden virksomhed i skrivebeskyttet tilstand'
              : 'You are viewing data from another company in read-only mode'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center shrink-0">
                <Building2 className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                  {oversightCompanyName}
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  {isDa ? 'Overvåget virksomhed' : 'Overseen company'}
                </p>
              </div>
              <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 border-amber-200 dark:border-amber-800">
                <Eye className="h-3 w-3 mr-1" />
                {isDa ? 'Skrivebeskyttet' : 'Read-only'}
              </Badge>
            </div>
          </div>

          <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 rounded-lg p-3">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <p>
              {isDa
                ? 'Du kan ikke oprette, redigere eller slette data mens du overvåger en anden virksomhed. Alle ændringer er blokeret.'
                : 'You cannot create, edit, or delete data while overseeing another company. All modifications are blocked.'}
            </p>
          </div>

          <Button
            onClick={handleStopOversight}
            className="w-full bg-amber-600 hover:bg-amber-700 text-white gap-2"
          >
            <X className="h-4 w-4" />
            {isDa ? 'Afslut overvågning' : 'End Oversight'}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ─── SuperDev: Show tenant list ────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-[#1a2e2a] dark:text-[#e2e8e6] flex items-center gap-2">
          <Shield className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          {isDa ? 'Tilsyn' : 'Oversight'}
        </h3>
        <p className="text-sm text-[#6b7c75]">
          {isDa
            ? 'Se alle virksomheder i skrivebeskyttet tilstand som AlphaAi app-ejer'
            : 'View all companies in read-only mode as the AlphaAi App Owner'}
        </p>
      </div>

      {/* Search */}
      <Card className="border-0 shadow-lg">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6b7c75]" />
            <Input
              placeholder={isDa ? 'Søg efter virksomhed, CVR eller e-mail...' : 'Search by company name, CVR, or email...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Tenant list */}
      <Card className="border-0 shadow-lg">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            {isDa ? 'Alle virksomheder' : 'All Companies'} ({tenants.length})
          </CardTitle>
          <CardDescription>
            {isDa
              ? 'Vælg en virksomhed for at se dens data i skrivebeskyttet tilstand'
              : 'Select a company to view its data in read-only mode'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-[#6b7c75]">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              {isDa ? 'Indlæser...' : 'Loading...'}
            </div>
          ) : tenants.length === 0 ? (
            <div className="text-center py-8 text-[#6b7c75]">
              {search
                ? (isDa ? 'Ingen virksomheder fundet' : 'No companies found')
                : (isDa ? 'Ingen virksomheder tilgængelige' : 'No companies available')}
            </div>
          ) : (
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {tenants.map((tenant) => {
                const isOwnCompany = tenant.id === user?.activeCompanyId;
                const isAlphaAi = tenant.name.startsWith('AlphaAi');
                const isTrialLoading = trialLoading === tenant.id;

                return (
                  <div
                    key={tenant.id}
                    className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                      isOwnCompany
                        ? 'bg-gray-50 dark:bg-white/5 opacity-50'
                        : isAlphaAi
                          ? 'bg-amber-50/80 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/30'
                          : 'bg-[#f8faf9] dark:bg-[#1a2520]'
                    }`}
                  >
                    {/* Clickable area — name + chevron for oversight */}
                    <button
                      type="button"
                      disabled={isOwnCompany || switching === tenant.id}
                      onClick={() => {
                        setSelectedTenant(tenant);
                        setConfirmOpen(true);
                      }}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer disabled:cursor-not-allowed"
                    >
                      <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                        isAlphaAi
                          ? 'bg-amber-200 dark:bg-amber-800/40'
                          : 'bg-amber-100 dark:bg-amber-900/30'
                      }`}>
                        {isAlphaAi
                          ? <Crown className="h-4 w-4 text-amber-700 dark:text-amber-300" />
                          : <Building2 className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#1a2e2a] dark:text-[#e2e8e6] truncate">
                          {tenant.name}
                          {isOwnCompany && (
                            <span className="text-[#6b7c75] ml-1 text-xs">
                              ({isDa ? 'din virksomhed' : 'your company'})
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-[#6b7c75] flex items-center gap-2 truncate">
                          {tenant.cvrNumber && (
                            <span className="flex items-center gap-1">
                              CVR: {tenant.cvrNumber}
                              {tenant.cvrVerifiedAt && (
                                <span
                                  className="inline-flex items-center"
                                  title={isDa
                                    ? `CVR bekræftet ${new Date(tenant.cvrVerifiedAt).toLocaleDateString('da-DK')}`
                                    : `CVR verified ${new Date(tenant.cvrVerifiedAt).toLocaleDateString()}`}
                                >
                                  <CheckCircle2 className="h-3 w-3 text-emerald-500 dark:text-emerald-400 shrink-0" />
                                </span>
                              )}
                            </span>
                          )}
                          {tenant.email && <span>{tenant.email}</span>}
                        </p>
                      </div>
                      {!isOwnCompany && (
                        <ChevronRight className="h-4 w-4 text-[#6b7c75] shrink-0" />
                      )}
                    </button>

                    {/* Right-side indicators (compact badges) */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Hermes AI indicator */}
                      {hermesTenants.get(tenant.id) && (
                        <Badge className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 px-1.5 flex items-center gap-0.5">
                          <Bot className="h-2.5 w-2.5" />
                          {hermesDataAccessTenants.get(tenant.id)
                            ? (isDa ? 'Hermes + Data' : 'Hermes + Data')
                            : (isDa ? 'Hermes' : 'Hermes')}
                        </Badge>
                      )}

                      {/* Member count */}
                      <Badge variant="outline" className="text-[10px] flex items-center gap-1 px-1.5">
                        <Users className="h-3 w-3" />
                        {tenant.memberCount}
                      </Badge>

                      {/* Trial indicator */}
                      {tenant.trial?.isActive ? (
                        <Badge className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 px-1.5 flex items-center gap-0.5">
                          <Timer className="h-2.5 w-2.5" />
                          {tenant.trial.earliestExpiry
                            ? formatTrialExpiry(tenant.trial.earliestExpiry)
                            : (isDa ? 'Prøve' : 'Trial')}
                        </Badge>
                      ) : (
                        !isOwnCompany && (
                          <Badge className="text-[10px] bg-gray-100 text-gray-500 dark:bg-gray-800/30 dark:text-gray-400 px-1.5">
                            {isDa ? 'Ingen prøve' : 'No trial'}
                          </Badge>
                        )
                      )}

                      {/* Demo / Inactive */}
                      {tenant.isDemo && (
                        <Badge className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 px-1.5">
                          Demo
                        </Badge>
                      )}
                      {!tenant.isActive && (
                        <Badge className="text-[10px] bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 px-1.5">
                          {isDa ? 'Inaktiv' : 'Inactive'}
                        </Badge>
                      )}
                      {/* Subscription revoked badge (App Owner revocation) */}
                      {tenant.subscriptionRevoked && (
                        <Badge
                          className="text-[10px] bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 px-1.5 flex items-center gap-0.5"
                          title={isDa
                            ? 'Abonnementsadgang fjernet af App-ejer (.tbkey proof gælder stadig)'
                            : 'Subscription access revoked by App Owner (.tbkey proof still valid)'}
                        >
                          <Ban className="h-2.5 w-2.5" />
                          {isDa ? 'Abonnement blokeret' : 'Sub. blocked'}
                        </Badge>
                      )}
                      {/* Plan tier badge (FASE 5) */}
                      {(() => {
                        const tier = tenant.planTier || 'free';
                        const tierColors: Record<string, string> = {
                          free: 'bg-gray-100 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400',
                          monthly: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
                          annual: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
                          twoyear: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
                          threeyear: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
                        };
                        const tierLabels: Record<string, { da: string; en: string }> = {
                          free: { da: 'Gratis', en: 'Free' },
                          monthly: { da: 'Månedlig', en: 'Monthly' },
                          annual: { da: 'Pro', en: 'Pro' },
                          twoyear: { da: 'Business', en: 'Business' },
                          threeyear: { da: 'Business+', en: 'Business+' },
                        };
                        return (
                          <Badge
                            className={`text-[10px] px-1.5 ${tierColors[tier] || tierColors.free}`}
                            title={tenant.planExpiresAt
                              ? (isDa
                                  ? `Aktiveret: ${new Date(tenant.planPurchasedAt || '').toLocaleDateString('da-DK')} — binding udløber: ${new Date(tenant.planExpiresAt).toLocaleDateString('da-DK')}`
                                  : `Activated: ${new Date(tenant.planPurchasedAt || '').toLocaleDateString('en-GB')} — binding expires: ${new Date(tenant.planExpiresAt).toLocaleDateString('en-GB')}`)
                              : undefined
                            }
                          >
                            {tierLabels[tier]?.[isDa ? 'da' : 'en'] || tier}
                          </Badge>
                        );
                      })()}

                      {/* Actions dropdown */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            disabled={isTrialLoading || hermesLoading === tenant.id || subscriptionLoading === tenant.id}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {(isTrialLoading || hermesLoading === tenant.id || subscriptionLoading === tenant.id)
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin text-[#6b7c75]" />
                              : <MoreVertical className="h-3.5 w-3.5 text-[#6b7c75]" />
                            }
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem
                            onClick={() => handleToggleHermes(tenant, !hermesTenants.get(tenant.id))}
                            disabled={hermesLoading === tenant.id}
                            className="gap-2 text-sm"
                          >
                              {hermesTenants.get(tenant.id) ? (
                                <>
                                  <XCircle className="h-3.5 w-3.5 text-red-500" />
                                  {isDa ? 'Deaktiver Hermes' : 'Disable Hermes'}
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 className="h-3.5 w-3.5 text-amber-600" />
                                  {isDa ? 'Aktiver Hermes AI' : 'Enable Hermes AI'}
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {!isOwnCompany && (
                              <>
                                <DropdownMenuItem
                                  onClick={() => handleTrialAction(tenant, 'set', 30)}
                                  disabled={isTrialLoading}
                                  className="gap-2 text-sm"
                                >
                                  <Play className="h-3.5 w-3.5 text-emerald-600" />
                                  {isDa ? 'Start prøve — 30 dage' : 'Start trial — 30 days'}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleTrialAction(tenant, 'set', 60)}
                                  disabled={isTrialLoading}
                                  className="gap-2 text-sm"
                                >
                                  <Play className="h-3.5 w-3.5 text-emerald-600" />
                                  {isDa ? 'Start prøve — 60 dage' : 'Start trial — 60 days'}
                                </DropdownMenuItem>
                                {tenant.trial?.isActive && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => handleTrialAction(tenant, 'cancel')}
                                      disabled={isTrialLoading}
                                      className="gap-2 text-sm text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400 focus:bg-red-50 dark:focus:bg-red-950/30"
                                    >
                                      <Ban className="h-3.5 w-3.5" />
                                      {isDa ? 'Annuller prøveperiode' : 'Cancel trial'}
                                    </DropdownMenuItem>
                                  </>
                                )}
                                {/* Subscription access revoke/restore (App Owner only) */}
                                <DropdownMenuSeparator />
                                {tenant.subscriptionRevoked ? (
                                  <DropdownMenuItem
                                    onClick={() => handleSubscriptionAction(tenant, 'restore')}
                                    disabled={subscriptionLoading === tenant.id}
                                    className="gap-2 text-sm text-emerald-600 dark:text-emerald-400 focus:text-emerald-600 dark:focus:text-emerald-400 focus:bg-emerald-50 dark:focus:bg-emerald-950/30"
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    {isDa ? 'Gendan abonnementsadgang' : 'Restore subscription access'}
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem
                                    onClick={() => handleSubscriptionAction(tenant, 'revoke')}
                                    disabled={subscriptionLoading === tenant.id}
                                    className="gap-2 text-sm text-orange-600 dark:text-orange-400 focus:text-orange-600 dark:focus:text-orange-400 focus:bg-orange-50 dark:focus:bg-orange-950/30"
                                  >
                                    <Ban className="h-3.5 w-3.5" />
                                    {isDa ? 'Fjern abonnementsadgang' : 'Revoke subscription access'}
                                  </DropdownMenuItem>
                                )}
                                {/* Plan tier selector (FASE 5 — App Owner activates paid plans) */}
                                <DropdownMenuSeparator />
                                <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                                  {isDa ? 'Sæt plan-tier' : 'Set plan tier'}
                                </p>
                                {([
                                  { id: 'free', da: 'Gratis', en: 'Free' },
                                  { id: 'monthly', da: 'Månedlig (199 kr/md)', en: 'Monthly (199 DKK/mo)' },
                                  { id: 'annual', da: 'Pro — 12 mdr (169 kr/md)', en: 'Pro — 12 mo (169 DKK/mo)' },
                                  { id: '2year', da: 'Business — 24 mdr (149 kr/md)', en: 'Business — 24 mo (149 DKK/mo)' },
                                  { id: '3year', da: 'Business+ — 36 mdr (145 kr/md)', en: 'Business+ — 36 mo (145 DKK/mo)' },
                                ]).map((opt) => {
                                  const currentTier = tenant.planTier || 'free';
                                  const isActive = currentTier === opt.id;
                                  return (
                                    <DropdownMenuItem
                                      key={opt.id}
                                      onClick={() => handleSetPlanTier(tenant, opt.id)}
                                      disabled={subscriptionLoading === tenant.id || isActive}
                                      className={`gap-2 text-sm ${isActive ? 'font-semibold text-[#0d9488]' : ''}`}
                                    >
                                      {isActive
                                        ? <CheckCircle2 className="h-3.5 w-3.5 text-[#0d9488]" />
                                        : <CreditCard className="h-3.5 w-3.5 text-gray-400" />
                                      }
                                      {isDa ? opt.da : opt.en}
                                    </DropdownMenuItem>
                                  );
                                })}
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Unverified users cleanup ────────────────────────────── */}
      <Card className="border-0 shadow-lg">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <UserX className="h-4 w-4 text-amber-500" />
                {isDa ? 'Ubekræftede brugere' : 'Unverified users'}
                {unverifiedUsers.length > 0 && (
                  <Badge className="text-[10px] px-1.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                    {unverifiedUsers.length}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="text-sm mt-1">
                {isDa
                  ? 'Brugere der har oprettet en konto men aldrig bekræftet deres e-mail. Slet dem for at rydde op (de har intet regnskabsdata).'
                  : 'Users who registered but never verified their email. Delete them to clean up (they have no accounting data).'}
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 shrink-0"
              onClick={fetchUnverifiedUsers}
              disabled={unverifiedLoading}
            >
              {unverifiedLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
              {isDa ? 'Hent' : 'Load'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <Input
              value={unverifiedSearch}
              onChange={(e) => setUnverifiedSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchUnverifiedUsers()}
              placeholder={isDa ? 'Søg på e-mail eller navn...' : 'Search by email or name...'}
              className="h-9 pl-9 text-sm"
            />
          </div>

          {unverifiedLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 text-[#0d9488] animate-spin" />
            </div>
          ) : unverifiedUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
              <div className="h-10 w-10 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              </div>
              <p className="text-sm font-medium">
                {isDa ? 'Ingen ubekræftede brugere' : 'No unverified users'}
              </p>
              <p className="text-xs text-muted-foreground">
                {isDa
                  ? 'Alle registrerede brugere har bekræftet deres e-mail.'
                  : 'All registered users have verified their email.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {unverifiedUsers.map((u) => (
                <div
                  key={u.id}
                  className="rounded-lg border border-gray-100 dark:border-white/5 p-3 hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Mail className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                        <span className="text-sm font-medium truncate">{u.email}</span>
                      </div>
                      {u.businessName && (
                        <p className="text-xs text-muted-foreground truncate pl-5">
                          {u.businessName}
                        </p>
                      )}
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground pl-5">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(u.createdAt), 'dd.MM.yyyy', { locale: da })}
                        </span>
                        {u.companies.length > 0 && (
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {u.companies.length} {isDa ? 'virksomhed(er)' : 'company/companies'}
                          </span>
                        )}
                      </div>
                      {u.companies.length > 0 && (
                        <div className="pl-5 pt-1 space-y-0.5">
                          {u.companies.map((c) => (
                            <div key={c.id} className="text-[11px] text-muted-foreground flex items-center gap-1">
                              <span className="truncate">{c.name}</span>
                              {c.isSoleMember && (
                                <Badge className="text-[9px] px-1 py-0 bg-gray-100 text-gray-500 dark:bg-gray-800/30 dark:text-gray-400">
                                  {isDa ? 'slettes også' : 'also deleted'}
                                </Badge>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 gap-1 shrink-0"
                      disabled={deletingUserId === u.id}
                      onClick={() => setDeleteConfirmUser(u)}
                    >
                      {deletingUserId === u.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      {isDa ? 'Slet' : 'Delete'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirm oversight dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <Eye className="h-5 w-5" />
              {isDa ? 'Start overvågning?' : 'Start Oversight?'}
            </DialogTitle>
            <DialogDescription>
              {isDa
                ? `Du er ved at se data fra "${selectedTenant?.name}" i skrivebeskyttet tilstand. Dette vil blive logget i revisionslogen.`
                : `You are about to view data from "${selectedTenant?.name}" in read-only mode. This will be logged in the audit trail.`}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 p-3 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium mb-1">
                {isDa ? 'Vigtigt:' : 'Important:'}
              </p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>{isDa ? 'Du kan kun læse data, ikke ændre det' : 'You can only read data, not modify it'}</li>
                <li>{isDa ? 'Adgangen logges som "oversight" i revisionslogen' : 'Access is logged as "oversight" in the audit trail'}</li>
                <li>{isDa ? 'Du kan afslutte overvågningen når som helst' : 'You can end oversight at any time'}</li>
              </ul>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                setConfirmOpen(false);
                setSelectedTenant(null);
              }}
              className="flex-1"
            >
              {isDa ? 'Annuller' : 'Cancel'}
            </Button>
            <Button
              onClick={() => selectedTenant && handleStartOversight(selectedTenant)}
              disabled={switching === selectedTenant?.id}
              className="flex-1 bg-amber-600 hover:bg-amber-700 text-white gap-2"
            >
              {switching === selectedTenant?.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
              {isDa ? 'Start overvågning' : 'Start Oversight'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Confirm delete unverified user dialog ───────────────── */}
      <Dialog open={!!deleteConfirmUser} onOpenChange={(open) => !open && setDeleteConfirmUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <Trash2 className="h-5 w-5" />
              {isDa ? 'Slet ubekræftet bruger?' : 'Delete unverified user?'}
            </DialogTitle>
            <DialogDescription>
              {isDa
                ? 'Denne handling kan ikke fortrydes. Brugeren slettes permanent fra databasen.'
                : 'This action cannot be undone. The user will be permanently deleted from the database.'}
            </DialogDescription>
          </DialogHeader>
          {deleteConfirmUser && (
            <div className="space-y-3">
              <div className="rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 p-3 space-y-1.5">
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-3.5 w-3.5 text-gray-400" />
                  <span className="font-medium">{deleteConfirmUser.email}</span>
                </div>
                {deleteConfirmUser.businessName && (
                  <p className="text-xs text-muted-foreground pl-5">{deleteConfirmUser.businessName}</p>
                )}
                <p className="text-xs text-muted-foreground pl-5">
                  {isDa ? 'Oprettet' : 'Registered'}: {format(new Date(deleteConfirmUser.createdAt), 'dd.MM.yyyy HH:mm', { locale: da })}
                </p>
              </div>

              {deleteConfirmUser.companies.length > 0 && (
                <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 p-3 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-700 dark:text-amber-400 space-y-1">
                    <p className="font-medium">
                      {isDa ? 'Virksomheder der også slettes:' : 'Companies that will also be deleted:'}
                    </p>
                    <ul className="list-disc pl-4 space-y-0.5">
                      {deleteConfirmUser.companies.filter(c => c.isSoleMember).map(c => (
                        <li key={c.id}>{c.name}</li>
                      ))}
                    </ul>
                    <p className="pt-1">
                      {isDa
                        ? 'Disse virksomheder har ingen andre medlemmer og vil blive fjernet helt (ingen regnskabsdata findes).'
                        : 'These companies have no other members and will be fully removed (no accounting data exists).'}
                    </p>
                  </div>
                </div>
              )}

              <div className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 p-3 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                <p className="text-xs text-red-700 dark:text-red-400">
                  {isDa
                    ? 'Auditlog-rækker for denne bruger bevares (med userId nulstillet) så historikken forbliver intakt, men brugeren selv forsvinder permanent.'
                    : 'Audit log rows for this user are preserved (with userId set to null) so the history remains intact, but the user themselves is permanently removed.'}
                </p>
              </div>

              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  onClick={() => setDeleteConfirmUser(null)}
                  className="flex-1"
                >
                  {isDa ? 'Annuller' : 'Cancel'}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => handleDeleteUnverified(deleteConfirmUser)}
                  disabled={deletingUserId === deleteConfirmUser.id}
                  className="flex-1 gap-2"
                >
                  {deletingUserId === deleteConfirmUser.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  {isDa ? 'Slet permanent' : 'Delete permanently'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
