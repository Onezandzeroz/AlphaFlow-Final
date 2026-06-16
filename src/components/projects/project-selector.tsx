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
import { Skeleton } from '@/components/ui/skeleton';

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
