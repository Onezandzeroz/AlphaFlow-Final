'use client';

import { useState, useEffect, useCallback, useMemo, useRef, type CSSProperties } from 'react';
import { User } from '@/lib/auth-store';
import { useTranslation } from '@/lib/use-translation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
import { PageHeader } from '@/components/shared/page-header';
import { useAccessErrorHandler } from '@/hooks/use-access-error-handler';
import { useWriteAccessGuard } from '@/hooks/use-write-access-guard';
import { useDataVersion } from '@/hooks/use-data-version';
import { useDraftSync } from '@/hooks/use-draft-sync';
import { useWarnOnUnsaved } from '@/hooks/use-warn-unsaved';
import { readDraft } from '@/lib/draft-store';
import { ClearFormButton } from '@/components/ui/clear-form-button';
import { ProjectCard } from './project-card';
import { ProjectDetail } from './project-detail';
import {
  Briefcase,
  Plus,
  Search,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────

interface Project {
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
  totalRevenue: number;
  totalExpenses: number;
  result: number;
  budgetUsage: number;
}

type StatusFilter = 'ALL' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';

interface ContactOption {
  id: string;
  name: string;
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

// ─── Constants ───────────────────────────────────────────────────────

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

interface ProjectsPageProps {
  user: User;
}

export function ProjectsPage({ user }: ProjectsPageProps) {
  const { t, language } = useTranslation();
  const isDa = language === 'da';
  const { handleMutationError } = useAccessErrorHandler();
  const { guardWriteAccess } = useWriteAccessGuard(user);

  // Data state
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Selected project for detail view
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  // Filter state
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ACTIVE');
  const [searchQuery, setSearchQuery] = useState('');

  // Create dialog state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<ProjectFormData>(EMPTY_FORM);

  // Contacts for create form
  const [contacts, setContacts] = useState<ContactOption[]>([]);

  // ── Draft persistence (create project form) ──
  const { clearDraft: clearCreateDraft } = useDraftSync(
    'project:new',
    { ...formData },
    {
      label: isDa ? 'Nyt projekt' : 'New project',
      disabled: !isCreateOpen,
    }
  );

  // ── Dirty tracking + safety-net guard ──
  const isCreateDirty = isCreateOpen && (
    formData.name.trim() !== EMPTY_FORM.name ||
    formData.code.trim() !== EMPTY_FORM.code ||
    formData.description.trim() !== EMPTY_FORM.description ||
    formData.color !== EMPTY_FORM.color ||
    formData.status !== EMPTY_FORM.status ||
    formData.startDate !== EMPTY_FORM.startDate ||
    formData.endDate !== EMPTY_FORM.endDate ||
    formData.budgetTotal !== EMPTY_FORM.budgetTotal ||
    formData.customerId !== EMPTY_FORM.customerId
  );
  const createGuard = useWarnOnUnsaved(isCreateDirty, {
    onConfirmDiscard: () => { clearCreateDraft(); setIsCreateOpen(false); },
    window: false,
  });

  // ── Fetch projects ──
  const fetchProjects = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.set('status', statusFilter);

      const response = await fetch(`/api/projects?${params.toString()}`);
      if (!response.ok) throw new Error(isDa ? 'Kunne ikke hente projekter' : 'Failed to fetch projects');
      const data = await response.json();
      setProjects(data.projects || []);
    } catch (err) {
      console.error('Failed to fetch projects:', err);
      toast.error(isDa ? 'Kunne ikke hente projekter' : 'Failed to fetch projects');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, isDa]);

  // Auto-refresh projects when the server signals a data-changed event.
  const projectsVersion = useDataVersion('projects');

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects, projectsVersion]);

  // ── Fetch contacts when create dialog opens ──
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

  // ── Filtered projects by search ──
  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects;
    const q = searchQuery.toLowerCase().trim();
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.code && p.code.toLowerCase().includes(q)) ||
        (p.customer && p.customer.name.toLowerCase().includes(q))
    );
  }, [projects, searchQuery]);

  // ── Open create dialog ──
  const openCreate = () => {
    guardWriteAccess(isDa ? 'Opret projekt' : 'Create project', () => {
      const draft = readDraft('project:new');
      if (draft?.data) {
        const d = draft.data as Partial<ProjectFormData>;
        setFormData({
          name: typeof d.name === 'string' ? d.name : '',
          code: typeof d.code === 'string' ? d.code : '',
          description: typeof d.description === 'string' ? d.description : '',
          color: typeof d.color === 'string' ? d.color : '#0d9488',
          status: typeof d.status === 'string' ? d.status : 'ACTIVE',
          startDate: typeof d.startDate === 'string' ? d.startDate : '',
          endDate: typeof d.endDate === 'string' ? d.endDate : '',
          budgetTotal: typeof d.budgetTotal === 'string' ? d.budgetTotal : '',
          customerId: typeof d.customerId === 'string' ? d.customerId : '',
        });
      } else {
        setFormData(EMPTY_FORM);
      }
      fetchContacts();
      setIsCreateOpen(true);
    });
  };

  // ── Create project ──
  const handleCreate = async () => {
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

      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const isAccess = await handleMutationError(response, isDa ? 'Opret projekt' : 'Create project');
        if (isAccess) { setIsSaving(false); return; }
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || (isDa ? 'Kunne ikke oprette projekt' : 'Failed to create project'));
      }

      const created = await response.json().catch(() => ({}));

      setIsCreateOpen(false);
      clearCreateDraft();
      toast.success(isDa ? 'Projekt oprettet' : 'Project created');

      // If this was the company's first project, the backend auto-seeded
      // the project-oriented accounts — tell the user so they know where
      // to find them when budgeting.
      if (created?.projectAccountsCreated > 0) {
        toast.info(
          isDa
            ? `${created.projectAccountsCreated} projektkonti tilføjet`
            : `${created.projectAccountsCreated} project accounts added`,
          {
            description: isDa
              ? 'Din kontoplan er nu udvidet med projekt-orienterede konti (indtægter, WIP, omkostninger). Brug dem når du budgetterer på projektet.'
              : 'Your chart of accounts now includes project-oriented accounts (revenue, WIP, expenses). Use them when budgeting on the project.',
          }
        );
      }
      fetchProjects();
    } catch (err) {
      console.error('Create project error:', err);
      if (err instanceof Error && err.message === '__access_denied__') return;
      toast.error(err instanceof Error ? err.message : (isDa ? 'Ukendt fejl' : 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  // ── Status filter options ──
  const statusOptions = useMemo(() => [
    { value: 'ALL', label: isDa ? 'Alle' : 'All' },
    { value: 'ACTIVE', label: isDa ? 'Aktiv' : 'Active' },
    { value: 'ON_HOLD', label: isDa ? 'På pause' : 'On Hold' },
    { value: 'COMPLETED', label: isDa ? 'Afsluttet' : 'Completed' },
    { value: 'CANCELLED', label: isDa ? 'Annulleret' : 'Cancelled' },
  ], [isDa]);

  // ── Stats ──
  const stats = useMemo(() => {
    const active = projects.filter((p) => p.status === 'ACTIVE').length;
    const completed = projects.filter((p) => p.status === 'COMPLETED').length;
    return { total: projects.length, active, completed };
  }, [projects]);

  // ── Detail view ──
  if (selectedProjectId) {
    return (
      <ProjectDetail
        projectId={selectedProjectId}
        user={user}
        onBack={() => setSelectedProjectId(null)}
      />
    );
  }

  // ─── Loading skeleton ──
  if (isLoading && projects.length === 0) {
    return (
      <div className="p-3 lg:p-6 space-y-4 lg:space-y-6">
        {/* Header skeleton */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-80" />
          </div>
          <Skeleton className="h-10 w-44" />
        </div>

        {/* Stats skeleton */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="stat-card">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1 flex-1">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-6 w-12" />
                  </div>
                  <Skeleton className="h-10 w-10 rounded-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filter bar skeleton */}
        <Card className="stat-card">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <Skeleton className="h-10 flex-1" />
              <Skeleton className="h-10 w-40" />
            </div>
          </CardContent>
        </Card>

        {/* Project cards skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="rounded-2xl">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-5 w-48" />
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <Skeleton className="h-1.5 w-full rounded-full" />
                <div className="grid grid-cols-3 gap-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // ─── Main render ──
  return (
    <div className="p-3 lg:p-6 space-y-4 lg:space-y-6">
      {/* Header */}
      <PageHeader
        title={t('projectsTitle')}
        description={t('projectsDescription')}
        action={
          <Button
            onClick={openCreate}
            className="bg-[#0d9488] hover:bg-[#0f766e] text-white border border-[#0d9488] font-medium gap-2 transition-all lg:bg-white/20 lg:hover:bg-white/30 lg:border-white/30 lg:backdrop-blur-sm"
          >
            <Plus className="h-4 w-4" />
            {t('newProject')}
          </Button>
        }
      />

      {/* Summary Stats */}
      {projects.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {/* Total */}
          <Card className="stat-card">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                    {isDa ? 'I alt' : 'Total'}
                  </p>
                  <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mt-0.5 sm:mt-1">
                    {stats.total}
                  </p>
                </div>
                <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-full stat-icon-primary flex items-center justify-center">
                  <Briefcase className="h-4 w-4 sm:h-6 sm:w-6 text-[#0d9488] dark:text-[#2dd4bf]" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Active */}
          <Card className="stat-card">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                    {t('projectActive')}
                  </p>
                  <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mt-0.5 sm:mt-1">
                    {stats.active}
                  </p>
                </div>
                <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-full stat-icon-green flex items-center justify-center">
                  <Briefcase className="h-4 w-4 sm:h-6 sm:w-6 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Completed */}
          <Card className="stat-card">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                    {t('projectCompleted')}
                  </p>
                  <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mt-0.5 sm:mt-1">
                    {stats.completed}
                  </p>
                </div>
                <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-full bg-slate-100 dark:bg-slate-800/40 flex items-center justify-center">
                  <Briefcase className="h-4 w-4 sm:h-6 sm:w-6 text-slate-500 dark:text-slate-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filter Bar */}
      {projects.length > 0 && (
        <Card className="stat-card">
          <CardContent className="p-4 pb-3 lg:pb-4">
            <div className="flex flex-wrap gap-3 items-center">
              {/* Search input */}
              <div className="relative flex-1 min-w-[140px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder={t('searchProjects')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 bg-gray-50 dark:bg-white/[0.04] border-0"
                  autoComplete="off"
                  data-form-type="other"
                />
              </div>

              {/* Status filter */}
              <Select value={statusFilter} onValueChange={(val) => setStatusFilter(val as StatusFilter)}>
                <SelectTrigger className="w-36 bg-gray-50 dark:bg-white/[0.04] border-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Project Cards Grid */}
      {filteredProjects.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onClick={() => setSelectedProjectId(project.id)}
            />
          ))}
        </div>
      ) : (
        /* Empty state */
        <Card className="stat-card card-hover-lift border-0 shadow-lg dark:border dark:border-white/5 rounded-2xl">
          <CardContent className="py-16 text-center">
            <div className="empty-state-container inline-flex flex-col items-center">
              <div className="empty-state-illustration inline-flex items-center justify-center h-20 w-20 rounded-2xl mb-4">
                <Briefcase className="h-10 w-10 text-[#0d9488] dark:text-[#2dd4bf]" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                {t('noProjectsYet')}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto mb-4">
                {t('createFirstProject')}
              </p>
              <Button
                onClick={openCreate}
                className="gap-2 bg-[#0d9488] hover:bg-[#0f766e] text-white"
              >
                <Plus className="h-4 w-4" />
                {t('newProject')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Create Project Dialog ── */}
      <Dialog open={isCreateOpen} onOpenChange={(open) => { if (!open) clearCreateDraft(); setIsCreateOpen(open); }}>
        <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto" {...createGuard.dialogProps}>
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2">
              <span>{t('newProject')}</span>
              <ClearFormButton
                size="xs"
                label={isDa ? 'Ryd formular' : 'Clear form'}
                isDirty={isCreateDirty}
                onClear={() => {
                  setFormData(EMPTY_FORM);
                  clearCreateDraft();
                }}
              />
            </DialogTitle>
            <DialogDescription>
              {isDa ? 'Opret et nyt projekt til at spore økonomi og fremskridt' : 'Create a new project to track finances and progress'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="create-name">{t('projectName')} *</Label>
              <Input
                id="create-name"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder={isDa ? 'Indtast projektnavn' : 'Enter project name'}
              />
            </div>

            {/* Code */}
            <div className="space-y-2">
              <Label htmlFor="create-code">{t('projectCode')}</Label>
              <Input
                id="create-code"
                value={formData.code}
                onChange={(e) => setFormData((prev) => ({ ...prev, code: e.target.value }))}
                placeholder={isDa ? 'F.eks. PRJ-001' : 'e.g. PRJ-001'}
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="create-description">{t('projectDescription')}</Label>
              <Textarea
                id="create-description"
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
                <Label htmlFor="create-start">{t('projectStartDate')}</Label>
                <Input
                  id="create-start"
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData((prev) => ({ ...prev, startDate: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-end">{t('projectEndDate')}</Label>
                <Input
                  id="create-end"
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData((prev) => ({ ...prev, endDate: e.target.value }))}
                />
              </div>
            </div>

            {/* Budget Total */}
            <div className="space-y-2">
              <Label htmlFor="create-budget">{t('projectBudget')} (DKK)</Label>
              <Input
                id="create-budget"
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
            <Button variant="outline" onClick={() => { clearCreateDraft(); setIsCreateOpen(false); }} disabled={isSaving}>
              {isDa ? 'Annuller' : 'Cancel'}
            </Button>
            <Button onClick={handleCreate} disabled={isSaving} className="bg-[#0d9488] hover:bg-[#0f766e] text-white gap-1.5">
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('newProject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
