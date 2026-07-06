'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { User } from '@/lib/auth-store';
import { useTranslation } from '@/lib/use-translation';
import { toast } from 'sonner';
import { useDataVersion } from '@/hooks/use-data-version';
import { useDraftSync } from '@/hooks/use-draft-sync';
import { useWarnOnUnsaved } from '@/hooks/use-warn-unsaved';
import { readDraft } from '@/lib/draft-store';
import { ClearFormButton } from '@/components/ui/clear-form-button';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Landmark,
  RefreshCw,
  Plus,
  Settings,
  Trash2,
  Wifi,
  WifiOff,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Sparkles,
  Clock,
  Loader2,
  ChevronDown,
  ChevronRight,
  Shield,
  Zap,
  ArrowDownToLine,
  Info,
  Pencil,
  Power,
} from 'lucide-react';

// ──────────────── Types ────────────────

interface BankConnectionSync {
  id: string;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'PENDING';
  startedAt: string;
  completedAt: string | null;
  transactionsFound: number;
  transactionsNew: number;
  transactionsDup: number;
  matchedCount: number;
  errorMessage: string | null;
}

interface BankConnection {
  id: string;
  bankName: string;
  provider: string;
  registrationNumber: string | null;
  accountNumber: string;
  iban: string | null;
  accountName: string | null;
  currentBalance: number | null;
  lastSyncAt: string | null;
  nextSyncAt: string | null;
  syncFrequency: string;
  status: 'ACTIVE' | 'INACTIVE' | 'EXPIRED' | 'PENDING' | 'REVOKED' | 'ERROR';
  consentId: string | null;
  consentExpiresAt: string | null;
  retryCount: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  recentSyncs: BankConnectionSync[];
  unmatchedCount: number;
}

interface AvailableBank {
  id: string;
  name: string;
  isDemo?: boolean;
  isConfigured?: boolean;
  providesAccounts?: boolean;
}

interface AiMatchSummary {
  totalUnmatched: number;
  autoMatched: number;
  suggested: number;
  remaining: number;
}

interface OpenBankingSectionProps {
  user: User;
  onSyncComplete?: () => void;
}

// ──────────────── Helpers ────────────────

function maskAccountNumber(accountNumber: string): string {
  if (accountNumber.length <= 4) return accountNumber;
  const visible = accountNumber.slice(-4);
  const masked = accountNumber.slice(0, -4).replace(/./g, '•');
  return masked + visible;
}

function formatRelativeTime(dateStr: string | null, language: string): string {
  if (!dateStr) return language === 'da' ? 'Aldrig' : 'Never';

  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return language === 'da' ? 'Lige nu' : 'Just now';
  if (diffMins < 60) return language === 'da' ? `${diffMins} min siden` : `${diffMins}m ago`;
  if (diffHours < 24) return language === 'da' ? `${diffHours} timer siden` : `${diffHours}h ago`;
  if (diffDays < 7) return language === 'da' ? `${diffDays} dage siden` : `${diffDays}d ago`;

  return date.toLocaleDateString(language === 'da' ? 'da-DK' : 'en-US', {
    day: 'numeric',
    month: 'short',
  });
}

function getStatusConfig(status: BankConnection['status'], language: string) {
  switch (status) {
    case 'ACTIVE':
      return {
        label: language === 'da' ? 'Aktiv' : 'Active',
        icon: Wifi,
        bgClass: 'bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400 border-green-500/20',
        dotClass: 'bg-green-500',
      };
    case 'INACTIVE':
      return {
        label: language === 'da' ? 'Deaktiveret' : 'Deactivated',
        icon: Power,
        bgClass: 'bg-slate-500/10 text-slate-600 dark:bg-slate-400/20 dark:text-slate-300 border-slate-500/20',
        dotClass: 'bg-slate-500',
      };
    case 'PENDING':
      return {
        label: language === 'da' ? 'Afventer' : 'Pending',
        icon: Clock,
        bgClass: 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 border-amber-500/20',
        dotClass: 'bg-amber-500',
      };
    case 'EXPIRED':
      return {
        label: language === 'da' ? 'Udløbet' : 'Expired',
        icon: AlertTriangle,
        bgClass: 'bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400 border-red-500/20',
        dotClass: 'bg-red-500',
      };
    case 'REVOKED':
      return {
        label: language === 'da' ? 'Tilbagekaldt' : 'Revoked',
        icon: WifiOff,
        bgClass: 'bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400 border-red-500/20',
        dotClass: 'bg-red-500',
      };
    case 'ERROR':
      return {
        label: language === 'da' ? 'Fejl' : 'Error',
        icon: XCircle,
        bgClass: 'bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400 border-red-500/20',
        dotClass: 'bg-red-500',
      };
    default:
      return {
        label: status,
        icon: WifiOff,
        bgClass: 'bg-gray-500/10 text-gray-600 dark:bg-gray-500/20 dark:text-gray-400 border-gray-500/20',
        dotClass: 'bg-gray-500',
      };
  }
}

function getBankIcon(provider: string) {
  // Each bank could have a distinct icon; for now we use Landmark
  return Landmark;
}

// ──────────────── Component ────────────────

export function OpenBankingSection({ user, onSyncComplete }: OpenBankingSectionProps) {
  const { t, tc, language } = useTranslation();

  // ── State ──
  const [connections, setConnections] = useState<BankConnection[]>([]);
  const [availableBanks, setAvailableBanks] = useState<AvailableBank[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Connect dialog
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [connectBankName, setConnectBankName] = useState('');
  const [connectProvider, setConnectProvider] = useState('');
  const [connectRegNumber, setConnectRegNumber] = useState('');
  const [connectAccountNumber, setConnectAccountNumber] = useState('');
  const [connectIban, setConnectIban] = useState('');
  const [connectAccountName, setConnectAccountName] = useState('');
  const [connectSyncFrequency, setConnectSyncFrequency] = useState('daily');
  const [isConnecting, setIsConnecting] = useState(false);
  const [companyBankInfo, setCompanyBankInfo] = useState<{
    bankName: string;
    bankRegistration: string;
    bankAccount: string;
    bankIban: string | null;
    companyName: string;
  } | null>(null);
  const [autofilledFields, setAutofilledFields] = useState<Set<string>>(new Set());

  // Sync states (per connection)
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [connectionToDelete, setConnectionToDelete] = useState<BankConnection | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Edit dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [connectionToEdit, setConnectionToEdit] = useState<BankConnection | null>(null);
  const [editBankName, setEditBankName] = useState('');
  const [editRegNumber, setEditRegNumber] = useState('');
  const [editAccountNumber, setEditAccountNumber] = useState('');
  const [editIban, setEditIban] = useState('');
  const [editAccountName, setEditAccountName] = useState('');
  const [editFrequency, setEditFrequency] = useState('daily');
  const [isEditing, setIsEditing] = useState(false);

  // Deactivate / activate
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

  // Consent renew
  const [renewingConsentIds, setRenewingConsentIds] = useState<Set<string>>(new Set());

  // Consent authorization dialog
  const [consentDialogOpen, setConsentDialogOpen] = useState(false);
  const [consentInfo, setConsentInfo] = useState<{
    connectionId: string;
    consentId: string;
    providerId: string;
    bankName: string;
    redirectUrl: string;
    sandboxMode: boolean;
    providerProvidesAccounts?: boolean;
  } | null>(null);
  const [isAuthorizing, setIsAuthorizing] = useState(false);

  // AI match
  const [isRunningAiMatch, setIsRunningAiMatch] = useState(false);
  const [aiMatchResult, setAiMatchResult] = useState<AiMatchSummary | null>(null);

  // ── Draft persistence (connect + edit bank-connection forms) ──
  const { clearDraft: clearConnectDraft } = useDraftSync(
    'bank-connection:new',
    {
      connectBankName,
      connectProvider,
      connectRegNumber,
      connectAccountNumber,
      connectIban,
      connectAccountName,
      connectSyncFrequency,
    },
    {
      label: language === 'da' ? 'Ny bankforbindelse' : 'New bank connection',
      disabled: !connectDialogOpen,
    }
  );
  const editDraftKey = connectionToEdit ? `bank-connection:edit:${connectionToEdit.id}` : 'bank-connection:edit:none';
  const { clearDraft: clearEditDraft } = useDraftSync(
    editDraftKey,
    { editBankName, editRegNumber, editAccountNumber, editIban, editAccountName, editFrequency },
    {
      label: language === 'da' ? 'Rediger bankforbindelse' : 'Edit bank connection',
      disabled: !editDialogOpen,
    }
  );

  // ── Dirty tracking + safety-net guard ──
  const isConnectDirty = connectDialogOpen && (
    connectBankName.trim() !== '' ||
    connectProvider !== '' ||
    connectRegNumber.trim() !== '' ||
    connectAccountNumber.trim() !== '' ||
    connectIban.trim() !== '' ||
    connectAccountName.trim() !== '' ||
    connectSyncFrequency !== 'daily'
  );
  const loadedEditBankRef = useRef<{
    bankName: string;
    regNumber: string;
    accountNumber: string;
    iban: string;
    accountName: string;
    freq: string;
  } | null>(null);
  const isEditBankDirty = editDialogOpen && loadedEditBankRef.current !== null && (
    editBankName !== loadedEditBankRef.current.bankName ||
    editRegNumber !== loadedEditBankRef.current.regNumber ||
    editAccountNumber !== loadedEditBankRef.current.accountNumber ||
    editIban !== loadedEditBankRef.current.iban ||
    editAccountName !== loadedEditBankRef.current.accountName ||
    editFrequency !== loadedEditBankRef.current.freq
  );
  const connectGuard = useWarnOnUnsaved(isConnectDirty, {
    onConfirmDiscard: () => { clearConnectDraft(); setConnectDialogOpen(false); },
    window: false,
  });
  const editBankGuard = useWarnOnUnsaved(isEditBankDirty, {
    onConfirmDiscard: () => { clearEditDraft(); setEditDialogOpen(false); setConnectionToEdit(null); },
    window: false,
  });

  // ── Open connect dialog (with draft restore) ──
  const openConnectDialog = useCallback(() => {
    const draft = readDraft('bank-connection:new');
    if (draft?.data) {
      const d = draft.data;
      setConnectBankName(typeof d.connectBankName === 'string' ? d.connectBankName : '');
      setConnectProvider(typeof d.connectProvider === 'string' ? d.connectProvider : '');
      setConnectRegNumber(typeof d.connectRegNumber === 'string' ? d.connectRegNumber : '');
      setConnectAccountNumber(typeof d.connectAccountNumber === 'string' ? d.connectAccountNumber : '');
      setConnectIban(typeof d.connectIban === 'string' ? d.connectIban : '');
      setConnectAccountName(typeof d.connectAccountName === 'string' ? d.connectAccountName : '');
      setConnectSyncFrequency(typeof d.connectSyncFrequency === 'string' ? d.connectSyncFrequency : 'daily');
    } else {
      resetConnectForm();
    }
    setConnectDialogOpen(true);
  }, []);

  // ── Open edit dialog (with draft restore, merging over server data) ──
  const openEditDialog = useCallback((connection: BankConnection) => {
    const serverFreq = connection.syncFrequency || 'daily';
    const serverName = connection.accountName || '';
    const serverBankName = connection.bankName || '';
    const serverRegNumber = connection.registrationNumber || '';
    const serverAccountNumber = connection.accountNumber || '';
    const serverIban = connection.iban || '';
    const draft = readDraft(`bank-connection:edit:${connection.id}`);
    let initialFreq = serverFreq;
    let initialName = serverName;
    let initialBankName = serverBankName;
    let initialRegNumber = serverRegNumber;
    let initialAccountNumber = serverAccountNumber;
    let initialIban = serverIban;
    if (draft?.data) {
      const d = draft.data;
      if (typeof d.editFrequency === 'string') initialFreq = d.editFrequency;
      if (typeof d.editAccountName === 'string') initialName = d.editAccountName;
      if (typeof d.editBankName === 'string') initialBankName = d.editBankName;
      if (typeof d.editRegNumber === 'string') initialRegNumber = d.editRegNumber;
      if (typeof d.editAccountNumber === 'string') initialAccountNumber = d.editAccountNumber;
      if (typeof d.editIban === 'string') initialIban = d.editIban;
    }
    setConnectionToEdit(connection);
    setEditBankName(initialBankName);
    setEditRegNumber(initialRegNumber);
    setEditAccountNumber(initialAccountNumber);
    setEditIban(initialIban);
    setEditAccountName(initialName);
    setEditFrequency(initialFreq);
    loadedEditBankRef.current = {
      bankName: initialBankName,
      regNumber: initialRegNumber,
      accountNumber: initialAccountNumber,
      iban: initialIban,
      accountName: initialName,
      freq: initialFreq,
    };
    setEditDialogOpen(true);
  }, []);

  // ── Fetch connections ──

  const fetchConnections = useCallback(async () => {
    try {
      const response = await fetch('/api/bank-connections');
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setConnections(data.connections || []);
    } catch (err) {
      console.error('Failed to fetch bank connections:', err);
    }
  }, []);

  const fetchAvailableBanks = useCallback(async () => {
    try {
      const response = await fetch('/api/bank-connections?action=banks');
      if (!response.ok) throw new Error('Failed to fetch banks');
      const data = await response.json();
      setAvailableBanks(data.banks || []);
    } catch (err) {
      console.error('Failed to fetch available banks:', err);
    }
  }, []);

  const loadAll = useCallback(async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    await Promise.all([fetchConnections(), fetchAvailableBanks()]);
    if (showLoading) setIsLoading(false);
  }, [fetchConnections, fetchAvailableBanks]);

  // Auto-refresh bank connections when the server signals a data-changed event.
  const bankConnectionsVersion = useDataVersion('bank-connections');

  useEffect(() => {
    loadAll();
  }, [loadAll, bankConnectionsVersion]);

  // ── Computed ──

  const activeConnections = useMemo(
    () => connections.filter((c) => c.status === 'ACTIVE'),
    [connections]
  );

  const connectionsNeedingAttention = useMemo(
    () => connections.filter((c) => ['EXPIRED', 'ERROR', 'PENDING'].includes(c.status)),
    [connections]
  );

  const totalBalance = useMemo(
    () => activeConnections.reduce((sum, c) => sum + Number(c.currentBalance || 0), 0),
    [activeConnections]
  );

  const totalUnmatched = useMemo(
    () => connections.reduce((sum, c) => sum + Number(c.unmatchedCount), 0),
    [connections]
  );

  // ── Connect ──

  const handleConnect = useCallback(async () => {
    // For Tink (providesAccounts), accountNumber is not needed upfront
    const selectedBank = availableBanks.find(b => b.id === connectProvider);
    const needsAccount = !selectedBank?.providesAccounts;
    if (!connectProvider || (needsAccount && !connectAccountNumber)) {
      toast.error(language === 'da' ? 'Manglende felter' : 'Missing fields', {
        description: language === 'da'
          ? 'Udfyld venligst bank og kontonummer'
          : 'Please fill in bank and account number',
      });
      return;
    }

    if (connectRegNumber && !/^\d{4}$/.test(connectRegNumber)) {
      toast.error(language === 'da' ? 'Ugyldigt registreringsnummer' : 'Invalid registration number', {
        description: language === 'da'
          ? 'Registreringsnummer skal være 4 cifre'
          : 'Registration number must be 4 digits',
      });
      return;
    }

    setIsConnecting(true);
    try {
      const response = await fetch('/api/bank-connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bankName: connectBankName || connectProvider,
          provider: connectProvider,
          registrationNumber: connectRegNumber || undefined,
          accountNumber: connectAccountNumber,
          iban: connectIban || undefined,
          accountName: connectAccountName || undefined,
          syncFrequency: connectSyncFrequency,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Connection failed');
      }

      const result = await response.json();

      // Check for consent redirect — real bank requires authorization
      if (result.consentRedirect) {
        // Close the connect dialog, open consent authorization dialog
        setConnectDialogOpen(false);
        clearConnectDraft();
        setConsentInfo({
          connectionId: result.connection.id,
          consentId: result.connection.consentId,
          providerId: result.connection.provider,
          bankName: result.connection.bankName,
          redirectUrl: result.consentRedirect,
          sandboxMode: result.sandboxMode || false,
          providerProvidesAccounts: result.providerProvidesAccounts || false,
        });
        setConsentDialogOpen(true);
        await fetchConnections();
      } else {
        // Demo bank — connected immediately
        toast.success(language === 'da' ? 'Bankforbindelse oprettet' : 'Bank connection created', {
          description: language === 'da'
            ? `${connectBankName || connectProvider} er nu tilknyttet`
            : `${connectBankName || connectProvider} is now connected`,
        });
        setConnectDialogOpen(false);
        clearConnectDraft();
        resetConnectForm();
        await fetchConnections();
        onSyncComplete?.();
      }
    } catch (err: any) {
      toast.error(language === 'da' ? 'Kunne ikke forbinde' : 'Failed to connect', {
        description: err.message || (language === 'da'
          ? 'Der opstod en fejl ved oprettelse af bankforbindelsen'
          : 'An error occurred while creating the bank connection'),
      });
    } finally {
      setIsConnecting(false);
    }
  }, [
    connectBankName, connectProvider, connectRegNumber, connectAccountNumber,
    connectIban, connectAccountName, connectSyncFrequency, language,
    fetchConnections, onSyncComplete,
  ]);

  const resetConnectForm = useCallback(() => {
    setConnectBankName('');
    setConnectProvider('');
    setConnectRegNumber('');
    setConnectAccountNumber('');
    setConnectIban('');
    setConnectAccountName('');
    setConnectSyncFrequency('daily');
    setAutofilledFields(new Set());
    setCompanyBankInfo(null);
  }, []);

  // ── Consent Authorization ──

  const handleConsentAuthorize = useCallback(async () => {
    if (!consentInfo) return;
    setIsAuthorizing(true);
    try {
      if (consentInfo.sandboxMode) {
        // Sandbox: authorize directly via API
        const response = await fetch('/api/bank-connections/consent-callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            consentId: consentInfo.consentId,
            providerId: consentInfo.providerId,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Authorization failed');
        }

        toast.success(language === 'da' ? 'Bankgodkendelse fuldført' : 'Bank authorization completed', {
          description: language === 'da'
            ? `${consentInfo.bankName} er nu godkendt og aktiv`
            : `${consentInfo.bankName} is now authorized and active`,
        });
      } else {
        // Production: open the bank's authorization page in a new window
        window.open(consentInfo.redirectUrl, 'bank-authorization', 'width=600,height=700');

        // Listen for the callback message from the popup
        const handleMessage = async (event: MessageEvent) => {
          // Tink: account selected in the callback page → finalize the connection
          if (event.data?.type === 'tink-accounts-selected' && consentInfo) {
            window.removeEventListener('message', handleMessage);
            setConsentDialogOpen(false);

            const { connectionId, account } = event.data;
            try {
              toast.loading(
                language === 'da' ? 'Tilkobler konto...' : 'Connecting account...',
                { id: 'tink-connect' }
              );
              const response = await fetch('/api/bank-connections/tink-accounts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  connectionId,
                  accountId: account.id,
                  accountNumber: account.accountNumber,
                  iban: account.iban,
                  accountName: account.name,
                  bankName: account.bankName,
                  balance: account.balance,
                  credentialsId: account.credentialsId,
                }),
              });
              if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || 'Kunne ikke tilkoble kontoen');
              }
              toast.dismiss('tink-connect');
              toast.success(
                language === 'da' ? 'Konto tilkoblet!' : 'Account connected!',
                {
                  description: `${account.name || account.type} — ${account.bankName}`,
                }
              );
              setConsentInfo(null);
              await fetchConnections();
              onSyncComplete?.();
            } catch (err: any) {
              toast.dismiss('tink-connect');
              toast.error(
                language === 'da' ? 'Kunne ikke tilkoble konto' : 'Failed to connect account',
                { description: err.message }
              );
            }
          }

          // Legacy: non-Tink consent callback
          if (event.data?.type === 'bank-consent-complete') {
            window.removeEventListener('message', handleMessage);
            toast.success(language === 'da' ? 'Bankgodkendelse fuldført' : 'Bank authorization completed', {
              description: language === 'da'
                ? `${consentInfo?.bankName} er nu godkendt`
                : `${consentInfo?.bankName} is now authorized`,
            });
            setConsentDialogOpen(false);
            setConsentInfo(null);
            fetchConnections();
            onSyncComplete?.();
          }
        };
        window.addEventListener('message', handleMessage);

        // Also poll for status change as a fallback
        toast(language === 'da' ? 'Venter på bankgodkendelse' : 'Waiting for bank authorization', {
          description: language === 'da'
            ? 'Godkend din bank i det nye vindue'
            : 'Authorize your bank in the new window',
        });
      }

      setConsentDialogOpen(false);
      setConsentInfo(null);
      resetConnectForm();
      await fetchConnections();
      onSyncComplete?.();
    } catch (err: any) {
      toast.error(language === 'da' ? 'Godkendelse fejlede' : 'Authorization failed', {
        description: err.message || (language === 'da'
          ? 'Kunne ikke godkende bankforbindelsen'
          : 'Could not authorize the bank connection'),
      });
    } finally {
      setIsAuthorizing(false);
    }
  }, [consentInfo, language, fetchConnections, onSyncComplete, resetConnectForm]);

  // ── Sync ──

  const handleSync = useCallback(async (connectionId: string) => {
    setSyncingIds((prev) => new Set(prev).add(connectionId));
    try {
      const response = await fetch(`/api/bank-connections/${connectionId}/sync`, {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Sync failed');
      }

      const result = await response.json();

      toast.success(language === 'da' ? 'Synkronisering fuldført' : 'Sync completed', {
        description: language === 'da'
          ? `${result.sync?.transactionsNew || 0} nye posteringer fundet`
          : `${result.sync?.transactionsNew || 0} new transactions found`,
      });

      await fetchConnections();
      onSyncComplete?.();
    } catch (err: any) {
      toast.error(language === 'da' ? 'Synkronisering fejlede' : 'Sync failed', {
        description: err.message || (language === 'da'
          ? 'Kunne ikke synkronisere bankforbindelsen'
          : 'Could not sync the bank connection'),
      });
    } finally {
      setSyncingIds((prev) => {
        const next = new Set(prev);
        next.delete(connectionId);
        return next;
      });
    }
  }, [language, fetchConnections, onSyncComplete]);

  // ── Delete ──

  const handleDelete = useCallback(async () => {
    if (!connectionToDelete) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/bank-connections/${connectionToDelete.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Delete failed');
      }

      const result = await response.json();
      toast.success(language === 'da' ? 'Bankforbindelse slettet permanent' : 'Bank connection permanently deleted', {
        description: language === 'da'
          ? `${connectionToDelete.bankName} er nu slettet${result.preservedStatements ? ` — ${result.preservedStatements} kontoudtogs posteringer bevaret` : ''}`
          : `${connectionToDelete.bankName} has been deleted${result.preservedStatements ? ` — ${result.preservedStatements} statement(s) of transactions preserved` : ''}`,
      });

      setDeleteDialogOpen(false);
      setConnectionToDelete(null);
      await fetchConnections();
      onSyncComplete?.();
    } catch (err) {
      toast.error(language === 'da' ? 'Kunne ikke slette' : 'Failed to remove', {
        description: language === 'da'
          ? 'Der opstod en fejl ved sletning af bankforbindelsen'
          : 'An error occurred while removing the bank connection',
      });
    } finally {
      setIsDeleting(false);
    }
  }, [connectionToDelete, language, fetchConnections, onSyncComplete]);

  // ── Edit ──

  const handleEdit = useCallback(async () => {
    if (!connectionToEdit) return;

    const trimmedReg = editRegNumber.trim();
    if (trimmedReg && !/^\d{4}$/.test(trimmedReg)) {
      toast.error(language === 'da' ? 'Ugyldigt registreringsnummer' : 'Invalid registration number', {
        description: language === 'da'
          ? 'Registreringsnummer skal være 4 cifre'
          : 'Registration number must be 4 digits',
      });
      return;
    }

    if (!editBankName.trim()) {
      toast.error(language === 'da' ? 'Banknavn mangler' : 'Bank name required', {
        description: language === 'da' ? 'Angiv et banknavn' : 'Please enter a bank name',
      });
      return;
    }

    if (!editAccountNumber.trim()) {
      toast.error(language === 'da' ? 'Kontonummer mangler' : 'Account number required', {
        description: language === 'da' ? 'Angiv et kontonummer' : 'Please enter an account number',
      });
      return;
    }

    setIsEditing(true);
    try {
      const response = await fetch(`/api/bank-connections/${connectionToEdit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bankName: editBankName.trim(),
          registrationNumber: trimmedReg || undefined,
          accountNumber: editAccountNumber.trim(),
          iban: editIban.trim() || undefined,
          accountName: editAccountName.trim() || undefined,
          syncFrequency: editFrequency,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Update failed');
      }

      toast.success(language === 'da' ? 'Indstillinger opdateret' : 'Settings updated', {
        description: language === 'da'
          ? 'Bankforbindelsen er blevet opdateret'
          : 'Bank connection has been updated',
      });

      setEditDialogOpen(false);
      clearEditDraft();
      loadedEditBankRef.current = null;
      setConnectionToEdit(null);
      await fetchConnections();
    } catch (err) {
      toast.error(language === 'da' ? 'Kunne ikke opdatere' : 'Failed to update', {
        description: err instanceof Error ? err.message : (language === 'da'
          ? 'Der opstod en fejl ved opdatering af bankforbindelsen'
          : 'An error occurred while updating the bank connection'),
      });
    } finally {
      setIsEditing(false);
    }
  }, [connectionToEdit, editBankName, editRegNumber, editAccountNumber, editIban, editAccountName, editFrequency, language, fetchConnections]);

  // ── Deactivate / Activate ──

  const handleToggleActive = useCallback(async (connection: BankConnection) => {
    const isCurrentlyActive = connection.status === 'ACTIVE';
    const action = isCurrentlyActive ? 'deactivate' : 'activate';
    setTogglingIds((prev) => new Set(prev).add(connection.id));
    try {
      const response = await fetch(`/api/bank-connections/${connection.id}/${action}`, {
        method: 'POST',
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || (language === 'da' ? 'Handlingen mislykkedes' : 'Action failed'));
      }
      const result = await response.json();
      if (result.needsConsentRenewal) {
        toast.warning(language === 'da' ? 'Godkendelse udløbet' : 'Consent expired', {
          description: language === 'da'
            ? 'Bankgodkendelsen er udløbet. Forny godkendelsen for at reaktivere forbindelsen.'
            : 'The bank consent has expired. Renew consent to reactivate the connection.',
        });
      } else {
        toast.success(
          isCurrentlyActive
            ? (language === 'da' ? 'Bankforbindelse deaktiveret' : 'Bank connection deactivated')
            : (language === 'da' ? 'Bankforbindelse reaktiveret' : 'Bank connection reactivated'),
          {
            description: isCurrentlyActive
              ? (language === 'da'
                ? `${connection.bankName} er deaktiveret. Automatisk synk er stoppet. Tidligere posteringer bevares.`
                : `${connection.bankName} has been deactivated. Auto-sync is stopped. Existing transactions are preserved.`)
              : (language === 'da'
                ? `${connection.bankName} er aktiv igen.`
                : `${connection.bankName} is active again.`),
          }
        );
      }
      await fetchConnections();
    } catch (err) {
      toast.error(
        isCurrentlyActive
          ? (language === 'da' ? 'Kunne ikke deaktivere' : 'Failed to deactivate')
          : (language === 'da' ? 'Kunne ikke reaktivere' : 'Failed to reactivate'),
        {
          description: err instanceof Error ? err.message : (language === 'da'
            ? 'Der opstod en fejl'
            : 'An error occurred'),
        }
      );
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(connection.id);
        return next;
      });
    }
  }, [language, fetchConnections]);

  // ── Renew consent ──

  const handleRenewConsent = useCallback(async (connection: BankConnection) => {
    setRenewingConsentIds((prev) => new Set(prev).add(connection.id));
    try {
      const response = await fetch(`/api/bank-connections/${connection.id}/consent`, {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Consent renewal failed');
      }

      const result = await response.json();

      if (result.redirectUrl) {
        toast(language === 'da' ? 'Bankgodkendelse kræves' : 'Bank authorization required', {
          description: language === 'da'
            ? 'Du bliver viderestillet til din bank for at forny godkendelsen'
            : 'You will be redirected to your bank to renew authorization',
        });
      } else {
        toast.success(language === 'da' ? 'Godkendelse fornyet' : 'Consent renewed', {
          description: language === 'da'
            ? `${connection.bankName} godkendelse er fornyet`
            : `${connection.bankName} consent has been renewed`,
        });
      }

      await fetchConnections();
    } catch (err: any) {
      toast.error(language === 'da' ? 'Kunne ikke forny godkendelse' : 'Failed to renew consent', {
        description: err.message || (language === 'da'
          ? 'Der opstod en fejl ved fornyelse af bankgodkendelsen'
          : 'An error occurred while renewing bank consent'),
      });
    } finally {
      setRenewingConsentIds((prev) => {
        const next = new Set(prev);
        next.delete(connection.id);
        return next;
      });
    }
  }, [language, fetchConnections]);

  // ── AI Match ──

  const handleAiMatch = useCallback(async () => {
    setIsRunningAiMatch(true);
    setAiMatchResult(null);
    try {
      const response = await fetch('/api/bank-reconciliation?action=ai-match');

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'AI match failed');
      }

      const data = await response.json();
      const summary: AiMatchSummary = data.summary || {
        totalUnmatched: 0,
        autoMatched: 0,
        suggested: 0,
        remaining: 0,
      };

      setAiMatchResult(summary);

      const hasMatches = summary.autoMatched > 0 || summary.suggested > 0;

      toast.success(language === 'da' ? 'AI-match fuldført' : 'AI match completed', {
        description: hasMatches
          ? language === 'da'
            ? `${summary.autoMatched} auto-matchet, ${summary.suggested} forslag til gennemgang`
            : `${summary.autoMatched} auto-matched, ${summary.suggested} suggestions to review`
          : language === 'da'
            ? 'Ingen nye match fundet'
            : 'No new matches found',
      });

      await fetchConnections();
      onSyncComplete?.();
    } catch (err: any) {
      toast.error(language === 'da' ? 'AI-match fejlede' : 'AI match failed', {
        description: err.message || (language === 'da'
          ? 'Kunne ikke køre AI-match'
          : 'Could not run AI matching'),
      });
    } finally {
      setIsRunningAiMatch(false);
    }
  }, [language, fetchConnections, onSyncComplete]);

  // ── Bank selection helper ──

  /**
   * Map a bank name (from CompanyInfo) to a provider ID.
   * Tries exact match first, then case-insensitive substring match.
   */
  const detectProviderFromBankName = useCallback((bankName: string): string | null => {
    if (!bankName) return null;
    const normalized = bankName.toLowerCase().trim();

    // Direct provider ID matches
    for (const bank of availableBanks) {
      if (bank.id.toLowerCase() === normalized) return bank.id;
      if (bank.name.toLowerCase() === normalized) return bank.id;
    }

    // Substring / fuzzy matching for common Danish bank names
    const bankNameMap: Record<string, string> = {
      'nordea': 'nordea',
      'danske bank': 'danske_bank',
      'danske': 'danske_bank',
      'jyske bank': 'jyske_bank',
      'jyske': 'jyske_bank',
      'tink': 'tink',
      'demo': 'demo',
      'sydbank': 'demo',
      'spar nord': 'demo',
      'arbejdernes landsbank': 'demo',
      'nykredit': 'demo',
      'ringkøbing landbobank': 'demo',
      'savings bank': 'demo',
      'sparekasse': 'demo',
    };

    for (const [key, providerId] of Object.entries(bankNameMap)) {
      if (normalized.includes(key)) return providerId;
    }

    // Default to demo if we have a bank name but can't match
    return 'demo';
  }, [availableBanks]);

  const handleBankSelect = useCallback((providerId: string) => {
    setConnectProvider(providerId);
    const bank = availableBanks.find((b) => b.id === providerId);
    if (bank) {
      setConnectBankName(bank.name);
    }
  }, [availableBanks]);

  // ── Fetch company info and auto-fill connect form ──

  const [isFetchingCompanyInfo, setIsFetchingCompanyInfo] = useState(false);

  const fetchCompanyInfoAndAutoFill = useCallback(async () => {
    setIsFetchingCompanyInfo(true);
    try {
      const response = await fetch('/api/company');
      if (!response.ok) {
        console.error('Company API returned status:', response.status);
        setCompanyBankInfo(null);
        return;
      }
      const data = await response.json();
      const ci = data.companyInfo;
      if (!ci) {
        setCompanyBankInfo(null);
        return;
      }

      const info = {
        bankName: ci.bankName || '',
        bankRegistration: ci.bankRegistration || '',
        bankAccount: ci.bankAccount || '',
        bankIban: ci.bankIban || null,
        companyName: ci.companyName || '',
      };
      setCompanyBankInfo(info);

      // Check if there are any bank details to auto-fill
      const hasBankDetails = info.bankName || info.bankRegistration || info.bankAccount;
      if (!hasBankDetails) return; // No bank info to pre-fill

      // Auto-fill fields from company info
      const filled = new Set<string>();

      // Auto-detect provider from bank name
      if (info.bankName) {
        const providerId = detectProviderFromBankName(info.bankName);
        if (providerId) {
          setConnectProvider(providerId);
          const bank = availableBanks.find((b) => b.id === providerId);
          setConnectBankName(bank?.name || info.bankName);
          filled.add('provider');
        } else {
          setConnectBankName(info.bankName);
          filled.add('bankName');
        }
      }

      if (info.bankRegistration) {
        // Extract just the 4-digit reg number (bankAccount may contain "1234 1234567890")
        const regOnly = info.bankRegistration.replace(/\D/g, '').slice(0, 4);
        setConnectRegNumber(regOnly);
        if (regOnly) filled.add('regNumber');
      }

      if (info.bankAccount) {
        // bankAccount may contain "1234 1234567890" or just the account number
        // Try to extract account number after the registration number
        let accountNum = info.bankAccount.replace(/\s/g, '');
        // If it looks like "12341234567890" (reg + account concatenated), extract just account part
        if (accountNum.length > 4 && /^\d{4}\d+$/.test(accountNum)) {
          // If reg number matches the first 4 digits, take the rest as account number
          const regFromAccount = accountNum.slice(0, 4);
          if (info.bankRegistration && regFromAccount === info.bankRegistration.replace(/\D/g, '')) {
            accountNum = accountNum.slice(4);
          }
        }
        setConnectAccountNumber(accountNum);
        if (accountNum) filled.add('accountNumber');
      }

      if (info.bankIban) {
        setConnectIban(info.bankIban || '');
        filled.add('iban');
      }

      if (info.companyName) {
        setConnectAccountName(info.companyName);
        filled.add('accountName');
      }

      setAutofilledFields(filled);
    } catch (err) {
      console.error('Failed to fetch company info for auto-fill:', err);
      setCompanyBankInfo(null);
    } finally {
      setIsFetchingCompanyInfo(false);
    }
  }, [availableBanks, detectProviderFromBankName]);

  // ── Auto-fill when dialog opens ──
  // NOTE: Radix UI Dialog's onOpenChange is NOT called when open prop
  // changes programmatically. So we use a useEffect to trigger auto-fill.
  useEffect(() => {
    if (connectDialogOpen) {
      resetConnectForm();
      fetchCompanyInfoAndAutoFill();
    } else {
      resetConnectForm();
    }
  }, [connectDialogOpen]);

  // ──────────────── Loading skeleton ────────────────

  if (isLoading) {
    return (
      <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-5 w-8 rounded-full ml-2" />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-white/5">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-8 w-20 rounded-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  // ──────────────── Main render ────────────────

  return (
    <>
      <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5 overflow-hidden">
        <Collapsible open={!isCollapsed} onOpenChange={(open) => setIsCollapsed(!open)}>
          <CollapsibleTrigger asChild>
            <CardHeader className="pb-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5 rounded-t-lg transition-colors">
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#0d9488] to-[#5eead4] flex items-center justify-center">
                    <Zap className="h-5 w-5 text-white" />
                  </div>
                  <div className="text-left">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="text-base font-semibold text-gray-900 dark:text-white">
                        {language === 'da' ? 'Åben Bank' : 'Open Banking'}
                      </CardTitle>
                      {connections.length > 0 && (
                        <Badge variant="outline" className="text-xs font-normal">
                          {connections.length}{' '}
                          {language === 'da'
                            ? connections.length === 1 ? 'forbindelse' : 'forbindelser'
                            : connections.length === 1 ? 'connection' : 'connections'}
                        </Badge>
                      )}
                      {connectionsNeedingAttention.length > 0 && (
                        <Badge className="bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 border-amber-500/20 text-[10px] gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {connectionsNeedingAttention.length}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                      {language === 'da'
                        ? 'Automatisk synkronisering med din bank'
                        : 'Automatic synchronization with your bank'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isCollapsed ? (
                    <ChevronRight className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                  )}
                </div>
              </div>
            </CardHeader>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <CardContent className="pt-0 space-y-4">
              {/* ── Quick stats row ── */}
              {connections.length > 0 && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 rounded-xl bg-[#0d9488]/5 dark:bg-[#0d9488]/10 border border-[#0d9488]/10">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {language === 'da' ? 'Aktive' : 'Active'}
                      </p>
                      <p className="text-lg font-bold text-[#0d9488] dark:text-[#2dd4bf]">
                        {activeConnections.length}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/10">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {language === 'da' ? 'Samlet saldo' : 'Total balance'}
                      </p>
                      <p className="text-lg font-bold text-gray-900 dark:text-white">
                        {tc(totalBalance)}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/10">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {language === 'da' ? 'Uafstemte' : 'Unmatched'}
                      </p>
                      <p className="text-lg font-bold text-red-600 dark:text-red-400">
                        {totalUnmatched}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/10">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {language === 'da' ? 'Seneste sync' : 'Last sync'}
                      </p>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {activeConnections.length > 0
                          ? formatRelativeTime(
                              activeConnections.reduce((latest, c) =>
                                c.lastSyncAt && (!latest || c.lastSyncAt > latest)
                                  ? c.lastSyncAt
                                  : latest
                              , null as string | null),
                              language
                            )
                          : '—'}
                      </p>
                    </div>
                  </div>

                  <Separator />
                </>
              )}

              {/* ── Connection cards ── */}
              {connections.length === 0 ? (
                <div className="py-8 text-center">
                  <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-[#0d9488]/10 mb-3">
                    <Landmark className="h-7 w-7 text-[#0d9488] dark:text-[#2dd4bf]" />
                  </div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
                    {language === 'da'
                      ? 'Ingen bankforbindelser'
                      : 'No bank connections'}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto mb-4">
                    {language === 'da'
                      ? 'Tilknyt din bankkonto for automatisk import af posteringer og smart afstemning.'
                      : 'Connect your bank account for automatic transaction import and smart reconciliation.'}
                  </p>
                  <Button
                    onClick={openConnectDialog}
                    className="gap-2 bg-[#0d9488] hover:bg-[#0f766e] text-white font-medium"
                  >
                    <Plus className="h-4 w-4" />
                    {language === 'da' ? 'Tilknyt bankkonto' : 'Connect bank account'}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto pr-1 custom-scrollbar">
                  {connections.map((connection) => {
                    const statusConfig = getStatusConfig(connection.status, language);
                    const StatusIcon = statusConfig.icon;
                    const BankIcon = getBankIcon(connection.provider);
                    const isSyncing = syncingIds.has(connection.id);
                    const isRenewing = renewingConsentIds.has(connection.id);
                    const isToggling = togglingIds.has(connection.id);
                    const isRevokedOrExpired = connection.status === 'REVOKED' || connection.status === 'EXPIRED';

                    return (
                      <div
                        key={connection.id}
                        className={`flex items-center gap-3 p-3 sm:p-4 rounded-xl border transition-colors ${
                          isRevokedOrExpired
                            ? 'bg-red-50/50 dark:bg-red-500/5 border-red-200/50 dark:border-red-500/10'
                            : connection.status === 'INACTIVE'
                              ? 'bg-slate-50/50 dark:bg-slate-500/5 border-slate-200/50 dark:border-slate-500/10'
                              : connection.status === 'PENDING'
                                ? 'bg-amber-50/50 dark:bg-amber-500/5 border-amber-200/50 dark:border-amber-500/10'
                                : 'bg-gray-50 dark:bg-white/5 border-gray-100 dark:border-white/10 hover:border-[#0d9488]/30'
                        }`}
                      >
                        {/* Bank icon */}
                        <div className={`h-10 w-10 sm:h-11 sm:w-11 rounded-full flex items-center justify-center shrink-0 ${
                          connection.status === 'ACTIVE'
                            ? 'bg-[#0d9488]/10'
                            : 'bg-gray-100 dark:bg-white/10'
                        }`}>
                          <BankIcon className={`h-5 w-5 ${
                            connection.status === 'ACTIVE'
                              ? 'text-[#0d9488] dark:text-[#2dd4bf]'
                              : 'text-gray-400 dark:text-gray-500'
                          }`} />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                              {connection.accountName || connection.bankName}
                            </span>
                            <Badge className={`text-[10px] gap-1 ${statusConfig.bgClass}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${statusConfig.dotClass}`} />
                              {statusConfig.label}
                            </Badge>
                            {(connection as any).isDemo && (
                              <Badge variant="outline" className="text-[10px] border-[#0d9488]/30 text-[#0d9488]">
                                Demo
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                            <span className="font-mono">
                              {connection.registrationNumber
                                ? `${connection.registrationNumber} • `
                                : ''}
                              {maskAccountNumber(connection.accountNumber)}
                            </span>
                            <span className="hidden sm:inline">•</span>
                            <span className="hidden sm:inline flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatRelativeTime(connection.lastSyncAt, language)}
                            </span>
                          </div>
                          {connection.lastError && (
                            <p className="text-[11px] text-red-500 dark:text-red-400 mt-0.5 truncate">
                              {connection.lastError}
                            </p>
                          )}
                        </div>

                        {/* Balance & Actions */}
                        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                          {connection.currentBalance !== null && (
                            <div className="text-right hidden sm:block">
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {language === 'da' ? 'Saldo' : 'Balance'}
                              </p>
                              <p className={`text-sm font-semibold font-mono ${
                                connection.currentBalance >= 0
                                  ? 'text-gray-900 dark:text-white'
                                  : 'text-red-600 dark:text-red-400'
                              }`}>
                                {tc(connection.currentBalance)}
                              </p>
                            </div>
                          )}

                          {/* Sync button / Authorize button */}
                          {connection.status === 'PENDING' ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-amber-600 hover:text-amber-700 hover:bg-amber-500/10 gap-1"
                              onClick={() => {
                                setConsentInfo({
                                  connectionId: connection.id,
                                  consentId: connection.consentId || '',
                                  providerId: connection.provider,
                                  bankName: connection.bankName,
                                  redirectUrl: `/api/bank-connections/consent-callback?consent_id=${connection.consentId}&provider=${connection.provider}&connection_id=${connection.id}`,
                                  sandboxMode: true,
                                });
                                setConsentDialogOpen(true);
                              }}
                              title={language === 'da' ? 'Godkend bankforbindelse' : 'Authorize bank connection'}
                            >
                              <Shield className="h-4 w-4" />
                              <span className="text-xs hidden sm:inline">
                                {language === 'da' ? 'Godkend' : 'Authorize'}
                              </span>
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-[#0d9488] hover:text-[#0f766e] hover:bg-[#0d9488]/10"
                              onClick={() => handleSync(connection.id)}
                              disabled={isSyncing || connection.status === 'REVOKED' || connection.status === 'INACTIVE'}
                              title={language === 'da' ? 'Synkroniser nu' : 'Sync now'}
                            >
                              {isSyncing ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <RefreshCw className="h-4 w-4" />
                              )}
                            </Button>
                          )}

                          {/* Settings dropdown */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                              >
                                <Settings className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuItem
                                onClick={() => openEditDialog(connection)}
                              >
                                <Pencil className="h-4 w-4 mr-2" />
                                {language === 'da' ? 'Rediger oplysninger' : 'Edit details'}
                              </DropdownMenuItem>
                              {connection.status === 'ACTIVE' ? (
                                <DropdownMenuItem
                                  onClick={() => handleToggleActive(connection)}
                                  disabled={isToggling}
                                >
                                  {isToggling ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  ) : (
                                    <Power className="h-4 w-4 mr-2" />
                                  )}
                                  {language === 'da' ? 'Deaktiver' : 'Deactivate'}
                                </DropdownMenuItem>
                              ) : (connection.status === 'INACTIVE' || connection.status === 'REVOKED') ? (
                                <DropdownMenuItem
                                  onClick={() => handleToggleActive(connection)}
                                  disabled={isToggling}
                                >
                                  {isToggling ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  ) : (
                                    <Power className="h-4 w-4 mr-2" />
                                  )}
                                  {language === 'da' ? 'Reaktiver' : 'Reactivate'}
                                </DropdownMenuItem>
                              ) : null}
                              <DropdownMenuItem
                                onClick={() => handleRenewConsent(connection)}
                                disabled={isRenewing}
                              >
                                {isRenewing ? (
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                  <Shield className="h-4 w-4 mr-2" />
                                )}
                                {language === 'da' ? 'Forny godkendelse' : 'Renew consent'}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => {
                                  if (connection.status !== 'INACTIVE' && connection.status !== 'REVOKED') {
                                    toast.warning(
                                      language === 'da' ? 'Deaktivér først forbindelsen' : 'Deactivate the connection first',
                                      {
                                        description: language === 'da'
                                          ? 'En aktiv bankforbindelse kan ikke slettes permanent. Deaktivér den først, og slet den derefter.'
                                          : 'An active bank connection cannot be permanently deleted. Deactivate it first, then delete it.',
                                      }
                                    );
                                    return;
                                  }
                                  setConnectionToDelete(connection);
                                  setDeleteDialogOpen(true);
                                }}
                                className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                {language === 'da' ? 'Slet permanent' : 'Delete permanently'}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── Action bar ── */}
              {connections.length > 0 && (
                <>
                  <Separator />
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        onClick={openConnectDialog}
                        variant="outline"
                        size="sm"
                        className="gap-1.5 border-[#0d9488]/30 text-[#0d9488] hover:bg-[#0d9488]/10 hover:text-[#0f766e]"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {language === 'da' ? 'Tilknyt bankkonto' : 'Connect bank'}
                      </Button>
                      <Button
                        onClick={handleAiMatch}
                        size="sm"
                        className="gap-1.5 bg-[#0d9488] hover:bg-[#0f766e] text-white font-medium"
                        disabled={isRunningAiMatch || totalUnmatched === 0}
                      >
                        {isRunningAiMatch ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5" />
                        )}
                        {language === 'da' ? 'Kør AI-match' : 'Run AI match'}
                      </Button>
                    </div>

                    {/* AI match result notification */}
                    {aiMatchResult && (
                      <div className="flex items-center gap-2 text-xs sm:text-sm">
                        {aiMatchResult.autoMatched > 0 && (
                          <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {aiMatchResult.autoMatched} {language === 'da' ? 'auto-matchet' : 'auto-matched'}
                          </span>
                        )}
                        {aiMatchResult.suggested > 0 && (
                          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                            <Sparkles className="h-3.5 w-3.5" />
                            {aiMatchResult.suggested} {language === 'da' ? 'forslag' : 'suggestions'}
                          </span>
                        )}
                        {aiMatchResult.remaining > 0 && (
                          <span className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
                            {aiMatchResult.remaining} {language === 'da' ? 'tilbage' : 'remaining'}
                          </span>
                        )}
                        {aiMatchResult.autoMatched === 0 && aiMatchResult.suggested === 0 && (
                          <span className="text-gray-500 dark:text-gray-400">
                            {language === 'da' ? 'Ingen match fundet' : 'No matches found'}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* ── Connect Dialog ── */}
      <Dialog open={connectDialogOpen} onOpenChange={(open) => { if (!open) clearConnectDraft(); setConnectDialogOpen(open); }}>
        <DialogContent className="sm:max-w-md" {...connectGuard.dialogProps}>
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-[#0d9488]/10 flex items-center justify-center">
                  <Landmark className="h-4 w-4 text-[#0d9488]" />
                </div>
                {language === 'da' ? 'Tilknyt bankkonto' : 'Connect bank account'}
              </div>
              <ClearFormButton
                size="xs"
                label={language === 'da' ? 'Ryd formular' : 'Clear form'}
                isDirty={isConnectDirty}
                onClear={() => {
                  resetConnectForm();
                  clearConnectDraft();
                }}
              />
            </DialogTitle>
            <DialogDescription>
              {language === 'da'
                ? 'Forbind din bankkonto for automatisk import af posteringer.'
                : 'Connect your bank account for automatic transaction import.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Auto-fill notice */}
            {autofilledFields.size > 0 && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-[#0d9488]/5 border border-[#0d9488]/10">
                <ArrowDownToLine className="h-4 w-4 text-[#0d9488] mt-0.5 shrink-0" />
                <div className="text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed">
                  <span className="font-medium text-[#0d9488] dark:text-[#2dd4bf]">
                    {language === 'da' ? 'Auto-udfyldt fra virksomhedsoplysninger' : 'Auto-filled from company info'}
                  </span>
                  {' — '}
                  {language === 'da'
                    ? 'Felter er forudfyldt med dine bankoplysninger. Du kan tilpasse dem efter behov.'
                    : 'Fields are pre-filled with your bank details. You can adjust them as needed.'}
                </div>
              </div>
            )}

            {/* Loading company info */}
            {isFetchingCompanyInfo && connectDialogOpen && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/10">
                <Loader2 className="h-4 w-4 text-[#0d9488] animate-spin shrink-0" />
                <span className="text-[11px] text-gray-500 dark:text-gray-400">
                  {language === 'da' ? 'Indlæser virksomhedsoplysninger...' : 'Loading company info...'}
                </span>
              </div>
            )}

            {/* No company info notice — only show after fetch completes */}
            {!isFetchingCompanyInfo && !companyBankInfo && connectDialogOpen && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-500/5 border border-amber-200/50 dark:border-amber-500/10">
                <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                <div className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
                  <span className="font-medium">
                    {language === 'da' ? 'Ingen virksomhedsoplysninger fundet' : 'No company info found'}
                  </span>
                  {' — '}
                  {language === 'da'
                    ? 'Udfyld dine virksomhedsoplysninger først, så udfylder vi automatisk bankfelterne for dig.'
                    : 'Fill in your company info first, and we\'ll auto-fill the bank fields for you.'}
                </div>
              </div>
            )}

            {/* Company info exists but no bank details */}
            {companyBankInfo && !companyBankInfo.bankName && !companyBankInfo.bankRegistration && !companyBankInfo.bankAccount && connectDialogOpen && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-500/5 border border-amber-200/50 dark:border-amber-500/10">
                <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                <div className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
                  <span className="font-medium">
                    {language === 'da' ? 'Manglende bankoplysninger' : 'Missing bank details'}
                  </span>
                  {' — '}
                  {language === 'da'
                    ? 'Tilføj dine bankoplysninger under Virksomhedsoplysninger, så udfylder vi automatisk felterne her.'
                    : 'Add your bank details under Company Settings, and we\'ll auto-fill the fields here.'}
                </div>
              </div>
            )}

            {/* Bank selection */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {language === 'da' ? 'Bank' : 'Bank'} <span className="text-red-500">*</span>
                {autofilledFields.has('provider') && (
                  <span className="ml-1.5 text-[10px] font-normal text-[#0d9488] dark:text-[#2dd4bf]">
                    {language === 'da' ? '(auto-detected)' : '(auto-detected)'}
                  </span>
                )}
              </Label>
              <Select value={connectProvider} onValueChange={handleBankSelect}>
                <SelectTrigger className="bg-gray-50 dark:bg-white/5">
                  <SelectValue placeholder={language === 'da' ? 'Vælg bank...' : 'Select bank...'} />
                </SelectTrigger>
                <SelectContent>
                  {availableBanks.map((bank) => (
                    <SelectItem key={bank.id} value={bank.id}>
                      <div className="flex items-center gap-2">
                        <span>{bank.name}</span>
                        {'isDemo' in bank && bank.isDemo && (
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-[#0d9488]/30 text-[#0d9488]">
                            {language === 'da' ? 'Test' : 'Test'}
                          </Badge>
                        )}
                        {'isConfigured' in bank && !bank.isConfigured && !bank.isDemo && (
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-amber-400/30 text-amber-600">
                            Sandbox
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tink notice: accounts are selected after bank authentication */}
            {connectProvider === 'tink' && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20">
              <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
              <div className="text-[12px] text-blue-700 dark:text-blue-300 leading-relaxed">
                <p className="font-medium mb-0.5">{language === 'da' ? 'Tink Open Banking' : 'Tink Open Banking'}</p>
                <p>{language === 'da'
                  ? 'Du bliver sendt til Tink, hvor du logger ind med dit bank-ID. Efter godkendelse vælger du hvilken konto der skal synkroniseres med AlphaFlow.'
                  : 'You\'ll be redirected to Tink where you log in with your bank ID. After authorization, you\'ll select which account to sync with AlphaFlow.'}</p>
              </div>
            </div>
            )}

            {/* Registration number — hidden for Tink (provides accounts after OAuth) */}
            {connectProvider !== 'tink' && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {language === 'da' ? 'Registreringsnummer' : 'Registration number'}{' '}
                <span className="text-red-500">*</span>
                {autofilledFields.has('regNumber') && (
                  <span className="ml-1.5 text-[10px] font-normal text-[#0d9488] dark:text-[#2dd4bf]">
                    (auto)
                  </span>
                )}
              </Label>
              <Input
                value={connectRegNumber}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                  setConnectRegNumber(val);
                }}
                placeholder="1234"
                maxLength={4}
                className={`font-mono ${autofilledFields.has('regNumber') ? 'bg-[#0d9488]/5 dark:bg-[#0d9488]/10 border-[#0d9488]/20' : 'bg-gray-50 dark:bg-white/5'}`}
              />
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                {language === 'da' ? '4 cifre' : '4 digits'}
              </p>
            </div>
            )}

            {/* Account number — hidden for Tink */}
            {connectProvider !== 'tink' && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {language === 'da' ? 'Kontonummer' : 'Account number'}{' '}
                <span className="text-red-500">*</span>
                {autofilledFields.has('accountNumber') && (
                  <span className="ml-1.5 text-[10px] font-normal text-[#0d9488] dark:text-[#2dd4bf]">
                    (auto)
                  </span>
                )}
              </Label>
              <Input
                value={connectAccountNumber}
                onChange={(e) => setConnectAccountNumber(e.target.value)}
                placeholder={language === 'da' ? 'Indtast kontonummer' : 'Enter account number'}
                className={`font-mono ${autofilledFields.has('accountNumber') ? 'bg-[#0d9488]/5 dark:bg-[#0d9488]/10 border-[#0d9488]/20' : 'bg-gray-50 dark:bg-white/5'}`}
              />
            </div>
            )}

            {/* IBAN (optional) — hidden for Tink */}
            {connectProvider !== 'tink' && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                IBAN{' '}
                <span className="text-gray-400 font-normal">
                  ({language === 'da' ? 'valgfri' : 'optional'})
                </span>
                {autofilledFields.has('iban') && (
                  <span className="ml-1.5 text-[10px] font-normal text-[#0d9488] dark:text-[#2dd4bf]">
                    (auto)
                  </span>
                )}
              </Label>
              <Input
                value={connectIban}
                onChange={(e) => setConnectIban(e.target.value.toUpperCase())}
                placeholder="DK00 0000 0000 0000 00"
                className={`font-mono ${autofilledFields.has('iban') ? 'bg-[#0d9488]/5 dark:bg-[#0d9488]/10 border-[#0d9488]/20' : 'bg-gray-50 dark:bg-white/5'}`}
              />
            </div>
            )}

            {/* Account name (optional) — hidden for Tink */}
            {connectProvider !== 'tink' && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {language === 'da' ? 'Kontonavn' : 'Account name'}{' '}
                <span className="text-gray-400 font-normal">
                  ({language === 'da' ? 'valgfri' : 'optional'})
                </span>
                {autofilledFields.has('accountName') && (
                  <span className="ml-1.5 text-[10px] font-normal text-[#0d9488] dark:text-[#2dd4bf]">
                    (auto)
                  </span>
                )}
              </Label>
              <Input
                value={connectAccountName}
                onChange={(e) => setConnectAccountName(e.target.value)}
                placeholder={language === 'da' ? 'f.eks. Virksomhedskonto' : 'e.g. Business account'}
                className={autofilledFields.has('accountName') ? 'bg-[#0d9488]/5 dark:bg-[#0d9488]/10 border-[#0d9488]/20' : 'bg-gray-50 dark:bg-white/5'}
              />
            </div>
            )}

            {/* Sync frequency */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {language === 'da' ? 'Synkroniseringsfrekvens' : 'Sync frequency'}
              </Label>
              <Select value={connectSyncFrequency} onValueChange={setConnectSyncFrequency}>
                <SelectTrigger className="bg-gray-50 dark:bg-white/5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hourly">
                    {language === 'da' ? 'Hver time' : 'Hourly'}
                  </SelectItem>
                  <SelectItem value="daily">
                    {language === 'da' ? 'Dagligt' : 'Daily'}
                  </SelectItem>
                  <SelectItem value="manual">
                    {language === 'da' ? 'Kun manuelt' : 'Manual only'}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Security notice */}
            <div className="flex items-start gap-2 p-3 rounded-lg bg-[#0d9488]/5 border border-[#0d9488]/10">
              <Shield className="h-4 w-4 text-[#0d9488] mt-0.5 shrink-0" />
              <p className="text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed">
                {language === 'da'
                  ? 'Dine bankoplysninger er krypteret og sikret i henhold til PSD2/Open Banking-reglerne. Vi gemmer aldrig dine loginoplysninger.'
                  : 'Your banking credentials are encrypted and secured in accordance with PSD2/Open Banking regulations. We never store your login credentials.'}
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                clearConnectDraft();
                setConnectDialogOpen(false);
                resetConnectForm();
              }}
              disabled={isConnecting}
            >
              {language === 'da' ? 'Annuller' : 'Cancel'}
            </Button>
            <Button
              onClick={handleConnect}
              disabled={isConnecting || !connectProvider || (connectProvider !== 'tink' && !connectAccountNumber)}
              className="gap-2 bg-[#0d9488] hover:bg-[#0f766e] text-white font-medium"
            >
              {isConnecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wifi className="h-4 w-4" />
              )}
              {isConnecting
                ? (language === 'da' ? 'Forbinder...' : 'Connecting...')
                : (language === 'da' ? 'Tilknyt' : 'Connect')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Settings Dialog ── */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => { if (!open) clearEditDraft(); setEditDialogOpen(open); }}>
        <DialogContent className="sm:max-w-md" {...editBankGuard.dialogProps}>
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-[#0d9488]" />
                {language === 'da' ? 'Rediger bankforbindelse' : 'Edit bank connection'}
              </div>
              <ClearFormButton
                size="xs"
                label={language === 'da' ? 'Ryd formular' : 'Clear form'}
                isDirty={isEditBankDirty}
                onClear={() => {
                  // Revert to the values that were loaded when the edit dialog opened.
                  if (loadedEditBankRef.current) {
                    setEditBankName(loadedEditBankRef.current.bankName);
                    setEditRegNumber(loadedEditBankRef.current.regNumber);
                    setEditAccountNumber(loadedEditBankRef.current.accountNumber);
                    setEditIban(loadedEditBankRef.current.iban);
                    setEditAccountName(loadedEditBankRef.current.accountName);
                    setEditFrequency(loadedEditBankRef.current.freq);
                  }
                  clearEditDraft();
                }}
              />
            </DialogTitle>
            <DialogDescription>
              {connectionToEdit?.bankName} — {connectionToEdit ? maskAccountNumber(connectionToEdit.accountNumber) : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {language === 'da' ? 'Banknavn' : 'Bank name'}
              </Label>
              <Input
                value={editBankName}
                onChange={(e) => setEditBankName(e.target.value)}
                placeholder={language === 'da' ? 'Angiv banknavn' : 'Enter bank name'}
                className="bg-gray-50 dark:bg-white/5"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  {language === 'da' ? 'Registreringsnummer' : 'Registration number'}
                </Label>
                <Input
                  value={editRegNumber}
                  onChange={(e) => setEditRegNumber(e.target.value)}
                  placeholder="1234"
                  inputMode="numeric"
                  maxLength={4}
                  className="bg-gray-50 dark:bg-white/5"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  {language === 'da' ? 'Kontonummer' : 'Account number'}
                </Label>
                <Input
                  value={editAccountNumber}
                  onChange={(e) => setEditAccountNumber(e.target.value)}
                  placeholder={language === 'da' ? 'Angiv kontonummer' : 'Enter account number'}
                  className="bg-gray-50 dark:bg-white/5"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {language === 'da' ? 'IBAN' : 'IBAN'}
              </Label>
              <Input
                value={editIban}
                onChange={(e) => setEditIban(e.target.value.toUpperCase())}
                placeholder="DK00 0000 0000 0000 00"
                className="bg-gray-50 dark:bg-white/5"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {language === 'da' ? 'Kontonavn (visning)' : 'Account name (display)'}
              </Label>
              <Input
                value={editAccountName}
                onChange={(e) => setEditAccountName(e.target.value)}
                placeholder={language === 'da' ? 'Angiv kontonavn' : 'Enter account name'}
                className="bg-gray-50 dark:bg-white/5"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {language === 'da' ? 'Synkroniseringsfrekvens' : 'Sync frequency'}
              </Label>
              <Select value={editFrequency} onValueChange={setEditFrequency}>
                <SelectTrigger className="bg-gray-50 dark:bg-white/5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hourly">
                    {language === 'da' ? 'Hver time' : 'Hourly'}
                  </SelectItem>
                  <SelectItem value="daily">
                    {language === 'da' ? 'Dagligt' : 'Daily'}
                  </SelectItem>
                  <SelectItem value="manual">
                    {language === 'da' ? 'Kun manuelt' : 'Manual only'}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { clearEditDraft(); setEditDialogOpen(false); }} disabled={isEditing}>
              {language === 'da' ? 'Annuller' : 'Cancel'}
            </Button>
            <Button
              onClick={handleEdit}
              disabled={isEditing}
              className="gap-2 bg-[#0d9488] hover:bg-[#0f766e] text-white font-medium"
            >
              {isEditing && <Loader2 className="h-4 w-4 animate-spin" />}
              {language === 'da' ? 'Gem' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ── */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-red-500/10 flex items-center justify-center">
                <Trash2 className="h-4 w-4 text-red-500" />
              </div>
              {language === 'da' ? 'Slet bankforbindelse permanent' : 'Delete bank connection permanently'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {connectionToDelete && (
                <div className="space-y-2">
                  <p>
                    {language === 'da'
                      ? `Er du sikker på, at du vil slette forbindelsen til ${connectionToDelete.bankName} (${maskAccountNumber(connectionToDelete.accountNumber)}) permanent?`
                      : `Are you sure you want to permanently delete the connection to ${connectionToDelete.bankName} (${maskAccountNumber(connectionToDelete.accountNumber)})?`}
                  </p>
                  <div className="flex items-start gap-2 rounded-md bg-green-500/10 border border-green-500/20 p-2.5 text-green-700 dark:text-green-400">
                    <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                    <p className="text-xs">
                      {language === 'da'
                        ? 'Allerede synkroniserede posteringer og kontoudtog bevares fuldstændigt — kun selve bankforbindelsen og synk-loggen fjernes.'
                        : 'Already synchronized transactions and bank statements are fully preserved — only the bank connection itself and sync logs are removed.'}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {language === 'da'
                      ? 'Denne handling kan ikke fortrydes.'
                      : 'This action cannot be undone.'}
                  </p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {language === 'da' ? 'Annuller' : 'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white gap-2"
            >
              {isDeleting && <Loader2 className="h-4 w-4 animate-spin" />}
              {language === 'da' ? 'Slet permanent' : 'Delete permanently'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Consent Authorization Dialog ── */}
      <Dialog open={consentDialogOpen} onOpenChange={setConsentDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-amber-500/10 flex items-center justify-center">
                <Shield className="h-4 w-4 text-amber-500" />
              </div>
              {language === 'da' ? 'Bankgodkendelse påkrævet' : 'Bank Authorization Required'}
            </DialogTitle>
            <DialogDescription>
              {language === 'da'
                ? 'Din bank kræver godkendelse før forbindelsen kan aktiveres.'
                : 'Your bank requires authorization before the connection can be activated.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Bank info */}
            {consentInfo && (
              <div className="rounded-xl bg-gray-50 dark:bg-white/5 p-4 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#0d9488] to-[#5eead4] flex items-center justify-center">
                    <Landmark className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {consentInfo.bankName}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {language === 'da' ? 'Afventer godkendelse' : 'Pending authorization'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Sandbox mode notice */}
            {consentInfo?.sandboxMode && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-500/5 border border-amber-200/50 dark:border-amber-500/10">
                <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                <div className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
                  <span className="font-medium">
                    {language === 'da' ? 'Sandbox-tilstand' : 'Sandbox Mode'}
                  </span>
                  {' — '}
                  {language === 'da'
                    ? 'Denne bank har ikke konfigureret API-nøgler. Godkendelse simuleres til testformål. I produktion vil du blive omdirigeret til bankens sikre godkendelsesside.'
                    : 'This bank does not have API keys configured. Authorization is simulated for testing. In production, you would be redirected to the bank\'s secure authorization page.'}
                </div>
              </div>
            )}

            {/* Explanation — Tink-specific vs generic */}
            {consentInfo?.providerProvidesAccounts ? (
              <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
                <Info className="h-4 w-4 shrink-0 mt-0.5 text-[#0d9488]" />
                <p className="leading-relaxed">
                  {language === 'da'
                    ? 'Du vil blive sendt til Tink, hvor du logger ind med dit bank-ID (MitID/NemID). Efter godkendelse vælger du hvilken konto der skal synkroniseres med AlphaFlow.'
                    : 'You\'ll be redirected to Tink where you log in with your bank ID. After authorization, you\'ll select which account to sync with AlphaFlow.'}
                </p>
              </div>
            ) : (
              <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
                <Info className="h-4 w-4 shrink-0 mt-0.5 text-[#0d9488]" />
                <p className="leading-relaxed">
                  {language === 'da'
                    ? 'For at oprette forbindelse til din bank, skal du godkende adgang via bankens sikre godkendelsesside (SCA — Strong Customer Authentication). Dette er et krav fra PSD2/EU-lovgivningen for at beskytte dine data.'
                    : 'To connect to your bank, you must authorize access through the bank\'s secure authorization page (SCA — Strong Customer Authentication). This is required by PSD2/EU legislation to protect your data.'}
                </p>
              </div>
            )}

            {/* Consent ID for reference */}
            {consentInfo && (
              <div className="text-[10px] text-gray-400 dark:text-gray-500 font-mono">
                Consent ID: {consentInfo.consentId}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setConsentDialogOpen(false);
                setConsentInfo(null);
              }}
              disabled={isAuthorizing}
            >
              {language === 'da' ? 'Senere' : 'Later'}
            </Button>
            <Button
              onClick={handleConsentAuthorize}
              disabled={isAuthorizing}
              className="gap-2 bg-[#0d9488] hover:bg-[#0f766e] text-white font-medium"
            >
              {isAuthorizing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {language === 'da' ? 'Godkender...' : 'Authorizing...'}
                </>
              ) : (
                <>
                  <Shield className="h-4 w-4" />
                  {consentInfo?.sandboxMode
                    ? (language === 'da' ? 'Godkend (Sandbox)' : 'Authorize (Sandbox)')
                    : consentInfo?.providerProvidesAccounts
                      ? (language === 'da' ? 'Åbn Tink & vælg konto' : 'Open Tink & select account')
                      : (language === 'da' ? 'Godkend hos bank' : 'Authorize at Bank')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export type { OpenBankingSectionProps, BankConnection, BankConnectionSync, AiMatchSummary };
