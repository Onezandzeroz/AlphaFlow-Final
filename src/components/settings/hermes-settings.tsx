'use client';

import { useState, useEffect, useCallback } from 'react';
import { User } from '@/lib/auth-store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ResponsiveSwitch } from '@/components/ui/responsive-switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  Info,
  Brain,
  Shield,
  Bell,
  BookOpen,
  Bot,
  Sparkles,
  Power,
  PowerOff,
  Building2,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────

interface HermesConfig {
  enabled: boolean;
  dataAccessEnabled: boolean;
  personality: string;
}

interface HermesSettingsProps {
  user: User;
}

// ── Component ──────────────────────────────────────────────────────

export function HermesSettings({ user }: HermesSettingsProps) {
  const [config, setConfig] = useState<HermesConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isToggling, setIsToggling] = useState(false);

  const canToggle = user.activeCompanyRole === 'OWNER' || user.activeCompanyRole === 'ADMIN';
  const isSuperDev = user.isSuperDev === true;

  // ── Fetch Hermes config ──
  const fetchConfig = useCallback(async () => {
    try {
      const response = await fetch('/api/hermes/config');
      if (response.ok) {
        const data = await response.json();
        setConfig(data.hermesConfig ?? data);
      } else {
        toast.error('Failed to load Hermes configuration');
      }
    } catch (error) {
      console.error('Failed to fetch Hermes config:', error);
      toast.error('Failed to load Hermes configuration');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // ── Toggle data access ──
  const handleDataAccessToggle = useCallback(async (enabled: boolean) => {
    if (!canToggle) {
      toast.error('Only company owners or admins can manage Hermes data access.');
      return;
    }

    setIsToggling(true);
    try {
      const response = await fetch('/api/hermes/data-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });

      if (response.ok) {
        setConfig(prev => prev ? { ...prev, dataAccessEnabled: enabled } : prev);
        toast.success(
          enabled
            ? 'Hermes can now access your accounting data'
            : 'Hermes data access has been revoked'
        );
      } else {
        const data = await response.json();
        toast.error(data.error || 'Failed to update data access setting');
      }
    } catch (error) {
      console.error('Failed to toggle data access:', error);
      toast.error('Failed to update data access setting');
    } finally {
      setIsToggling(false);
    }
  }, [canToggle]);

  // ── Toggle Hermes enable/disable (SuperDev only) ──
  const handleHermesToggle = useCallback(async (enabled: boolean) => {
    if (!isSuperDev || !user.activeCompanyId) return;
    setIsToggling(true);
    try {
      const response = await fetch('/api/hermes/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: user.activeCompanyId, enabled }),
      });
      if (response.ok) {
        setConfig(prev => prev ? { ...prev, enabled } : prev);
        toast.success(enabled ? 'Hermes AI has been enabled for this company' : 'Hermes AI has been disabled');
      } else {
        const data = await response.json();
        toast.error(data.error || 'Failed to toggle Hermes');
      }
    } catch (error) {
      console.error('Failed to toggle Hermes:', error);
      toast.error('Failed to toggle Hermes');
    } finally {
      setIsToggling(false);
    }
  }, [isSuperDev, user.activeCompanyId]);

  // ── Loading skeleton ──
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  // ── Hermes not enabled ──
  if (!config?.enabled) {
    // SuperDev gets a toggle to enable it
    if (isSuperDev) {
      return (
        <div className="space-y-4 lg:space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-amber-700 dark:text-amber-400">
                Hermes AI Consultant
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                AI-powered Danish accounting assistant — Platform Administration
              </p>
            </div>
          </div>
          <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
            <CardContent className="py-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-gray-400 to-gray-500 flex items-center justify-center">
                    <Bot className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                      Hermes AI Consultant
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {user.activeCompanyName || 'Current company'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Label htmlFor="hermes-enable" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Enable Hermes
                  </Label>
                  <ResponsiveSwitch
                    checked={false}
                    onCheckedChange={(checked) => handleHermesToggle(checked)}
                    disabled={isToggling}
                  />
                </div>
              </div>
              {isToggling && (
                <div className="flex items-center gap-2 text-xs text-gray-500 mt-4">
                  <div className="h-3 w-3 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                  Updating...
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      );
    }

    // Regular user sees the contact admin message
    return (
      <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
        <CardContent className="py-8 flex flex-col items-center justify-center text-center gap-4">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <Bot className="h-8 w-8 text-white" />
          </div>
          <div className="space-y-2 max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Hermes AI Consultant
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Hermes AI is not enabled for your company. Contact the platform administrator to enable it.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-amber-100 dark:bg-amber-900/30 px-4 py-2 text-amber-700 dark:text-amber-400">
            <Info className="h-4 w-4" />
            <span className="text-xs font-medium">Not activated</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Hermes enabled ──
  const knowledgeItems = [
    'Årsregnskabsloven (Danish Annual Accounts Act)',
    'Moms / VAT reporting and compliance',
    'Selskabsskat (corporate tax)',
    'SKAT deadlines and filing requirements',
    'Faktura krav (invoice requirements)',
    'EU cross-border rules',
    'Årsrapport requirements and formats',
  ];

  const capabilities = [
    {
      icon: <Bell className="h-4 w-4 text-amber-600 dark:text-amber-400" />,
      title: 'Track important deadlines',
      description: 'VAT, tax, and annual report deadlines with proactive reminders.',
    },
    {
      icon: <BookOpen className="h-4 w-4 text-amber-600 dark:text-amber-400" />,
      title: 'Answer accounting how-to questions',
      description: 'Step-by-step guidance for common Danish accounting tasks.',
    },
    {
      icon: <Brain className="h-4 w-4 text-amber-600 dark:text-amber-400" />,
      title: 'Help with problem-solving',
      description: 'Troubleshoot issues with your books, reconciliations, and reports.',
    },
    {
      icon: <Shield className="h-4 w-4 text-amber-600 dark:text-amber-400" />,
      title: 'Advise on regulations',
      description: 'Danish financial regulations and compliance guidance.',
    },
  ];

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-amber-700 dark:text-amber-400">
              Hermes AI Consultant
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {isSuperDev ? 'AI-powered Danish accounting assistant — Platform Administration' : 'Your AI-powered Danish accounting assistant'}
            </p>
          </div>
        </div>
        {/* SuperDev can disable Hermes from here too */}
        {isSuperDev && (
          <div className="flex items-center gap-3 shrink-0">
            <Label htmlFor="hermes-disable" className="text-xs font-medium text-gray-500 dark:text-gray-400">
              Enabled
            </Label>
            <ResponsiveSwitch
              checked={config?.enabled ?? false}
              onCheckedChange={(checked) => handleHermesToggle(checked)}
              disabled={isToggling}
            />
          </div>
        )}
      </div>

      {/* ── Status Card ── */}
      <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  Hermes is active
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  AI consultant ready for your company
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 rounded-full bg-green-100 dark:bg-green-900/30 px-3 py-1">
              <span className="text-xs font-medium text-green-700 dark:text-green-400">
                Active
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Main Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        {/* ── Data Access Card ── */}
        <Card className="stat-card card-hover-lift border-0 shadow-lg dark:border dark:border-white/5">
          <CardHeader className="pb-4">
            <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shrink-0">
                <Shield className="h-4 w-4 text-white" />
              </div>
              Data Access
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1 flex-1 min-w-0">
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Allow Hermes to access your accounting data
                </Label>
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                  When enabled, Hermes can see your financial data (transactions, VAT status, balances) to provide personalized advice and deadline tracking.
                </p>
              </div>
              <ResponsiveSwitch
                checked={config?.dataAccessEnabled ?? false}
                onCheckedChange={handleDataAccessToggle}
                disabled={isToggling || !canToggle}
              />
            </div>

            {!canToggle && (
              <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2.5 flex items-start gap-2">
                <Info className="h-4 w-4 shrink-0 mt-0.5" />
                Only company owners or admins can change this setting.
              </p>
            )}

            {isToggling && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <div className="h-3 w-3 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                Updating...
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Knowledge Card ── */}
        <Card className="stat-card card-hover-lift border-0 shadow-lg dark:border dark:border-white/5">
          <CardHeader className="pb-4">
            <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-500 to-yellow-500 flex items-center justify-center shrink-0">
                <BookOpen className="h-4 w-4 text-white" />
              </div>
              Knowledge
            </CardTitle>
            <CardDescription className="text-sm text-gray-500 dark:text-gray-400">
              Hermes has extensive knowledge of Danish accounting practices including:
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {knowledgeItems.map((item, index) => (
                <li key={index} className="flex items-start gap-2.5 text-sm text-gray-700 dark:text-gray-300">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* ── Capabilities Card ── */}
      <Card className="stat-card card-hover-lift border-0 shadow-lg dark:border dark:border-white/5">
        <CardHeader className="pb-4">
          <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shrink-0">
              <Brain className="h-4 w-4 text-white" />
            </div>
            Capabilities
          </CardTitle>
          <CardDescription className="text-sm text-gray-500 dark:text-gray-400">
            What Hermes can do for your business
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {capabilities.map((cap, index) => (
              <div
                key={index}
                className="flex items-start gap-3 rounded-xl border border-gray-200 dark:border-white/10 p-3 hover:border-amber-300 dark:hover:border-amber-600/30 transition-colors"
              >
                <div className="mt-0.5 rounded-lg bg-amber-100 dark:bg-amber-900/30 p-2 shrink-0">
                  {cap.icon}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {cap.title}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                    {cap.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
