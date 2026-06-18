'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTranslation } from '@/lib/use-translation';
import { useAuthStore } from '@/lib/auth-store';
import { Skeleton } from '@/components/ui/skeleton';
import { Lock } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────

interface ProjectOption {
  id: string;
  name: string;
  code: string | null;
  color: string | null;
}

interface ProjectSelectorProps {
  value?: string;
  onChange: (projectId: string | null) => void;
  companyId: string;
}

// ─── Component ───────────────────────────────────────────────────────

export function ProjectSelector({ value, onChange, companyId }: ProjectSelectorProps) {
  const { t, language } = useTranslation();
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // ── Project Mode (FASE 4) ──
  // When the user is in project mode, the selector is locked: it shows the
  // active project as a static chip instead of a dropdown, and calls
  // onChange with the active project id on mount so the parent form picks
  // it up automatically (defence-in-depth alongside the form auto-populate).
  const { user } = useAuthStore();
  const isProjectMode = !!user?.isProjectMode;
  const activeProjectId = user?.activeProjectId ?? null;
  const activeProjectName = user?.activeProjectName ?? null;
  const activeProjectColor = user?.activeProjectColor ?? null;

  const fetchActiveProjects = useCallback(async () => {
    if (!companyId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch('/api/projects?status=ACTIVE');
      if (!res.ok) throw new Error('Failed to fetch projects');
      const data = await res.json();
      setProjects(
        (data.projects || []).map((p: { id: string; name: string; code: string | null; color: string | null }) => ({
          id: p.id,
          name: p.name,
          code: p.code,
          color: p.color,
        }))
      );
    } catch (err) {
      console.error('Failed to fetch active projects:', err);
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchActiveProjects();
  }, [fetchActiveProjects]);

  // When in project mode, force the value to the active project id so the
  // parent form always submits the correct project — even if it never called
  // onChange itself. Runs once when project mode is first detected.
  useEffect(() => {
    if (isProjectMode && activeProjectId && value !== activeProjectId) {
      onChange(activeProjectId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProjectMode, activeProjectId]);

  // ── Project mode: locked chip ──
  if (isProjectMode) {
    return (
      <div
        className="flex items-center gap-2 h-10 w-full rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 px-3"
        title={language === 'da'
          ? 'Projektet er låst af projekt-tilstand. Afslut projekt-tilstand for at vælge et andet projekt.'
          : 'Project is locked by project mode. Exit project mode to choose a different project.'}
      >
        <Lock className="h-3.5 w-3.5 text-gray-400 shrink-0" />
        <span
          className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
          style={{ backgroundColor: activeProjectColor || '#0d9488' }}
        />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate flex-1">
          {activeProjectName || (language === 'da' ? 'Aktivt projekt' : 'Active project')}
        </span>
        <span className="text-[10px] text-gray-400 shrink-0">
          {language === 'da' ? 'Låst' : 'Locked'}
        </span>
      </div>
    );
  }

  if (isLoading) {
    return <Skeleton className="h-10 w-full rounded-lg" />;
  }

  return (
    <Select
      value={value || '__none__'}
      onValueChange={(val) => {
        onChange(val === '__none__' ? null : val);
      }}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder={t('selectProject')} />
      </SelectTrigger>
      <SelectContent>
        {projects.length === 0 ? (
          <div className="px-3 py-2 text-sm text-muted-foreground">
            {language === 'da' ? 'Ingen aktive projekter' : 'No active projects'}
          </div>
        ) : (
          projects.map((project) => (
            <SelectItem key={project.id} value={project.id}>
              <span className="flex items-center gap-2">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: project.color || '#0d9488' }}
                />
                {project.code && (
                  <span className="text-xs font-mono text-gray-400">{project.code}</span>
                )}
                <span>{project.name}</span>
              </span>
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}
