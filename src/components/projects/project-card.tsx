'use client';

import { useTranslation } from '@/lib/use-translation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Calendar, Building2 } from 'lucide-react';

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

interface ProjectCardProps {
  project: Project;
  onClick: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: '!bg-emerald-100 !text-emerald-700 dark:!bg-emerald-950/40 dark:!text-emerald-400',
  ON_HOLD: '!bg-amber-100 !text-amber-700 dark:!bg-amber-950/40 dark:!text-amber-400',
  COMPLETED: '!bg-slate-100 !text-slate-700 dark:!bg-slate-800/40 dark:!text-slate-400',
  CANCELLED: '!bg-red-100 !text-red-700 dark:!bg-red-950/40 dark:!text-red-400',
};

function getStatusLabel(status: string, language: 'da' | 'en'): string {
  const labels: Record<string, { da: string; en: string }> = {
    ACTIVE: { da: 'Aktiv', en: 'Active' },
    ON_HOLD: { da: 'På pause', en: 'On Hold' },
    COMPLETED: { da: 'Afsluttet', en: 'Completed' },
    CANCELLED: { da: 'Annulleret', en: 'Cancelled' },
  };
  return labels[status]?.[language] || status;
}

function getProgressColor(usage: number): string {
  if (usage <= 80) return 'bg-emerald-500';
  if (usage <= 100) return 'bg-amber-500';
  return 'bg-red-500';
}

function getProgressTrackColor(usage: number): string {
  if (usage <= 80) return 'bg-emerald-100 dark:bg-emerald-950/30';
  if (usage <= 100) return 'bg-amber-100 dark:bg-amber-950/30';
  return 'bg-red-100 dark:bg-red-950/30';
}

// ─── Component ───────────────────────────────────────────────────────

export function ProjectCard({ project, onClick }: ProjectCardProps) {
  const { language, tc, td } = useTranslation();

  const budgetTotal = project.budgetTotal || 0;
  const totalExpenses = project.totalExpenses || 0;
  const totalRevenue = project.totalRevenue || 0;
  const projectResult = project.result || 0;
  const budgetUsage = project.budgetUsage || 0;

  return (
    <Card
      className={cn(
        'group cursor-pointer transition-all duration-200',
        'hover:shadow-md hover:-translate-y-0.5',
        'border border-gray-200/60 dark:border-white/[0.06]',
        'bg-white dark:bg-[#1a1d1c]/80',
        'rounded-2xl overflow-hidden',
        // Grayed-out (dimmed) for cancelled projects so they're visually
        // de-emphasised relative to active/completed ones.
        project.status === 'CANCELLED' && 'opacity-50 grayscale',
      )}
      onClick={onClick}
    >
      <CardContent className="p-4 sm:p-5 space-y-3">
        {/* Header: Color dot + code + name + status */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div
              className="h-3 w-3 rounded-full shrink-0 ring-2 ring-offset-1 ring-offset-white dark:ring-offset-[#1a1d1c]"
              style={{ backgroundColor: project.color || '#0d9488' }}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                {project.code && (
                  <span className="text-xs font-mono text-gray-400 dark:text-gray-500 shrink-0">
                    {project.code}
                  </span>
                )}
                <h3 className="font-semibold text-sm sm:text-base text-gray-900 dark:text-white truncate">
                  {project.name}
                </h3>
              </div>
            </div>
          </div>
          <Badge
            variant="secondary"
            className={cn(
              'text-[10px] sm:text-xs px-2 py-0.5 shrink-0 font-medium border-0',
              STATUS_STYLES[project.status] || ''
            )}
          >
            {getStatusLabel(project.status, language)}
          </Badge>
        </div>

        {/* Budget progress bar */}
        {budgetTotal > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500 dark:text-gray-400">
                {language === 'da' ? 'Budgetforbrug' : 'Budget usage'}
              </span>
              <span className={cn(
                'font-medium',
                budgetUsage <= 80
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : budgetUsage <= 100
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-red-600 dark:text-red-400'
              )}>
                {Math.round(budgetUsage)}%
              </span>
            </div>
            <div className={cn('h-1.5 rounded-full overflow-hidden', getProgressTrackColor(budgetUsage))}>
              <div
                className={cn('h-full rounded-full transition-all duration-500', getProgressColor(budgetUsage))}
                style={{ width: `${Math.min(budgetUsage, 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Key figures */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <p className="text-gray-400 dark:text-gray-500 mb-0.5">
              {language === 'da' ? 'Budget' : 'Budget'}
            </p>
            <p className="font-medium text-gray-700 dark:text-gray-300">
              {budgetTotal > 0 ? tc(budgetTotal) : '—'}
            </p>
          </div>
          <div>
            <p className="text-gray-400 dark:text-gray-500 mb-0.5">
              {language === 'da' ? 'Realiseret' : 'Actual'}
            </p>
            <p className="font-medium text-gray-700 dark:text-gray-300">
              {tc(totalExpenses)}
            </p>
          </div>
          <div>
            <p className="text-gray-400 dark:text-gray-500 mb-0.5">
              {language === 'da' ? 'Resultat' : 'Result'}
            </p>
            <p className={cn(
              'font-medium',
              projectResult >= 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-red-600 dark:text-red-400'
            )}>
              {tc(projectResult)}
            </p>
          </div>
        </div>

        {/* Footer: Date range + Customer */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-400 dark:text-gray-500 pt-1 border-t border-gray-100 dark:border-white/[0.04]">
          {(project.startDate || project.endDate) && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {project.startDate && td(project.startDate)}
              {project.startDate && project.endDate && '–'}
              {project.endDate && td(project.endDate)}
            </span>
          )}
          {project.customer && (
            <span className="flex items-center gap-1">
              <Building2 className="h-3 w-3" />
              {project.customer.name}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export type { Project, ProjectCardProps };
