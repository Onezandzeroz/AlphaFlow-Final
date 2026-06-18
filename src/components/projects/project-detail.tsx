'use client';

import { useState, useEffect, useCallback, useMemo, useRef, type CSSProperties } from 'react';
import { User } from '@/lib/auth-store';
import { useTranslation } from '@/lib/use-translation';
import { useDataVersion } from '@/hooks/use-data-version';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAccessErrorHandler } from '@/hooks/use-access-error-handler';
import { useWriteAccessGuard } from '@/hooks/use-write-access-guard';
import { useDraftSync } from '@/hooks/use-draft-sync';
import { useWarnOnUnsaved } from '@/hooks/use-warn-unsaved';
import { readDraft } from '@/lib/draft-store';
import { ClearFormButton } from '@/components/ui/clear-form-button';
import { ProjectBudgetTab } from './project-budget-tab';
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Loader2,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Calendar,
  Building2,
  FileText,
  Receipt,
  DollarSign,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────

interface ProjectDetail {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  color: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  budgetTotal: number;
  customerId: string | null;
  companyId: string;
  createdAt: string;
  updatedAt: string;
  customer?: { id: string; name: string } | null;
  invoiceCount: number;
  invoices?: ProjectInvoice[];
  transactions?: ProjectTransaction[];
}

interface ProjectInvoice {
  id: string;
  invoiceNumber: string | null;
  issueDate: string | null;
  dueDate: string | null;
  status: string;
  totalAmount: number;
  currency: string | null;
  customerName: string | null;
}

interface ProjectTransaction {
  id: string;
  date: string;
  description: string;
  reference: string | null;
  voucherNumber: string | null;
  accountNumber: string;
  accountName: string;
  accountType: string;
  lineDescription: string | null;
  debit: number;
  credit: number;
}

interface KPIs {
  totalRevenue: number;
  totalExpenses: number;
  projectResult: number;
  budgetUsage: number;
}

interface ProjectFormData {
  name: string;
  code: string;
  description: string;
  color: string;
  status: string;
  startDate: string;
  endDate: string;
  budgetTotal: string;
  customerId: string;
}

interface ContactOption {
  id: string;
  name: string;
}

interface ReportAccountGroup {
  name: string;
  type: string;
  accounts: Array<{ id: string; number: string; name: string; amount: number }>;
  total: number;
}

interface ReportData {
  accountGroups: ReportAccountGroup[];
  totalRevenue: number;
  totalExpenses: number;
  projectResult: number;
}

interface ProjectDetailProps {
  projectId: string;
  user: User;
  onBack: () => void;
}

// ─── Constants ───────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
  ON_HOLD: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  COMPLETED: 'bg-slate-100 text-slate-700 dark:bg-slate-800/40 dark:text-slate-400',
  CANCELLED: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400',
};

const PRESET_COLORS = ['#0d9488', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899'];

const EMPTY_FORM: ProjectFormData = {
  name: '',
  code: '',
  description: '',
  color: '#0d9488',
  status: 'ACTIVE',
  startDate: '',
  endDate: '',
  budgetTotal: '',
  customerId: '',
};

// ─── Component ───────────────────────────────────────────────────────

export function ProjectDetail({ projectId, user, onBack }: ProjectDetailProps) {
  const { t, tc, td, language } = useTranslation();
  const isDa = language === 'da';
  const { handleMutationError } = useAccessErrorHandler();
  const { guardWriteAccess } = useWriteAccessGuard(user);

  // Data state
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Report state
  const [report, setReport] = useState<ReportData | null>(null);
  const [isLoadingReport, setIsLoadingReport] = useState(false);

  // Dialog state
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<ProjectFormData>(EMPTY_FORM);

  // Delete state
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Contacts for form
  const [contacts, setContacts] = useState<ContactOption[]>([]);

  // ── Draft persistence (edit project form) ──
  const editDraftKey = `project:edit:${projectId}`;
  const { clearDraft: clearEditDraft } = useDraftSync(
    editDraftKey,
    { ...formData },
    {
      label: isDa ? 'Rediger projekt' : 'Edit project',
      disabled: !isEditOpen,
    }
  );

  // ── Dirty tracking + safety-net guard ──
  const loadedEditStateRef = useRef<ProjectFormData | null>(null);
  const isEditDirty = isEditOpen && loadedEditStateRef.current !== null && (
    formData.name !== loadedEditStateRef.current.name ||
    formData.code !== loadedEditStateRef.current.code ||
    formData.description !== loadedEditStateRef.current.description ||
    formData.color !== loadedEditStateRef.current.color ||
    formData.status !== loadedEditStateRef.current.status ||
    formData.startDate !== loadedEditStateRef.current.startDate ||
    formData.endDate !== loadedEditStateRef.current.endDate ||
    formData.budgetTotal !== loadedEditStateRef.current.budgetTotal ||
    formData.customerId !== loadedEditStateRef.current.customerId
  );
  const editGuard = useWarnOnUnsaved(isEditDirty, {
    onConfirmDiscard: () => { clearEditDraft(); setIsEditOpen(false); },
    window: false,
  });

  // ── Fetch project detail ──
  const fetchProject = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) throw new Error(isDa ? 'Kunne ikke hente projekt' : 'Failed to fetch project');
      const data = await res.json();
      setProject(data.project);
      setKpis(data.kpis);
    } catch (err) {
      console.error('Failed to fetch project:', err);
      toast.error(isDa ? 'Kunne ikke hente projekt' : 'Failed to fetch project');
    } finally {
      setIsLoading(false);
    }
  }, [projectId, isDa]);

  // ── Fetch report ──
  const fetchReport = useCallback(async () => {
    setIsLoadingReport(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/report`);
      if (!res.ok) throw new Error(isDa ? 'Kunne ikke hente rapport' : 'Failed to fetch report');
      const data = await res.json();
      setReport(data.report);
    } catch (err) {
      console.error('Failed to fetch report:', err);
    } finally {
      setIsLoadingReport(false);
    }
  }, [projectId, isDa]);

  // ── Fetch contacts ──
  const fetchContacts = useCallback(async () => {
    try {
      const res = await fetch('/api/contacts?type=CUSTOMER');
      if (!res.ok) throw new Error('Failed to fetch contacts');
      const data = await res.json();
      setContacts(
        (data.contacts || []).map((c: { id: string; name: string }) => ({
          id: c.id,
          name: c.name,
        }))
      );
    } catch (err) {
      console.error('Failed to fetch contacts:', err);
    }
  }, []);

  // Re-fetch the project when the server signals a 'projects' data-changed
  // event (e.g. when the budget was saved in the budget tab — the project's
  // budgetTotal/budgetUsage are recomputed by /api/projects and we need to
  // refresh the detail view's header + stats).
  const projectsVersion = useDataVersion('projects');

  useEffect(() => {
    fetchProject();
    fetchReport();
  }, [fetchProject, fetchReport, projectsVersion]);

  // ── Open edit dialog ──
  const openEdit = () => {
    guardWriteAccess(isDa ? 'Rediger projekt' : 'Edit project', () => {
      if (!project) return;
      const serverForm: ProjectFormData = {
        name: project.name,
        code: project.code || '',
        description: project.description || '',
        color: project.color || '#0d9488',
        status: project.status,
        startDate: project.startDate ? project.startDate.split('T')[0] : '',
        endDate: project.endDate ? project.endDate.split('T')[0] : '',
        budgetTotal: project.budgetTotal ? String(project.budgetTotal) : '',
        customerId: project.customerId || '',
      };
      // Merge any existing draft over server data (user edits win).
      const draft = readDraft(`project:edit:${projectId}`);
      let initial = serverForm;
      if (draft?.data) {
        const d = draft.data as Partial<ProjectFormData>;
        initial = {
          name: typeof d.name === 'string' ? d.name : serverForm.name,
          code: typeof d.code === 'string' ? d.code : serverForm.code,
          description: typeof d.description === 'string' ? d.description : serverForm.description,
          color: typeof d.color === 'string' ? d.color : serverForm.color,
          status: typeof d.status === 'string' ? d.status : serverForm.status,
          startDate: typeof d.startDate === 'string' ? d.startDate : serverForm.startDate,
          endDate: typeof d.endDate === 'string' ? d.endDate : serverForm.endDate,
          budgetTotal: typeof d.budgetTotal === 'string' ? d.budgetTotal : serverForm.budgetTotal,
          customerId: typeof d.customerId === 'string' ? d.customerId : serverForm.customerId,
        };
      }
      setFormData(initial);
      loadedEditStateRef.current = initial;
      fetchContacts();
      setIsEditOpen(true);
    });
  };

  // ── Save edit ──
  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error(isDa ? 'Navn er påkrævet' : 'Name is required');
      return;
    }

    setIsSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: formData.name.trim(),
        code: formData.code.trim() || null,
        description: formData.description.trim() || null,
        color: formData.color,
        status: formData.status,
        startDate: formData.startDate || null,
        endDate: formData.endDate || null,
        budgetTotal: formData.budgetTotal ? Number(formData.budgetTotal) : null,
        customerId: formData.customerId || null,
      };

      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const isAccess = await handleMutationError(res, isDa ? 'Rediger projekt' : 'Edit project');
        if (isAccess) { setIsSaving(false); return; }
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || (isDa ? 'Kunne ikke gemme' : 'Failed to save'));
      }

      setIsEditOpen(false);
      clearEditDraft();
      loadedEditStateRef.current = null;
      toast.success(isDa ? 'Projekt opdateret' : 'Project updated');
      fetchProject();
    } catch (err) {
      console.error('Save project error:', err);
      if (err instanceof Error && err.message === '__access_denied__') return;
      toast.error(err instanceof Error ? err.message : (isDa ? 'Ukendt fejl' : 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  // ── Delete (soft delete = cancel) ──
  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' });
      if (!res.ok) {
        const isAccess = await handleMutationError(res, isDa ? 'Slet projekt' : 'Delete project');
        if (isAccess) { setIsDeleting(false); return; }
        throw new Error(isDa ? 'Kunne ikke annullere projekt' : 'Failed to cancel project');
      }
      setIsDeleteOpen(false);
      toast.success(isDa ? 'Projekt annulleret' : 'Project cancelled');
      onBack();
    } catch (err) {
      console.error('Delete project error:', err);
      toast.error(err instanceof Error ? err.message : (isDa ? 'Ukendt fejl' : 'Unknown error'));
    } finally {
      setIsDeleting(false);
    }
  };

  // ── Status label helper ──
  function getStatusLabel(status: string): string {
    const labels: Record<string, { da: string; en: string }> = {
      ACTIVE: { da: 'Aktiv', en: 'Active' },
      ON_HOLD: { da: 'På pause', en: 'On Hold' },
      COMPLETED: { da: 'Afsluttet', en: 'Completed' },
      CANCELLED: { da: 'Annulleret', en: 'Cancelled' },
    };
    return labels[status]?.[language] || status;
  }

  // Translates a raw AccountGroup enum value (e.g. SALES_REVENUE) or
  // AccountType (e.g. REVENUE) to a human-readable label. The project
  // report backend returns account.group as the raw enum string.
  function getAccountGroupLabel(group: string): string {
    const labels: Record<string, { da: string; en: string }> = {
      // AccountType
      ASSET: { da: 'Aktiver', en: 'Assets' },
      LIABILITY: { da: 'Passiver', en: 'Liabilities' },
      EQUITY: { da: 'Egenkapital', en: 'Equity' },
      REVENUE: { da: 'Indtægter', en: 'Revenue' },
      EXPENSE: { da: 'Omkostninger', en: 'Expenses' },
      // AccountGroup — revenue
      SALES_REVENUE: { da: 'Salgsindtægter', en: 'Sales Revenue' },
      OTHER_REVENUE: { da: 'Andre indtægter', en: 'Other Revenue' },
      OUTPUT_VAT: { da: 'Udgående moms', en: 'Output VAT' },
      FINANCIAL_INCOME: { da: 'Finansielle indtægter', en: 'Financial Income' },
      // AccountGroup — expenses
      COST_OF_GOODS: { da: 'Vareforbrug', en: 'Cost of Goods' },
      PERSONNEL: { da: 'Personaleomkostninger', en: 'Personnel' },
      OTHER_OPERATING: { da: 'Andre driftsomkostninger', en: 'Other Operating' },
      FINANCIAL_EXPENSE: { da: 'Finansielle omkostninger', en: 'Financial Expense' },
      INPUT_VAT: { da: 'Indgående moms', en: 'Input VAT' },
      TAX: { da: 'Skat', en: 'Tax' },
    };
    return labels[group]?.[language] || group;
  }

  // ─── Loading state ──
  if (isLoading) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="rounded-2xl">
              <CardContent className="p-4">
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-6 w-28" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="rounded-2xl">
          <CardContent className="p-6">
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-4 md:p-6 text-center">
        <p className="text-gray-500 dark:text-gray-400">
          {isDa ? 'Projekt ikke fundet' : 'Project not found'}
        </p>
        <Button variant="outline" onClick={onBack} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t('backToProjects')}
        </Button>
      </div>
    );
  }

  // ─── Main render ──
  const budgetTotal = project.budgetTotal || 0;
  const budgetUsage = kpis?.budgetUsage || 0;

  return (
    <div className="space-y-4 md:space-y-6 p-3 lg:p-6">
      {/* Back button + Header */}
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="gap-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white -ml-2"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('backToProjects')}
        </Button>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className="h-10 w-10 rounded-xl shrink-0 flex items-center justify-center mt-0.5"
              style={{ backgroundColor: project.color || '#0d9488' }}
            >
              <span className="text-white font-bold text-sm">
                {project.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-semibold text-gray-900 dark:text-white truncate">
                  {project.name}
                </h1>
                {project.code && (
                  <span className="text-xs font-mono text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-white/[0.06] px-2 py-0.5 rounded-md">
                    {project.code}
                  </span>
                )}
                <Badge
                  variant="secondary"
                  className={cn('text-[10px] px-2 py-0.5 font-medium border-0', STATUS_STYLES[project.status] || '')}
                >
                  {getStatusLabel(project.status)}
                </Badge>
              </div>
              {project.description && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                  {project.description}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={openEdit} className="gap-1.5">
              <Pencil className="h-3.5 w-3.5" />
              {t('projectEdit')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => guardWriteAccess(isDa ? 'Slet projekt' : 'Delete project', () => setIsDeleteOpen(true))}
              className="gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t('projectDelete')}
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview" className="gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />
            {t('projectOverview')}
          </TabsTrigger>
          <TabsTrigger value="transactions" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            {t('projectTransactions')}
          </TabsTrigger>
          <TabsTrigger value="budget" className="gap-1.5">
            <DollarSign className="h-3.5 w-3.5" />
            {t('projectBudgetTab')}
          </TabsTrigger>
          <TabsTrigger value="invoices" className="gap-1.5">
            <Receipt className="h-3.5 w-3.5" />
            {t('projectInvoices')}
          </TabsTrigger>
        </TabsList>

        {/* ── Overview Tab ── */}
        <TabsContent value="overview" className="space-y-4">
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="rounded-2xl">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t('revenue')}</p>
                    <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                      {tc(kpis?.totalRevenue || 0)}
                    </p>
                  </div>
                  <div className="h-9 w-9 rounded-full bg-emerald-100 dark:bg-emerald-950/30 flex items-center justify-center">
                    <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t('expenses')}</p>
                    <p className="text-lg font-bold text-red-600 dark:text-red-400 mt-0.5">
                      {tc(kpis?.totalExpenses || 0)}
                    </p>
                  </div>
                  <div className="h-9 w-9 rounded-full bg-red-100 dark:bg-red-950/30 flex items-center justify-center">
                    <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t('result')}</p>
                    <p className={cn(
                      'text-lg font-bold mt-0.5',
                      (kpis?.projectResult || 0) >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-600 dark:text-red-400'
                    )}>
                      {tc(kpis?.projectResult || 0)}
                    </p>
                  </div>
                  <div className={cn(
                    'h-9 w-9 rounded-full flex items-center justify-center',
                    (kpis?.projectResult || 0) >= 0
                      ? 'bg-emerald-100 dark:bg-emerald-950/30'
                      : 'bg-red-100 dark:bg-red-950/30'
                  )}>
                    <BarChart3 className={cn(
                      'h-4 w-4',
                      (kpis?.projectResult || 0) >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-600 dark:text-red-400'
                    )} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t('budgetUsage')}</p>
                    <p className={cn(
                      'text-lg font-bold mt-0.5',
                      budgetUsage <= 80
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : budgetUsage <= 100
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-red-600 dark:text-red-400'
                    )}>
                      {Math.round(budgetUsage)}%
                    </p>
                  </div>
                  <div className={cn(
                    'h-9 w-9 rounded-full flex items-center justify-center',
                    budgetUsage <= 80
                      ? 'bg-emerald-100 dark:bg-emerald-950/30'
                      : budgetUsage <= 100
                        ? 'bg-amber-100 dark:bg-amber-950/30'
                        : 'bg-red-100 dark:bg-red-950/30'
                  )}>
                    <DollarSign className={cn(
                      'h-4 w-4',
                      budgetUsage <= 80
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : budgetUsage <= 100
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-red-600 dark:text-red-400'
                    )} />
                  </div>
                </div>
                {budgetTotal > 0 && (
                  <div className="mt-2 h-1.5 rounded-full bg-gray-100 dark:bg-white/[0.06] overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        budgetUsage <= 80 ? 'bg-emerald-500' : budgetUsage <= 100 ? 'bg-amber-500' : 'bg-red-500'
                      )}
                      style={{ width: `${Math.min(budgetUsage, 100)}%` }}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Project info */}
          <Card className="rounded-2xl">
            <CardContent className="p-4 sm:p-6">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                {isDa ? 'Projektinformation' : 'Project Information'}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                {project.startDate && (
                  <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                    <Calendar className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                    <span>{t('projectStartDate')}: {td(project.startDate)}</span>
                  </div>
                )}
                {project.endDate && (
                  <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                    <Calendar className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                    <span>{t('projectEndDate')}: {td(project.endDate)}</span>
                  </div>
                )}
                {project.customer && (
                  <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                    <Building2 className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                    <span>{t('projectCustomer')}: {project.customer.name}</span>
                  </div>
                )}
                {budgetTotal > 0 && (
                  <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                    <DollarSign className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                    <span>{t('projectBudget')}: {tc(budgetTotal)}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Mini P&L */}
          {report && report.accountGroups.length > 0 && (
            <Card className="rounded-2xl">
              <CardContent className="p-4 sm:p-6">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                  {isDa ? 'Driftsregnskab' : 'Profit & Loss'}
                </h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">{isDa ? 'Konto' : 'Account'}</TableHead>
                      <TableHead className="text-right text-xs">{isDa ? 'Beløb' : 'Amount'}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.accountGroups.map((group) => (
                      <>
                        <TableRow key={group.name} className={cn(
                          'font-medium',
                          group.type === 'REVENUE'
                            ? 'bg-emerald-50/50 dark:bg-emerald-950/10'
                            : 'bg-red-50/50 dark:bg-red-950/10'
                        )}>
                          <TableCell className="text-xs font-semibold">
                            {getAccountGroupLabel(group.name)}
                          </TableCell>
                          <TableCell className={cn(
                            'text-right text-xs font-semibold',
                            group.type === 'REVENUE'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-red-600 dark:text-red-400'
                          )}>
                            {tc(group.total)}
                          </TableCell>
                        </TableRow>
                        {group.accounts.map((account) => (
                          <TableRow key={account.id}>
                            <TableCell className="text-xs text-gray-500 dark:text-gray-400 pl-6">
                              {account.number} {account.name}
                            </TableCell>
                            <TableCell className="text-right text-xs text-gray-600 dark:text-gray-400">
                              {tc(account.amount)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </>
                    ))}
                    {/* Result row */}
                    <TableRow className="border-t-2 border-gray-200 dark:border-gray-700 font-bold">
                      <TableCell className="text-xs">
                        {t('result')}
                      </TableCell>
                      <TableCell className={cn(
                        'text-right text-xs',
                        report.projectResult >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      )}>
                        {tc(report.projectResult)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Transactions Tab ── */}
        <TabsContent value="transactions" className="space-y-4">
          <Card className="rounded-2xl">
            <CardContent className="p-4 sm:p-6">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
                {t('projectTransactions')}
              </h3>
              {(project.transactions?.length ?? 0) > 0 ? (
                <div className="overflow-x-auto -mx-4 sm:mx-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-xs">{isDa ? 'Dato' : 'Date'}</TableHead>
                        <TableHead className="text-xs">{isDa ? 'Bilag' : 'Voucher'}</TableHead>
                        <TableHead className="text-xs">{isDa ? 'Beskrivelse' : 'Description'}</TableHead>
                        <TableHead className="text-xs">{isDa ? 'Konto' : 'Account'}</TableHead>
                        <TableHead className="text-xs text-right">{isDa ? 'Debet' : 'Debit'}</TableHead>
                        <TableHead className="text-xs text-right">{isDa ? 'Kredit' : 'Credit'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {project.transactions!.map((tx) => {
                        const dateStr = tx.date ? new Date(tx.date).toLocaleDateString(isDa ? 'da-DK' : 'en-GB') : '—';
                        return (
                          <TableRow key={tx.id} className="text-xs">
                            <TableCell className="whitespace-nowrap text-gray-600 dark:text-gray-300">{dateStr}</TableCell>
                            <TableCell className="whitespace-nowrap font-mono text-gray-500 dark:text-gray-400">{tx.voucherNumber || '—'}</TableCell>
                            <TableCell className="max-w-[240px]">
                              <div className="truncate text-gray-900 dark:text-white" title={tx.description}>
                                {tx.description || '—'}
                              </div>
                              {tx.lineDescription && (
                                <div className="truncate text-[10px] text-gray-400" title={tx.lineDescription}>
                                  {tx.lineDescription}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              <span className="font-mono text-gray-500 dark:text-gray-400">{tx.accountNumber}</span>{' '}
                              <span className="text-gray-600 dark:text-gray-300">{tx.accountName}</span>
                            </TableCell>
                            <TableCell className="text-right whitespace-nowrap font-mono text-gray-900 dark:text-white">
                              {tx.debit !== 0 ? tc(tx.debit) : '—'}
                            </TableCell>
                            <TableCell className="text-right whitespace-nowrap font-mono text-gray-900 dark:text-white">
                              {tx.credit !== 0 ? tc(tx.credit) : '—'}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400 dark:text-gray-500">
                  <FileText className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">
                    {isDa
                      ? 'Ingen transaktioner knyttet til dette projekt endnu. Bogfør en postering med dette projekt valgt for at se den her.'
                      : 'No transactions linked to this project yet. Post a journal entry with this project selected to see it here.'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Budget Tab ── */}
        <TabsContent value="budget" className="space-y-4">
          <ProjectBudgetTab
            projectId={projectId}
            companyId={project.companyId}
            user={user}
          />
        </TabsContent>

        {/* ── Invoices Tab ── */}
        <TabsContent value="invoices" className="space-y-4">
          <Card className="rounded-2xl">
            <CardContent className="p-4 sm:p-6">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
                {t('projectInvoices')}
              </h3>
              {(project.invoices?.length ?? 0) > 0 ? (
                <div className="overflow-x-auto -mx-4 sm:mx-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-xs">{isDa ? 'Faktura nr.' : 'Invoice no.'}</TableHead>
                        <TableHead className="text-xs">{isDa ? 'Kunde' : 'Customer'}</TableHead>
                        <TableHead className="text-xs">{isDa ? 'Udstedt' : 'Issued'}</TableHead>
                        <TableHead className="text-xs">{isDa ? 'Forfald' : 'Due'}</TableHead>
                        <TableHead className="text-xs">{isDa ? 'Status' : 'Status'}</TableHead>
                        <TableHead className="text-xs text-right">{isDa ? 'Beløb' : 'Amount'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {project.invoices!.map((inv) => {
                        const issueStr = inv.issueDate ? new Date(inv.issueDate).toLocaleDateString(isDa ? 'da-DK' : 'en-GB') : '—';
                        const dueStr = inv.dueDate ? new Date(inv.dueDate).toLocaleDateString(isDa ? 'da-DK' : 'en-GB') : '—';
                        const statusLabel = isDa
                          ? ({ DRAFT: 'Kladde', SENT: 'Sendt', PAID: 'Betalt', OVERDUE: 'Forsinket', CANCELLED: 'Annulleret' } as Record<string, string>)[inv.status] || inv.status
                          : inv.status;
                        const statusColor =
                          inv.status === 'PAID' ? 'badge-green'
                          : inv.status === 'OVERDUE' ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400'
                          : inv.status === 'SENT' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400'
                          : inv.status === 'CANCELLED' ? 'bg-gray-100 text-gray-500 dark:bg-gray-800/40 dark:text-gray-400'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400';
                        return (
                          <TableRow key={inv.id} className="text-xs">
                            <TableCell className="whitespace-nowrap font-mono text-gray-900 dark:text-white">
                              {inv.invoiceNumber || '—'}
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate text-gray-600 dark:text-gray-300" title={inv.customerName || ''}>
                              {inv.customerName || '—'}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-gray-500 dark:text-gray-400">{issueStr}</TableCell>
                            <TableCell className="whitespace-nowrap text-gray-500 dark:text-gray-400">{dueStr}</TableCell>
                            <TableCell className="whitespace-nowrap">
                              <Badge className={`text-[10px] border-0 ${statusColor}`}>{statusLabel}</Badge>
                            </TableCell>
                            <TableCell className="text-right whitespace-nowrap font-mono text-gray-900 dark:text-white">
                              {tc(inv.totalAmount)} <span className="text-gray-400">{inv.currency || 'DKK'}</span>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400 dark:text-gray-500">
                  <Receipt className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">
                    {isDa
                      ? 'Ingen fakturaer knyttet til dette projekt endnu. Opret en faktura med dette projekt valgt for at se den her.'
                      : 'No invoices linked to this project yet. Create an invoice with this project selected to see it here.'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Edit Dialog ── */}
      <Dialog open={isEditOpen} onOpenChange={(open) => { if (!open) clearEditDraft(); setIsEditOpen(open); }}>
        <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto" {...editGuard.dialogProps}>
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2">
              <span>{t('projectEdit')}</span>
              <ClearFormButton
                size="xs"
                label={isDa ? 'Ryd formular' : 'Clear form'}
                isDirty={isEditDirty}
                onClear={() => {
                  // Revert to the values that were loaded when the edit dialog opened.
                  if (loadedEditStateRef.current) {
                    setFormData(loadedEditStateRef.current);
                  }
                  clearEditDraft();
                }}
              />
            </DialogTitle>
            <DialogDescription>
              {isDa ? 'Opdater projektoplysninger' : 'Update project information'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="edit-name">{t('projectName')} *</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder={isDa ? 'Indtast projektnavn' : 'Enter project name'}
              />
            </div>

            {/* Code */}
            <div className="space-y-2">
              <Label htmlFor="edit-code">{t('projectCode')}</Label>
              <Input
                id="edit-code"
                value={formData.code}
                onChange={(e) => setFormData((prev) => ({ ...prev, code: e.target.value }))}
                placeholder={isDa ? 'F.eks. PRJ-001' : 'e.g. PRJ-001'}
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="edit-description">{t('projectDescription')}</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                placeholder={isDa ? 'Beskriv projektet...' : 'Describe the project...'}
                rows={3}
              />
            </div>

            {/* Color */}
            <div className="space-y-2">
              <Label>{t('projectColor')}</Label>
              <div className="flex items-center gap-2">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setFormData((prev) => ({ ...prev, color }))}
                    className={cn(
                      'h-8 w-8 rounded-full transition-all',
                      formData.color === color
                        ? 'ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-950 scale-110'
                        : 'hover:scale-105'
                    )}
                    style={{ backgroundColor: color, '--tw-ring-color': color } as CSSProperties}
                  />
                ))}
              </div>
            </div>

            {/* Status */}
            <div className="space-y-2">
              <Label>{t('projectStatus')}</Label>
              <Select value={formData.status} onValueChange={(val) => setFormData((prev) => ({ ...prev, status: val }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">{isDa ? 'Aktiv' : 'Active'}</SelectItem>
                  <SelectItem value="ON_HOLD">{isDa ? 'På pause' : 'On Hold'}</SelectItem>
                  <SelectItem value="COMPLETED">{isDa ? 'Afsluttet' : 'Completed'}</SelectItem>
                  <SelectItem value="CANCELLED">{isDa ? 'Annulleret' : 'Cancelled'}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="edit-start">{t('projectStartDate')}</Label>
                <Input
                  id="edit-start"
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData((prev) => ({ ...prev, startDate: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-end">{t('projectEndDate')}</Label>
                <Input
                  id="edit-end"
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData((prev) => ({ ...prev, endDate: e.target.value }))}
                />
              </div>
            </div>

            {/* Budget Total */}
            <div className="space-y-2">
              <Label htmlFor="edit-budget">{t('projectBudget')} (DKK)</Label>
              <Input
                id="edit-budget"
                type="number"
                value={formData.budgetTotal}
                onChange={(e) => setFormData((prev) => ({ ...prev, budgetTotal: e.target.value }))}
                placeholder="0"
              />
            </div>

            {/* Customer */}
            <div className="space-y-2">
              <Label>{t('projectCustomer')}</Label>
              <Select value={formData.customerId || '__none__'} onValueChange={(val) => setFormData((prev) => ({ ...prev, customerId: val === '__none__' ? '' : val }))}>
                <SelectTrigger>
                  <SelectValue placeholder={isDa ? 'Vælg kunde (valgfri)' : 'Select customer (optional)'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{isDa ? 'Ingen kunde' : 'No customer'}</SelectItem>
                  {contacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { clearEditDraft(); setIsEditOpen(false); }} disabled={isSaving}>
              {isDa ? 'Annuller' : 'Cancel'}
            </Button>
            <Button onClick={handleSave} disabled={isSaving} className="bg-[#0d9488] hover:bg-[#0f766e] text-white gap-1.5">
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              {isSaving ? (isDa ? 'Gemmer...' : 'Saving...') : (isDa ? 'Gem' : 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ── */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('projectDelete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('projectDeleteConfirm')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {isDa ? 'Annuller' : 'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white gap-1.5"
            >
              {isDeleting && <Loader2 className="h-4 w-4 animate-spin" />}
              {isDeleting ? (isDa ? 'Annullerer...' : 'Cancelling...') : (isDa ? 'Annuller projekt' : 'Cancel project')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
