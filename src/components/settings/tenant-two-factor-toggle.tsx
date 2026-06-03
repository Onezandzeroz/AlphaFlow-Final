'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@/lib/use-translation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ResponsiveSwitch } from '@/components/ui/responsive-switch';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  Shield,
  ShieldCheck,
  AlertTriangle,
  Info,
  Loader2,
  Users,
  UserCheck,
  UserX,
} from 'lucide-react';
import { useAccessErrorHandler } from '@/hooks/use-access-error-handler';

// ── Types ──────────────────────────────────────────────────────────

interface NonCompliantMember {
  id: string;
  email: string;
  businessName?: string | null;
}

interface TenantTwoFactorToggleProps {
  userRole: string | null;
  isSuperDev: boolean;
}

// ── Component ──────────────────────────────────────────────────────────

export function TenantTwoFactorToggle({ userRole, isSuperDev }: TenantTwoFactorToggleProps) {
  const { t, isDanish, language } = useTranslation();
  const { handleMutationError } = useAccessErrorHandler();

  // ── State ──
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isToggling, setIsToggling] = useState(false);
  const [nonCompliantMembers, setNonCompliantMembers] = useState<NonCompliantMember[]>([]);
  const [showWarning, setShowWarning] = useState(false);

  const canManage = isSuperDev || userRole === 'OWNER' || userRole === 'ADMIN';

  // ── Fetch current status ──
  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/2fa/status');
      if (response.ok) {
        const data = await response.json();
        setIsEnabled(data.companyRequiresTwoFactor);
      }
    } catch (error) {
      console.error('Failed to fetch tenant 2FA status:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // ── Toggle 2FA requirement ──
  const handleToggle = useCallback(async (enabled: boolean) => {
    setIsToggling(true);
    setNonCompliantMembers([]);

    try {
      const response = await fetch('/api/company/toggle-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });

      if (response.ok) {
        setIsEnabled(enabled);
        toast.success(
          enabled
            ? (isDanish ? '2FA krav aktiveret' : '2FA requirement enabled')
            : (isDanish ? '2FA krav deaktiveret' : '2FA requirement disabled'),
          {
            description: enabled
              ? (isDanish ? 'Alle brugere skal nu have tofaktor-bekræftelse aktiveret.' : 'All users must now have two-factor authentication enabled.')
              : (isDanish ? 'Brugere kan nu fravælge tofaktor-bekræftelse.' : 'Users can now opt out of two-factor authentication.'),
          }
        );
      } else {
        const data = await response.json();

        // If the error contains non-compliant members, show them
        if (data.nonCompliantMembers && data.nonCompliantMembers.length > 0) {
          setNonCompliantMembers(data.nonCompliantMembers);
          setShowWarning(true);
          // Don't toggle — revert the switch
          toast.error(
            isDanish ? 'Kan ikke aktivere 2FA krav' : 'Cannot enable 2FA requirement',
            {
              description: isDanish
                ? `Følgende brugere mangler 2FA: ${data.nonCompliantMembers.length}`
                : `The following users don't have 2FA: ${data.nonCompliantMembers.length}`,
            }
          );
        } else {
          // Revert the switch and show error
          setIsEnabled(!enabled);
          await handleMutationError(
            response,
            language === 'da' ? 'Skift 2FA krav' : 'Toggle 2FA requirement'
          );
        }
      }
    } catch {
      setIsEnabled(!enabled);
      toast.error(isDanish ? 'Fejl ved opdatering' : 'Update error');
    } finally {
      setIsToggling(false);
    }
  }, [isDanish, handleMutationError, language]);

  // ── Loading ──
  if (isLoading || !canManage) return null;

  return (
    <div className="space-y-4">
      {/* ═══ TENANT 2FA TOGGLE CARD ═══ */}
      <Card className="stat-card card-hover-lift border-0 shadow-lg dark:border dark:border-white/5">
        <CardHeader className="pb-4">
          <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0">
              <Shield className="h-4 w-4 text-white" />
            </div>
            {isDanish ? 'Kræv 2FA for organisationen' : 'Require 2FA for Organization'}
          </CardTitle>
          <CardDescription className="text-sm text-gray-500 dark:text-gray-400">
            {isDanish
              ? 'Gør tofaktor-bekræftelse obligatorisk for alle brugere i denne organisation.'
              : 'Make two-factor authentication mandatory for all users in this organization.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {isDanish ? 'Obligatorisk tofaktor-bekræftelse' : 'Mandatory two-factor authentication'}
              </p>
              <div className="flex items-center gap-2">
                <Badge
                  variant={isEnabled ? 'default' : 'secondary'}
                  className={
                    isEnabled
                      ? 'bg-violet-600 hover:bg-violet-700 text-white border-0'
                      : 'bg-gray-200 dark:bg-white/10 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-white/15 border-0'
                  }
                >
                  {isEnabled
                    ? (isDanish ? 'Aktiv' : 'Active')
                    : (isDanish ? 'Inaktiv' : 'Inactive')
                  }
                </Badge>
              </div>
            </div>
            <ResponsiveSwitch
              checked={isEnabled}
              onCheckedChange={handleToggle}
              disabled={isToggling}
            />
          </div>

          {/* Info box */}
          <p className="text-xs text-gray-500 dark:text-gray-400 info-box-primary rounded-lg p-3 flex items-start gap-2">
            <Info className="h-4 w-4 shrink-0 mt-0.5 text-[#14b8a6] dark:text-[#99f6e4]" />
            <span>
              {isEnabled
                ? (isDanish
                  ? 'Alle brugere skal bruge tofaktor-bekræftelse ved login. Brugere uden 2FA vil blive bedt om at aktivere det ved næste login.'
                  : 'All users must use two-factor authentication at login. Users without 2FA will be prompted to enable it at next login.')
                : (isDanish
                  ? 'Brugere kan frit vælge at aktivere eller deaktivere tofaktor-bekræftelse.'
                  : 'Users can freely choose to enable or disable two-factor authentication.')
              }
            </span>
          </p>

          {/* Loading indicator */}
          {isToggling && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {isDanish ? 'Opdaterer...' : 'Updating...'}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ NON-COMPLIANT MEMBERS WARNING ═══ */}
      {showWarning && nonCompliantMembers.length > 0 && (
        <Card className="stat-card border-0 shadow-lg border border-amber-200 dark:border-amber-800/40">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                  {isDanish ? 'Følgende brugere mangler 2FA' : 'The following users don\'t have 2FA'}
                </h4>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  {isDanish
                    ? 'Du skal bede disse brugere om at aktivere 2FA, før du kan gøre det obligatorisk.'
                    : 'You must ask these users to enable 2FA before you can make it mandatory.'}
                </p>
              </div>
            </div>

            {/* Members list */}
            <div className="space-y-2">
              {nonCompliantMembers.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center gap-3 bg-amber-50 dark:bg-amber-900/10 rounded-lg px-3 py-2 border border-amber-100 dark:border-amber-900/30"
                >
                  <div className="h-7 w-7 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                    <UserX className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
                      {member.email}
                    </p>
                    {member.businessName && (
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                        {member.businessName}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <Button
              variant="outline"
              onClick={() => setShowWarning(false)}
              className="w-full font-medium text-sm"
            >
              {isDanish ? 'Luk' : 'Close'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
