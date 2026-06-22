'use client';

import { useState, useEffect, useCallback, useRef, type DragEvent } from 'react';
import { useTranslation } from '@/lib/use-translation';
import { tokenpayClient, getAccessLevelLabel, getAccessLevelDescription, type AccessCheckResult } from '@/lib/tokenpay';
import { TwoFactorSettings } from '@/components/settings/two-factor-settings';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { useSubscriptionPlansStore } from '@/lib/subscription-plans-store';
import { toast } from 'sonner';
import {
  KeyRound,
  ShieldCheck,
  ShieldX,
  Upload,
  FileKey2,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Loader2,
  Info,
  RotateCcw,
  Calendar,
  TrendingUp,
  CreditCard,
  Ban,
  Crown,
  ChevronDown,
  ChevronRight,
  Zap,
} from 'lucide-react';

// ── Extended access result with source/metadata fields from the API ──

interface DetailedAccessResult extends AccessCheckResult {
  source?: string;
  sourceLabelDa?: string;
  sourceLabelEn?: string;
  planTier?: string;
  planId?: string;
  planPurchasedAt?: string | null;
  planExpiresAt?: string | null;
  revenue?: number | null;
  withinFreeTier?: boolean | null;
  subscriptionRevoked?: boolean;
  hasChosenPlan?: boolean;
  trialClaimedAt?: string | null;
  freeRevenueThreshold?: number;
}

interface ProofUploadResult {
  success: boolean;
  proofId: string;
  tier?: string;
  expiresAt?: string;
  filename: string;
  message?: string;
  error?: string;
  manifest?: {
    version: number;
    proofId: string;
    escrowId: string;
    tier: string;
    issuedAt: string;
    expiresAt: string;
    issuer: string;
  };
}

// ── Types ──────────────────────────────────────────────────────────

interface AccessSettingsProps {
  userId: string;
}

// ── Helpers ──────────────────────────────────────────────────────────

function formatExpiryCountdown(isoString: string | null, language: 'da' | 'en'): string {
  if (!isoString) return language === 'da' ? 'Ingen udløbsdato' : 'No expiry date';
  const now = new Date();
  const expiry = new Date(isoString);
  const diffMs = expiry.getTime() - now.getTime();

  if (diffMs <= 0) {
    return language === 'da' ? 'Udløbet' : 'Expired';
  }

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (days > 0) {
    return days === 1
      ? (language === 'da' ? '1 dag tilbage' : '1 day remaining')
      : (language === 'da' ? `${days} dage tilbage` : `${days} days remaining`);
  }
  return language === 'da'
    ? `${hours} timer tilbage`
    : `${hours} hours remaining`;
}

// ── Component ──────────────────────────────────────────────────────────

export function AccessSettings({ userId }: AccessSettingsProps) {
  const { t, language } = useTranslation();
  const showPlanPrompt = useSubscriptionPlansStore((s) => s.show);

  // ── State ──
  const [accessResult, setAccessResult] = useState<DetailedAccessResult | null>(null);
  const [isLoadingAccess, setIsLoadingAccess] = useState(true);
  const [isStatusExpanded, setIsStatusExpanded] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<ProofUploadResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // ── Fetch access status ──
  // NOTE: `t` is intentionally excluded from deps — it's a new arrow fn on every
  // render (useTranslation creates it inline), which would cause an infinite loop
  // when used as a useCallback dependency. The toast uses the current `t` at call time.
  const fetchAccessStatus = useCallback(async () => {
    setIsLoadingAccess(true);
    try {
      const result = await tokenpayClient.checkAccess(userId) as DetailedAccessResult;
      setAccessResult(result);
    } catch (error) {
      console.error('Failed to fetch access status:', error);
      toast.error(t('couldNotFetchAccessStatus'));
    } finally {
      setIsLoadingAccess(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchAccessStatus();
  }, [fetchAccessStatus]);

  // ── Listen for refresh events (dispatched after payment, plan change, etc.) ──
  // When a subscription payment succeeds, the subscription-plans-prompt
  // dispatches 'auth:refresh' + 'access:refresh' so this component re-fetches
  // its access status immediately — no need for the user to navigate away
  // and back to see the updated "Aktiv plan" + "Adgangsstatus".
  useEffect(() => {
    const handleRefresh = () => {
      fetchAccessStatus();
    };
    window.addEventListener('access:refresh', handleRefresh);
    window.addEventListener('auth:refresh', handleRefresh);
    return () => {
      window.removeEventListener('access:refresh', handleRefresh);
      window.removeEventListener('auth:refresh', handleRefresh);
    };
  }, [fetchAccessStatus]);

  // ── Determine access state ──
  const isGranted = accessResult ? !accessResult.isExpired && accessResult.accessLevel === 'read_write' : false;

  // ── File validation ──
  const validateFile = (file: File): string | null => {
    // .tbkey files have no standard MIME type, so we only check extension
    const isTbkey = file.name.toLowerCase().endsWith('.tbkey');
    if (!isTbkey) {
      return t('onlyZipAllowed');
    }
    return null;
  };

  // ── Upload handler ──
  const handleUpload = useCallback(async (file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setUploadError(validationError);
      toast.error(validationError);
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append('proofFile', file);
      formData.append('userId', userId);

      const result = await tokenpayClient.uploadProof(formData);
      setUploadResult(result);
      setSelectedFile(null);

      if (result.success) {
        toast.success(
          t('proofUploaded'),
          {
            description: language === 'da'
              ? `Niveau: ${result.tier || 'read_write'} — udløber ${result.expiresAt ? new Date(result.expiresAt).toLocaleDateString('da-DK') : 'N/A'}`
              : `Tier: ${result.tier || 'read_write'} — expires ${result.expiresAt ? new Date(result.expiresAt).toLocaleDateString('en-GB') : 'N/A'}`,
          }
        );
        // Refresh access status
        fetchAccessStatus();
      } else {
        setUploadError(result.error || result.message || t('uploadFailed'));
        toast.error(result.error || result.message || t('uploadFailed'));
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('uploadFailed');
      setUploadError(message);
      toast.error(message);
    } finally {
      setIsUploading(false);
    }
  }, [userId, fetchAccessStatus]);

  // ── Drag & drop handlers ──
  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      setSelectedFile(file);
      handleUpload(file);
    }
  }, [handleUpload]);

  // ── File input change ──
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      setSelectedFile(file);
      handleUpload(file);
    }
    // Reset input so the same file can be re-selected
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [handleUpload]);

  // ── Reset upload state ──
  const handleResetUpload = useCallback(() => {
    setUploadResult(null);
    setUploadError(null);
    setSelectedFile(null);
  }, []);

  // ── Loading skeleton ──
  if (isLoadingAccess) {
    return (
      <div className="space-y-4 lg:space-y-6">
        <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
          <CardHeader className="pb-4">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-48" />
          </CardContent>
        </Card>
        <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
          <CardHeader className="pb-4">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-40 w-full rounded-xl border-2 border-dashed" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* ═══ ACCESS STATUS CARD (top — collapsible) ═══ */}
      <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
        <Collapsible open={isStatusExpanded} onOpenChange={setIsStatusExpanded}>
          {/* ── Collapsible header (always visible) ── */}
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between w-full p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5 rounded-t-xl transition-colors">
              <div className="flex items-center gap-3">
                <div className="relative shrink-0">
                  <div
                    className={`h-10 w-10 rounded-xl flex items-center justify-center ${
                      isGranted
                        ? 'bg-gradient-to-br from-emerald-500 to-green-500'
                        : 'bg-gradient-to-br from-gray-400 to-gray-500'
                    }`}
                  >
                    {isGranted
                      ? <ShieldCheck className="h-5 w-5 text-white" />
                      : <ShieldX className="h-5 w-5 text-white" />
                    }
                  </div>
                  {isGranted && (
                    <span className="absolute -top-0.5 -right-0.5 h-3 w-3 bg-emerald-400 rounded-full border-2 border-white dark:border-gray-900 animate-pulse" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {t('accessStatus')}
                    </span>
                    <Badge
                      variant={isGranted ? 'default' : 'secondary'}
                      className={
                        isGranted
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-0'
                          : 'bg-gray-200 dark:bg-white/10 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-white/15 border-0'
                      }
                    >
                      {accessResult?.sourceLabelDa
                        ? (language === 'da' ? accessResult.sourceLabelDa : accessResult.sourceLabelEn)
                        : getAccessLevelLabel(accessResult?.accessLevel || 'read_only', language)
                      }
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {isGranted
                      ? (language === 'da' ? 'Klik for detaljer' : 'Click for details')
                      : (language === 'da' ? 'Ingen adgang — vælg en plan' : 'No access — choose a plan')
                    }
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => { e.stopPropagation(); fetchAccessStatus(); }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  title={t('refreshStatus')}
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
                {isStatusExpanded
                  ? <ChevronDown className="h-5 w-5 text-gray-400" />
                  : <ChevronRight className="h-5 w-5 text-gray-400" />
                }
              </div>
            </div>
          </CollapsibleTrigger>

          {/* ── Collapsible content (only when expanded) ── */}
          <CollapsibleContent>
            <CardContent className="space-y-4 pt-2">
              {/* ── Current access summary ── */}
              {/* Shows ONLY info relevant to the current access source. */}
              <div
                className={`rounded-xl p-4 ${
                  isGranted
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40'
                    : 'bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0 space-y-2">
                    {/* Status line */}
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">
                        {isGranted
                          ? (language === 'da' ? 'Adgang tildelt' : 'Access granted')
                          : (language === 'da' ? 'Adgang nægtet' : 'Access denied')
                        }
                      </span>
                    </div>

                    {/* Source-specific info — only show what's relevant */}
                    {accessResult?.source === 'owner' && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {language === 'da'
                          ? 'Du er App-ejer med permanent fuld adgang til alle features.'
                          : 'You are the App Owner with permanent full access to all features.'}
                      </p>
                    )}

                    {accessResult?.source === 'subscription_plan' && accessResult?.planTier && accessResult.planTier !== 'free' && (
                      <>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {language === 'da'
                            ? `Aktiv plan: ${accessResult.sourceLabelDa}`
                            : `Active plan: ${accessResult.sourceLabelEn}`}
                        </p>
                        {accessResult.planExpiresAt && (
                          <div className={`flex items-center gap-1.5 text-xs ${
                            (accessResult.daysRemaining ?? 999) <= 7
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-gray-500 dark:text-gray-400'
                          }`}>
                            <Calendar className="h-3.5 w-3.5" />
                            <span>
                              {language === 'da' ? 'Binding udløber: ' : 'Binding expires: '}
                              {new Date(accessResult.planExpiresAt).toLocaleDateString(
                                language === 'da' ? 'da-DK' : 'en-GB',
                                { day: 'numeric', month: 'short', year: 'numeric' }
                              )}
                              {' '}({formatExpiryCountdown(accessResult.planExpiresAt, language)})
                            </span>
                          </div>
                        )}
                      </>
                    )}

                    {accessResult?.source === 'subscription' && (
                      <>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {language === 'da'
                            ? 'Gratis plan — fuld adgang så længe omsætningen er under 50.000 kr.'
                            : 'Free plan — full access as long as revenue is below 50,000 DKK.'}
                        </p>
                        {accessResult?.revenue !== undefined && accessResult?.revenue !== null && (
                          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                            <TrendingUp className="h-3.5 w-3.5" />
                            <span>
                              {language === 'da' ? 'Omsætning i år: ' : 'Revenue this year: '}
                              {accessResult.revenue.toLocaleString(language === 'da' ? 'da-DK' : 'en-GB', { maximumFractionDigits: 0 })} kr.
                            </span>
                          </div>
                        )}
                      </>
                    )}

                    {accessResult?.source === 'tbkey' && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {language === 'da'
                          ? 'Adgang via .tbkey proof — alle features er tilgængelige.'
                          : 'Access via .tbkey proof — all features are available.'}
                      </p>
                    )}

                    {accessResult?.source === 'no_plan' && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        {language === 'da'
                          ? 'Ingen plan valgt. Vælg en plan for at få adgang.'
                          : 'No plan chosen. Choose a plan to get access.'}
                      </p>
                    )}

                    {accessResult?.source === 'expired' && (
                      <p className="text-xs text-red-600 dark:text-red-400">
                        {language === 'da'
                          ? 'Din adgang er udløbet. Vælg en plan for at få adgang igen.'
                          : 'Your access has expired. Choose a plan to regain access.'}
                      </p>
                    )}

                    {accessResult?.source === 'denied' && (
                      <p className="text-xs text-red-600 dark:text-red-400">
                        {language === 'da'
                          ? 'Adgang nægtet. Vælg en plan eller kontakt support.'
                          : 'Access denied. Choose a plan or contact support.'}
                      </p>
                    )}

                    {/* Revoked warning */}
                    {accessResult?.subscriptionRevoked && (
                      <p className="text-xs text-orange-600 dark:text-orange-400 flex items-center gap-1.5">
                        <Ban className="h-3.5 w-3.5" />
                        {language === 'da'
                          ? 'Abonnement blokeret af App-ejer'
                          : 'Subscription blocked by App Owner'}
                      </p>
                    )}
                  </div>

                  {/* Upgrade button — shown for non-owner, non-tbkey users */}
                  {accessResult?.source !== 'owner' && accessResult?.source !== 'tbkey' && (
                    <Button
                      onClick={() => showPlanPrompt()}
                      size="sm"
                      className="shrink-0 bg-[#0d9488] hover:bg-[#0f766e] text-white gap-1.5"
                    >
                      <Zap className="h-3.5 w-3.5" />
                      {language === 'da' ? 'Opgrader' : 'Upgrade'}
                    </Button>
                  )}
                </div>
              </div>

              {/* ── Proof Details (after successful upload) ── */}
              {uploadResult?.success && uploadResult.manifest && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      {t('proofDetails')}
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="rounded-lg bg-gray-50 dark:bg-white/5 p-3">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Proof ID</p>
                        <p className="text-sm font-mono font-medium text-gray-900 dark:text-white">
                          {uploadResult.proofId.slice(0, 12)}...
                        </p>
                      </div>
                      <div className="rounded-lg bg-gray-50 dark:bg-white/5 p-3">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Escrow ID</p>
                        <p className="text-sm font-mono font-medium text-gray-900 dark:text-white">
                          {uploadResult.manifest.escrowId.slice(0, 12)}...
                        </p>
                      </div>
                      <div className="rounded-lg bg-gray-50 dark:bg-white/5 p-3">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{t('issuer')}</p>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {uploadResult.manifest.issuer || '—'}
                        </p>
                      </div>
                      <div className="rounded-lg bg-gray-50 dark:bg-white/5 p-3">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{t('expiryDate')}</p>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {uploadResult.manifest.expiresAt
                            ? new Date(uploadResult.manifest.expiresAt).toLocaleDateString(
                                language === 'da' ? 'da-DK' : 'en-GB',
                                { day: 'numeric', month: 'short', year: 'numeric' }
                              )
                            : '—'}
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* ═══ PROOF UPLOAD CARD ═══ */}
      <Card className="stat-card card-hover-lift border-0 shadow-lg dark:border dark:border-white/5">
        <CardHeader className="pb-4">
          <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shrink-0">
              <FileKey2 className="h-4 w-4 text-white" />
            </div>
            {t('uploadProof')}
          </CardTitle>
          <CardDescription className="text-sm text-gray-500 dark:text-gray-400">
            {t('uploadProofDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* ── Info box ── */}
          <p className="text-xs text-gray-500 dark:text-gray-400 info-box-primary rounded-lg p-3 flex items-start gap-2">
            <Info className="h-4 w-4 shrink-0 mt-0.5 text-[#14b8a6] dark:text-[#99f6e4]" />
            {t('proofInfoText')}
          </p>

          {/* ── Drag and drop area ── */}
          {!uploadResult?.success && (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => !isUploading && fileInputRef.current?.click()}
              className={`relative rounded-xl border-2 border-dashed p-6 sm:p-8 text-center cursor-pointer transition-all ${
                isDragOver
                  ? 'border-[#0d9488] bg-[#0d9488]/5 dark:border-[#2dd4bf] dark:bg-[#2dd4bf]/5'
                  : isUploading
                    ? 'border-gray-300 dark:border-white/20 bg-gray-50 dark:bg-white/5 cursor-wait'
                    : 'border-gray-300 dark:border-white/10 hover:border-[#0d9488] dark:hover:border-[#2dd4bf] hover:bg-[#0d9488]/5 dark:hover:bg-[#2dd4bf]/5'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".tbkey"
                onChange={handleFileChange}
                className="sr-only"
              />

              {isUploading ? (
                <div className="space-y-3">
                  <Loader2 className="h-10 w-10 text-[#0d9488] dark:text-[#2dd4bf] mx-auto animate-spin" />
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('uploadingProof')}
                  </p>
                  {selectedFile && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className={`h-12 w-12 rounded-xl mx-auto flex items-center justify-center transition-colors ${
                    isDragOver
                      ? 'bg-[#0d9488]/10 dark:bg-[#2dd4bf]/10'
                      : 'bg-gray-100 dark:bg-white/5'
                  }`}>
                    <Upload className={`h-6 w-6 transition-colors ${
                      isDragOver
                        ? 'text-[#0d9488] dark:text-[#2dd4bf]'
                        : 'text-gray-400 dark:text-gray-500'
                    }`} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {isDragOver
                        ? t('dropFileHere')
                        : t('dragDropZip')
                      }
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {t('onlyZipSupported')}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Upload Error ── */}
          {uploadError && (
            <div className="rounded-xl border border-red-200 dark:border-red-800/40 bg-red-50 dark:bg-red-900/20 p-4 flex items-start gap-3">
              <XCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-red-800 dark:text-red-300">
                  {t('uploadFailed')}
                </p>
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                  {uploadError}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetUpload}
                className="shrink-0 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/30"
              >
                {t('tryAgain')}
              </Button>
            </div>
          )}

          {/* ── Upload Success ── */}
          {uploadResult?.success && (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-900/20 p-4 flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                  {t('proofUploadedSuccess')}
                </p>
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                  {t('tierUpgraded')} {uploadResult.tier || 'read_write'}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetUpload}
                className="shrink-0 text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/30"
              >
                {t('uploadNew')}
              </Button>
            </div>
          )}

          {/* ── Manual upload button (fallback) ── */}
          {!uploadResult?.success && (
            <div className="flex items-center gap-2">
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                variant="outline"
                className="border-[#0d9488] text-[#0d9488] hover:bg-[#0d9488] hover:text-white dark:border-[#2dd4bf] dark:text-[#2dd4bf] dark:hover:bg-[#2dd4bf] dark:hover:text-gray-900 gap-2"
              >
                {isUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {isUploading
                  ? t('uploading')
                  : t('chooseZipFile')
                }
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* ═══ TWO-FACTOR AUTHENTICATION (now below access status) ═══ */}
      <TwoFactorSettings userId={userId} />
    </div>
  );
}
