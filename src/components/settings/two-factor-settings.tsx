'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@/lib/use-translation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ResponsiveSwitch } from '@/components/ui/responsive-switch';
import { OTPInput } from '@/components/ui/otp-input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  Shield,
  ShieldCheck,
  ShieldX,
  Smartphone,
  KeyRound,
  Download,
  Copy,
  Check,
  Loader2,
  Info,
  AlertTriangle,
  QrCode,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────

interface TwoFactorStatus {
  twoFactorEnabled: boolean;
  hasBackupCodes: boolean;
  companyRequiresTwoFactor: boolean;
  isSuperDev: boolean;
}

interface TwoFactorSettingsProps {
  userId: string;
}

// ── Component ──────────────────────────────────────────────────────────

export function TwoFactorSettings({ userId }: TwoFactorSettingsProps) {
  const { t, isDanish, language } = useTranslation();

  // ── State ──
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);

  // Setup flow state
  const [setupStep, setSetupStep] = useState<'idle' | 'qr' | 'verify' | 'backup' | 'done'>('idle');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [setupSecret, setSetupSecret] = useState('');
  const [setupCode, setSetupCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [backupCodesCopied, setBackupCodesCopied] = useState(false);

  // Disable flow state
  const [showDisableDialog, setShowDisableDialog] = useState(false);
  const [disableCode, setDisableCode] = useState('');
  const [isDisabling, setIsDisabling] = useState(false);

  // Regenerate backup codes state
  const [showRegenDialog, setShowRegenDialog] = useState(false);
  const [regenCode, setRegenCode] = useState('');
  const [isRegenerating, setIsRegenerating] = useState(false);

  // Loading states
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [isActivating, setIsActivating] = useState(false);

  // ── Fetch 2FA status ──
  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/2fa/status');
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      }
    } catch (error) {
      console.error('Failed to fetch 2FA status:', error);
    } finally {
      setIsLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // ── Setup: Generate QR code ──
  const handleSetupStart = useCallback(async () => {
    setIsSettingUp(true);
    try {
      const response = await fetch('/api/auth/2fa/setup', { method: 'POST' });
      if (response.ok) {
        const data = await response.json();
        setQrCodeDataUrl(data.qrCodeDataUrl);
        setSetupSecret(data.secret);
        setSetupStep('qr');
      } else {
        const data = await response.json();
        toast.error(data.error || (isDanish ? 'Kunne ikke starte opsætning' : 'Could not start setup'));
      }
    } catch {
      toast.error(isDanish ? 'Fejl ved opsætning' : 'Setup error');
    } finally {
      setIsSettingUp(false);
    }
  }, [isDanish]);

  // ── Setup: Verify and activate ──
  const handleActivate = useCallback(async () => {
    if (setupCode.length !== 6) return;
    setIsActivating(true);
    try {
      const response = await fetch('/api/auth/2fa/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: setupCode }),
      });
      if (response.ok) {
        const data = await response.json();
        setBackupCodes(data.backupCodes);
        setSetupStep('backup');
        toast.success(
          isDanish ? '2FA aktiveret!' : '2FA Activated!',
          { description: isDanish ? 'Tofaktor-bekræftelse er nu aktiveret på din konto.' : 'Two-factor authentication is now enabled on your account.' }
        );
        fetchStatus();
      } else {
        const data = await response.json();
        toast.error(data.error || (isDanish ? 'Ugyldig kode' : 'Invalid code'));
      }
    } catch {
      toast.error(isDanish ? 'Fejl ved aktivering' : 'Activation error');
    } finally {
      setIsActivating(false);
    }
  }, [setupCode, isDanish, fetchStatus]);

  // ── Disable 2FA ──
  const handleDisable = useCallback(async () => {
    if (disableCode.length !== 6) return;
    setIsDisabling(true);
    try {
      const response = await fetch('/api/auth/2fa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: disableCode }),
      });
      if (response.ok) {
        toast.success(
          isDanish ? '2FA deaktiveret' : '2FA Disabled',
          { description: isDanish ? 'Tofaktor-bekræftelse er nu deaktiveret.' : 'Two-factor authentication has been disabled.' }
        );
        setShowDisableDialog(false);
        setDisableCode('');
        setSetupStep('idle');
        fetchStatus();
      } else {
        const data = await response.json();
        toast.error(data.error || (isDanish ? 'Kunne ikke deaktivere' : 'Could not disable'));
      }
    } catch {
      toast.error(isDanish ? 'Fejl ved deaktivering' : 'Disable error');
    } finally {
      setIsDisabling(false);
    }
  }, [disableCode, isDanish, fetchStatus]);

  // ── Regenerate backup codes ──
  const handleRegenerate = useCallback(async () => {
    if (regenCode.length !== 6) return;
    setIsRegenerating(true);
    try {
      const response = await fetch('/api/auth/2fa/backup-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: regenCode }),
      });
      if (response.ok) {
        const data = await response.json();
        setBackupCodes(data.backupCodes);
        setShowRegenDialog(false);
        setRegenCode('');
        setSetupStep('backup');
        toast.success(
          isDanish ? 'Nye backup-koder genereret' : 'New backup codes generated',
          { description: isDanish ? 'De gamle koder er nu ugyldige.' : 'The old codes are now invalid.' }
        );
      } else {
        const data = await response.json();
        toast.error(data.error || (isDanish ? 'Ugyldig kode' : 'Invalid code'));
      }
    } catch {
      toast.error(isDanish ? 'Fejl ved generering' : 'Generation error');
    } finally {
      setIsRegenerating(false);
    }
  }, [regenCode, isDanish]);

  // ── Copy backup codes ──
  const handleCopyBackupCodes = useCallback(() => {
    const text = backupCodes.join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setBackupCodesCopied(true);
      setTimeout(() => setBackupCodesCopied(false), 2000);
      toast.success(isDanish ? 'Kopieret til udklipsholder' : 'Copied to clipboard');
    });
  }, [backupCodes, isDanish]);

  // ── Download backup codes ──
  const handleDownloadBackupCodes = useCallback(() => {
    const text = [
      isDanish ? 'AlphaFlow — Backup-koder til tofaktor-bekræftelse' : 'AlphaFlow — Two-Factor Authentication Backup Codes',
      isDanish ? 'Gem disse koder sikkert. Hver kode kan kun bruges én gang.' : 'Store these codes safely. Each code can only be used once.',
      '',
      ...backupCodes.map((code, i) => `${i + 1}. ${code}`),
      '',
      new Date().toLocaleString(isDanish ? 'da-DK' : 'en-GB'),
    ].join('\n');

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `alphaflow-backup-codes-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [backupCodes, isDanish]);

  // ── Loading skeleton ──
  if (isLoadingStatus) {
    return (
      <div className="space-y-4 lg:space-y-6">
        <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
          <CardHeader className="pb-4">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-20 w-full rounded-xl" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!status) return null;

  // ── Tenant-level warning ──
  const isRequired = status.companyRequiresTwoFactor;

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* ═══ 2FA STATUS CARD ═══ */}
      <Card className="stat-card card-hover-lift border-0 shadow-lg dark:border dark:border-white/5">
        <CardHeader className="pb-4">
          <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center shrink-0">
              <Shield className="h-4 w-4 text-white" />
            </div>
            {isDanish ? 'Tofaktor-bekræftelse (2FA)' : 'Two-Factor Authentication (2FA)'}
          </CardTitle>
          <CardDescription className="text-sm text-gray-500 dark:text-gray-400">
            {isDanish
              ? 'Beskyt din konto med en ekstra sikkerhedslag via en autentificerings-app.'
              : 'Protect your account with an extra layer of security via an authenticator app.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* ── Status Banner ── */}
          <div
            className={`rounded-xl p-4 flex items-center gap-4 transition-all ${
              status.twoFactorEnabled
                ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40'
                : isRequired
                  ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40'
                  : 'bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10'
            }`}
          >
            <div className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 ${
              status.twoFactorEnabled
                ? 'bg-gradient-to-br from-emerald-500 to-green-500'
                : 'bg-gradient-to-br from-gray-400 to-gray-500'
            }`}>
              {status.twoFactorEnabled
                ? <ShieldCheck className="h-6 w-6 text-white" />
                : <ShieldX className="h-6 w-6 text-white" />
              }
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                  {status.twoFactorEnabled
                    ? (isDanish ? '2FA er aktiveret' : '2FA is enabled')
                    : (isDanish ? '2FA er deaktiveret' : '2FA is disabled')
                  }
                </span>
                <Badge
                  variant={status.twoFactorEnabled ? 'default' : 'secondary'}
                  className={
                    status.twoFactorEnabled
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-0'
                      : 'bg-gray-200 dark:bg-white/10 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-white/15 border-0'
                  }
                >
                  {status.twoFactorEnabled
                    ? (isDanish ? 'Aktiv' : 'Active')
                    : (isDanish ? 'Inaktiv' : 'Inactive')
                  }
                </Badge>
                {isRequired && (
                  <Badge className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/40">
                    {isDanish ? 'Påkrævet af organisation' : 'Required by organization'}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {status.twoFactorEnabled
                  ? (isDanish
                    ? 'Din konto er beskyttet med tofaktor-bekræftelse.'
                    : 'Your account is protected with two-factor authentication.')
                  : isRequired
                    ? (isDanish
                      ? 'Din organisation kræver 2FA. Aktiver den snarest.'
                      : 'Your organization requires 2FA. Enable it as soon as possible.')
                    : (isDanish
                      ? 'Du kan aktivere 2FA for at øge sikkerheden på din konto.'
                      : 'You can enable 2FA to increase the security of your account.')
                }
              </p>
            </div>
          </div>

          {/* ── Action buttons ── */}
          <div className="flex flex-col sm:flex-row gap-3">
            {!status.twoFactorEnabled && (
              <Button
                onClick={handleSetupStart}
                disabled={isSettingUp}
                className="bg-[#0d9488] hover:bg-[#0f766e] text-white border border-[#0d9488] gap-2 font-medium transition-all"
              >
                {isSettingUp ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Shield className="h-4 w-4" />
                )}
                {isSettingUp
                  ? (isDanish ? 'Forbereder...' : 'Preparing...')
                  : (isDanish ? 'Aktiver 2FA' : 'Enable 2FA')
                }
              </Button>
            )}
            {status.twoFactorEnabled && (
              <>
                <Button
                  onClick={() => { setShowRegenDialog(true); setRegenCode(''); }}
                  variant="outline"
                  className="border-[#0d9488] text-[#0d9488] hover:bg-[#0d9488] hover:text-white gap-2 font-medium transition-all"
                >
                  <RefreshCw className="h-4 w-4" />
                  {isDanish ? 'Ny backup-koder' : 'New backup codes'}
                </Button>
                {!isRequired && (
                  <Button
                    onClick={() => { setShowDisableDialog(true); setDisableCode(''); }}
                    variant="outline"
                    className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-800/40 dark:text-red-400 dark:hover:bg-red-900/20 dark:hover:text-red-300 gap-2 font-medium transition-all"
                  >
                    <ShieldX className="h-4 w-4" />
                    {isDanish ? 'Deaktiver 2FA' : 'Disable 2FA'}
                  </Button>
                )}
              </>
            )}
          </div>

          {/* ── Info box ── */}
          <p className="text-xs text-gray-500 dark:text-gray-400 info-box-primary rounded-lg p-3 flex items-start gap-2">
            <Info className="h-4 w-4 shrink-0 mt-0.5 text-[#14b8a6] dark:text-[#99f6e4]" />
            <span>
              {isDanish
                ? 'Kompatible apps: Google Authenticator, Microsoft Authenticator, Authy, 1Password, Bitwarden.'
                : 'Compatible apps: Google Authenticator, Microsoft Authenticator, Authy, 1Password, Bitwarden.'}
            </span>
          </p>
        </CardContent>
      </Card>

      {/* ═══ SETUP: QR CODE STEP ═══ */}
      {setupStep === 'qr' && (
        <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
          <CardHeader className="pb-4">
            <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center shrink-0">
                <QrCode className="h-4 w-4 text-white" />
              </div>
              {isDanish ? '1. Scan QR-kode' : '1. Scan QR Code'}
            </CardTitle>
            <CardDescription className="text-sm text-gray-500 dark:text-gray-400">
              {isDanish
                ? 'Scan denne QR-kode med din autentificerings-app.'
                : 'Scan this QR code with your authenticator app.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* QR Code */}
            <div className="flex justify-center">
              <div className="p-4 bg-white rounded-xl border border-gray-200 dark:border-white/10 shadow-sm">
                {qrCodeDataUrl ? (
                  <img src={qrCodeDataUrl} alt="2FA QR Code" className="w-56 h-56" />
                ) : (
                  <Skeleton className="w-56 h-56 rounded-lg" />
                )}
              </div>
            </div>

            {/* Manual entry secret */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {isDanish ? 'Hvis du ikke kan scanne — indtast manuelt:' : 'If you can\'t scan — enter manually:'}
              </Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-gray-100 dark:bg-white/5 px-3 py-2 rounded-lg text-xs font-mono text-gray-700 dark:text-gray-300 break-all select-all">
                  {setupSecret}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(setupSecret);
                    toast.success(isDanish ? 'Kopieret' : 'Copied');
                  }}
                  className="shrink-0 h-9 w-9 p-0"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <Button
              onClick={() => setSetupStep('verify')}
              className="w-full bg-[#0d9488] hover:bg-[#0f766e] text-white gap-2 font-medium transition-all"
            >
              {isDanish ? 'Næste: Bekræft kode' : 'Next: Verify Code'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ═══ SETUP: VERIFY STEP ═══ */}
      {setupStep === 'verify' && (
        <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
          <CardHeader className="pb-4">
            <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shrink-0">
                <Smartphone className="h-4 w-4 text-white" />
              </div>
              {isDanish ? '2. Bekræft koden' : '2. Verify the Code'}
            </CardTitle>
            <CardDescription className="text-sm text-gray-500 dark:text-gray-400">
              {isDanish
                ? 'Indtast den 6-cifrede kode fra din autentificerings-app.'
                : 'Enter the 6-digit code from your authenticator app.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-center py-2">
              <OTPInput
                length={6}
                onComplete={(val) => setSetupCode(val)}
                value={setupCode}
                disabled={isActivating}
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setSetupStep('qr')}
                className="flex-1 font-medium"
              >
                {isDanish ? 'Tilbage' : 'Back'}
              </Button>
              <Button
                onClick={handleActivate}
                disabled={isActivating || setupCode.length !== 6}
                className="flex-1 bg-[#0d9488] hover:bg-[#0f766e] text-white gap-2 font-medium transition-all"
              >
                {isActivating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {isActivating
                  ? (isDanish ? 'Bekræfter...' : 'Verifying...')
                  : (isDanish ? 'Aktiver' : 'Activate')
                }
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══ BACKUP CODES DISPLAY ═══ */}
      {setupStep === 'backup' && backupCodes.length > 0 && (
        <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
          <CardHeader className="pb-4">
            <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center shrink-0">
                <KeyRound className="h-4 w-4 text-white" />
              </div>
              {isDanish ? 'Backup-koder' : 'Backup Codes'}
            </CardTitle>
            <CardDescription className="text-sm text-gray-500 dark:text-gray-400">
              {isDanish
                ? 'Gem disse koder sikkert. Hver kode kan kun bruges én gang.'
                : 'Store these codes safely. Each code can only be used once.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Warning */}
            <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 dark:text-amber-300">
                {isDanish
                  ? 'Disse koder vises kun én gang. Gem dem sikkert — du kan ikke se dem igen.'
                  : 'These codes are shown only once. Save them safely — you won\'t be able to see them again.'}
              </p>
            </div>

            {/* Codes grid */}
            <div className="grid grid-cols-2 gap-2">
              {backupCodes.map((code, i) => (
                <div
                  key={i}
                  className="bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 text-center"
                >
                  <code className="text-sm font-mono font-bold text-gray-900 dark:text-white tracking-wider">
                    {code}
                  </code>
                </div>
              ))}
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={handleCopyBackupCodes}
                className="flex-1 gap-2 font-medium"
              >
                {backupCodesCopied ? (
                  <Check className="h-4 w-4 text-emerald-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                {backupCodesCopied
                  ? (isDanish ? 'Kopieret!' : 'Copied!')
                  : (isDanish ? 'Kopiér alle' : 'Copy all')
                }
              </Button>
              <Button
                variant="outline"
                onClick={handleDownloadBackupCodes}
                className="flex-1 gap-2 font-medium"
              >
                <Download className="h-4 w-4" />
                {isDanish ? 'Download' : 'Download'}
              </Button>
            </div>

            <Button
              onClick={() => setSetupStep('done')}
              className="w-full bg-[#0d9488] hover:bg-[#0f766e] text-white font-medium transition-all"
            >
              <Check className="mr-2 h-4 w-4" />
              {isDanish ? 'Jeg har gemt mine koder' : 'I have saved my codes'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ═══ DISABLE DIALOG ═══ */}
      {showDisableDialog && (
        <Card className="stat-card border-0 shadow-lg border border-red-200 dark:border-red-800/40">
          <CardContent className="p-4 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-red-800 dark:text-red-300">
                  {isDanish ? 'Deaktiver tofaktor-bekræftelse' : 'Disable two-factor authentication'}
                </h4>
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                  {isDanish
                    ? 'Dette vil fjerne det ekstra sikkerhedslag fra din konto.'
                    : 'This will remove the extra layer of security from your account.'}
                </p>
              </div>
            </div>
            <div className="flex justify-center py-1">
              <OTPInput
                length={6}
                onComplete={(val) => setDisableCode(val)}
                value={disableCode}
                disabled={isDisabling}
                error={false}
                autoFocus
              />
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => { setShowDisableDialog(false); setDisableCode(''); }}
                className="flex-1 font-medium"
              >
                {isDanish ? 'Annuller' : 'Cancel'}
              </Button>
              <Button
                variant="destructive"
                onClick={handleDisable}
                disabled={isDisabling || disableCode.length !== 6}
                className="flex-1 gap-2 font-medium"
              >
                {isDisabling ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldX className="h-4 w-4" />
                )}
                {isDisabling
                  ? (isDanish ? 'Deaktiverer...' : 'Disabling...')
                  : (isDanish ? 'Bekræft deaktivering' : 'Confirm disable')
                }
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══ REGENERATE BACKUP CODES DIALOG ═══ */}
      {showRegenDialog && (
        <Card className="stat-card border-0 shadow-lg border border-amber-200 dark:border-amber-800/40">
          <CardContent className="p-4 space-y-4">
            <div className="flex items-start gap-3">
              <RefreshCw className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                  {isDanish ? 'Generer nye backup-koder' : 'Generate new backup codes'}
                </h4>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  {isDanish
                    ? 'Dine nuværende backup-koder vil blive ugyldige.'
                    : 'Your current backup codes will become invalid.'}
                </p>
              </div>
            </div>
            <div className="flex justify-center py-1">
              <OTPInput
                length={6}
                onComplete={(val) => setRegenCode(val)}
                value={regenCode}
                disabled={isRegenerating}
                error={false}
                autoFocus
              />
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => { setShowRegenDialog(false); setRegenCode(''); }}
                className="flex-1 font-medium"
              >
                {isDanish ? 'Annuller' : 'Cancel'}
              </Button>
              <Button
                onClick={handleRegenerate}
                disabled={isRegenerating || regenCode.length !== 6}
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-white gap-2 font-medium transition-all"
              >
                {isRegenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {isRegenerating
                  ? (isDanish ? 'Genererer...' : 'Generating...')
                  : (isDanish ? 'Bekræft' : 'Confirm')
                }
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
