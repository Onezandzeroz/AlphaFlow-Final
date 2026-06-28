'use client';

import { useState, useEffect, useCallback } from 'react';
import { User } from '@/lib/auth-store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Building2,
  RefreshCw,
  Save,
  Shield,
  Zap,
  Clock,
  Calendar,
  CalendarDays,
  AlertTriangle,
  CheckCircle2,
  Power,
  PowerOff,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────

interface RateLimits {
  enabled: boolean;
  burst: number;   // per minute
  hour: number;
  day: number;
  month: number;
}

interface TenantRow {
  companyId: string;
  companyName: string;
  companyType: string | null;
  hermesEnabled: boolean;
  rateLimits: RateLimits;
}

interface UsageWindow {
  used: number;
  limit: number;
  resetsInSeconds: number;
}

interface UsageRow {
  companyId: string;
  companyName: string;
  companyType: string | null;
  hermesEnabled: boolean;
  config: RateLimits;
  usage: {
    minute: UsageWindow;
    hour: UsageWindow;
    day: UsageWindow;
    month: UsageWindow;
  };
}

interface HermesOversightPageProps {
  user: User;
}

// ── Helpers ────────────────────────────────────────────────────────

function formatResets(seconds: number): string {
  if (seconds <= 0) return 'nu';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} min`;
  if (seconds < 86400) return `${Math.ceil(seconds / 3600)} t`;
  return `${Math.ceil(seconds / 86400)} d`;
}

function usagePercent(used: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

function usageColor(used: number, limit: number): string {
  const pct = usagePercent(used, limit);
  if (pct >= 90) return 'text-red-600 dark:text-red-400';
  if (pct >= 70) return 'text-amber-600 dark:text-amber-400';
  return 'text-emerald-600 dark:text-emerald-400';
}

// ── Component ──────────────────────────────────────────────────────

export function HermesOversightPage({ user }: HermesOversightPageProps) {
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [editTarget, setEditTarget] = useState<TenantRow | null>(null);
  const [editForm, setEditForm] = useState<RateLimits | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // ── Fetch tenant list with rate-limit configs ──
  const fetchTenants = useCallback(async () => {
    try {
      const res = await fetch('/api/hermes/rate-limits');
      if (res.ok) {
        const data = await res.json();
        setTenants(data.tenants ?? []);
      } else {
        toast.error('Kunne ikke hente virksomhedslisten.');
      }
    } catch (err) {
      console.error('Failed to fetch tenants:', err);
      toast.error('Kunne ikke hente virksomhedslisten.');
    }
  }, []);

  // ── Fetch live usage stats (from hermes-agent) ──
  const fetchUsage = useCallback(async () => {
    try {
      const res = await fetch('/api/hermes/usage-stats');
      if (res.ok) {
        const data = await res.json();
        setUsage(data.tenants ?? []);
      }
      // Non-fatal — usage just stays empty
    } catch (err) {
      console.error('Failed to fetch usage stats:', err);
    }
  }, []);

  // ── Initial load ──
  useEffect(() => {
    Promise.all([fetchTenants(), fetchUsage()]).finally(() => setIsLoading(false));
  }, [fetchTenants, fetchUsage]);

  // ── Auto-refresh usage every 15s (live counters) ──
  useEffect(() => {
    const interval = setInterval(fetchUsage, 15_000);
    return () => clearInterval(interval);
  }, [fetchUsage]);

  // ── Refresh handler ──
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([fetchTenants(), fetchUsage()]);
    setIsRefreshing(false);
    toast.success('Data opdateret.');
  }, [fetchTenants, fetchUsage]);

  // ── Open edit dialog ──
  const openEdit = useCallback((tenant: TenantRow) => {
    setEditTarget(tenant);
    setEditForm({ ...tenant.rateLimits });
  }, []);

  // ── Save rate limits ──
  const handleSave = useCallback(async () => {
    if (!editTarget || !editForm) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/hermes/rate-limits', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: editTarget.companyId,
          ...editForm,
        }),
      });
      if (res.ok) {
        toast.success(`Rate limits opdateret for "${editTarget.companyName}".`);
        setEditTarget(null);
        setEditForm(null);
        await Promise.all([fetchTenants(), fetchUsage()]);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Kunne ikke opdatere rate limits.');
      }
    } catch (err) {
      console.error('Failed to save rate limits:', err);
      toast.error('Kunne ikke opdatere rate limits.');
    } finally {
      setIsSaving(false);
    }
  }, [editTarget, editForm, fetchTenants, fetchUsage]);

  // ── Usage lookup for a tenant ──
  const getUsage = useCallback(
    (companyId: string): UsageRow | null => {
      return usage.find((u) => u.companyId === companyId) ?? null;
    },
    [usage],
  );

  // ── Summary stats ──
  const totalTenants = tenants.length;
  const hermesEnabledCount = tenants.filter((t) => t.hermesEnabled).length;
  const rlEnabledCount = tenants.filter((t) => t.rateLimits.enabled).length;

  // ── Render ──
  if (!user.isSuperDev) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Adgang nægtet
            </CardTitle>
            <CardDescription>
              Hermes oversight er kun tilgængelig for App Owner (SuperDev).
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            Hermes Oversight
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Per-tenant rate limits og live forbrug for Hermes AI.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          Opdater
        </Button>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Virksomheder i alt</CardDescription>
            <div className="text-2xl font-bold">{totalTenants}</div>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Hermes aktiveret</CardDescription>
            <div className="text-2xl font-bold flex items-center gap-2">
              {hermesEnabledCount}
              <span className="text-sm font-normal text-muted-foreground">/ {totalTenants}</span>
            </div>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Rate limit aktiveret</CardDescription>
            <div className="text-2xl font-bold flex items-center gap-2">
              {rlEnabledCount}
              <span className="text-sm font-normal text-muted-foreground">/ {totalTenants}</span>
            </div>
          </CardHeader>
        </Card>
      </div>

      {/* ── Tenant table ── */}
      <Card>
        <CardHeader>
          <CardTitle>Virksomhedsliste</CardTitle>
          <CardDescription>
            Justér rate limits per tenant. Live forbrug opdateres automatisk hvert 15. sekund.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : tenants.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Ingen virksomheder fundet.
            </div>
          ) : (
            <div className="max-h-[70vh] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="min-w-[180px]">Virksomhed</TableHead>
                    <TableHead className="text-center">Hermes</TableHead>
                    <TableHead className="text-center">
                      <span className="inline-flex items-center gap-1" title="Per minut (burst)">
                        <Zap className="h-3.5 w-3.5" /> Burst
                      </span>
                    </TableHead>
                    <TableHead className="text-center">
                      <span className="inline-flex items-center gap-1" title="Per time">
                        <Clock className="h-3.5 w-3.5" /> Time
                      </span>
                    </TableHead>
                    <TableHead className="text-center">
                      <span className="inline-flex items-center gap-1" title="Per dag">
                        <Calendar className="h-3.5 w-3.5" /> Dag
                      </span>
                    </TableHead>
                    <TableHead className="text-center">
                      <span className="inline-flex items-center gap-1" title="Per måned">
                        <CalendarDays className="h-3.5 w-3.5" /> Måned
                      </span>
                    </TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Handling</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenants.map((tenant) => {
                    const u = getUsage(tenant.companyId);
                    const rl = tenant.rateLimits;
                    const dayUsed = u?.usage.day.used ?? 0;
                    const dayPct = usagePercent(dayUsed, rl.day);
                    return (
                      <TableRow key={tenant.companyId}>
                        {/* Company */}
                        <TableCell>
                          <div className="font-medium">{tenant.companyName}</div>
                          {tenant.companyType && (
                            <div className="text-xs text-muted-foreground">{tenant.companyType}</div>
                          )}
                        </TableCell>

                        {/* Hermes enabled */}
                        <TableCell className="text-center">
                          {tenant.hermesEnabled ? (
                            <Badge variant="default" className="gap-1">
                              <CheckCircle2 className="h-3 w-3" /> On
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Off</Badge>
                          )}
                        </TableCell>

                        {/* Burst (per minute) */}
                        <TableCell className="text-center">
                          <div className="flex flex-col items-center gap-0.5">
                            <span className={`text-sm font-mono ${u ? usageColor(u.usage.minute.used, rl.burst) : ''}`}>
                              {u ? `${u.usage.minute.used}/${rl.burst}` : `${rl.burst}`}
                            </span>
                            <span className="text-[10px] text-muted-foreground">/min</span>
                          </div>
                        </TableCell>

                        {/* Hour */}
                        <TableCell className="text-center">
                          <div className="flex flex-col items-center gap-0.5">
                            <span className={`text-sm font-mono ${u ? usageColor(u.usage.hour.used, rl.hour) : ''}`}>
                              {u ? `${u.usage.hour.used}/${rl.hour}` : `${rl.hour}`}
                            </span>
                            <span className="text-[10px] text-muted-foreground">/time</span>
                          </div>
                        </TableCell>

                        {/* Day */}
                        <TableCell className="text-center">
                          <div className="flex flex-col items-center gap-0.5">
                            <span className={`text-sm font-mono ${u ? usageColor(dayUsed, rl.day) : ''}`}>
                              {u ? `${dayUsed}/${rl.day}` : `${rl.day}`}
                            </span>
                            <span className="text-[10px] text-muted-foreground">/dag</span>
                          </div>
                        </TableCell>

                        {/* Month */}
                        <TableCell className="text-center">
                          <div className="flex flex-col items-center gap-0.5">
                            <span className={`text-sm font-mono ${u ? usageColor(u.usage.month.used, rl.month) : ''}`}>
                              {u ? `${u.usage.month.used}/${rl.month}` : `${rl.month}`}
                            </span>
                            <span className="text-[10px] text-muted-foreground">/md</span>
                          </div>
                        </TableCell>

                        {/* Rate limit status */}
                        <TableCell className="text-center">
                          {rl.enabled ? (
                            <Badge variant="outline" className="gap-1 text-emerald-600 border-emerald-300 dark:text-emerald-400 dark:border-emerald-700">
                              <Shield className="h-3 w-3" /> Aktiv
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1 text-amber-600 border-amber-300 dark:text-amber-400 dark:border-amber-700">
                              <AlertTriangle className="h-3 w-3" /> Deaktiveret
                            </Badge>
                          )}
                          {dayPct >= 90 && rl.enabled && (
                            <div className="text-[10px] text-red-600 mt-1" title={`${dayPct}% af dagskvote brugt`}>
                              {dayPct}% brugt
                            </div>
                          )}
                        </TableCell>

                        {/* Action */}
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" onClick={() => openEdit(tenant)}>
                            Justér
                          </Button>
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

      {/* ── Edit dialog ── */}
      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) { setEditTarget(null); setEditForm(null); } }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Rate limits — {editTarget?.companyName}</DialogTitle>
            <DialogDescription>
              Justér grænserne for denne tenant. Ændringer træder i kraft øjeblikkeligt.
            </DialogDescription>
          </DialogHeader>

          {editForm && (
            <div className="space-y-4 py-2">
              {/* Enable/disable */}
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="rl-enabled" className="text-sm font-medium">
                    Rate limit aktiveret
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Når deaktiveret, kan tenanten chatte ubegrænset.
                  </p>
                </div>
                <Switch
                  id="rl-enabled"
                  checked={editForm.enabled}
                  onCheckedChange={(checked) => setEditForm({ ...editForm, enabled: checked })}
                />
              </div>

              <Separator />

              {/* Burst */}
              <div className="grid grid-cols-2 items-center gap-4">
                <div className="space-y-1">
                  <Label htmlFor="rl-burst" className="text-sm flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5" /> Burst (per minut)
                  </Label>
                  <p className="text-xs text-muted-foreground">Flood- og script-beskyttelse</p>
                </div>
                <Input
                  id="rl-burst"
                  type="number"
                  min={0}
                  max={1000}
                  value={editForm.burst}
                  onChange={(e) => setEditForm({ ...editForm, burst: parseInt(e.target.value) || 0 })}
                  className="font-mono"
                />
              </div>

              {/* Hour */}
              <div className="grid grid-cols-2 items-center gap-4">
                <div className="space-y-1">
                  <Label htmlFor="rl-hour" className="text-sm flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" /> Per time
                  </Label>
                  <p className="text-xs text-muted-foreground">Bæredygtig brug</p>
                </div>
                <Input
                  id="rl-hour"
                  type="number"
                  min={0}
                  max={10000}
                  value={editForm.hour}
                  onChange={(e) => setEditForm({ ...editForm, hour: parseInt(e.target.value) || 0 })}
                  className="font-mono"
                />
              </div>

              {/* Day */}
              <div className="grid grid-cols-2 items-center gap-4">
                <div className="space-y-1">
                  <Label htmlFor="rl-day" className="text-sm flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" /> Per dag
                  </Label>
                  <p className="text-xs text-muted-foreground">Fair-use kvote</p>
                </div>
                <Input
                  id="rl-day"
                  type="number"
                  min={0}
                  max={100000}
                  value={editForm.day}
                  onChange={(e) => setEditForm({ ...editForm, day: parseInt(e.target.value) || 0 })}
                  className="font-mono"
                />
              </div>

              {/* Month */}
              <div className="grid grid-cols-2 items-center gap-4">
                <div className="space-y-1">
                  <Label htmlFor="rl-month" className="text-sm flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" /> Per måned
                  </Label>
                  <p className="text-xs text-muted-foreground">Omkostningsforudsigelighed</p>
                </div>
                <Input
                  id="rl-month"
                  type="number"
                  min={0}
                  max={1000000}
                  value={editForm.month}
                  onChange={(e) => setEditForm({ ...editForm, month: parseInt(e.target.value) || 0 })}
                  className="font-mono"
                />
              </div>

              <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground mb-1">Anbefalede standarder</p>
                Burst: 10/min · Time: 40 · Dag: 120 · Måned: 2.000
                <br />
                Se &quot;Hermes AI Modelanbefalinger&quot; PDF §8.4 for begrundelse.
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditTarget(null); setEditForm(null); }} disabled={isSaving}>
              Annullér
            </Button>
            <Button onClick={handleSave} disabled={isSaving || !editForm}>
              {isSaving ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Gem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
