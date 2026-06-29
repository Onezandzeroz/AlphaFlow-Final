'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ResponsiveSwitch } from '@/components/ui/responsive-switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { useTranslation } from '@/lib/use-translation';
import {
  Wrench,
  ExternalLink,
  Lock,
  Trash2,
  Shield,
  Globe,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────

interface Skill {
  id: string;
  name: string;
  version: string;
  descriptionEn: string;
  descriptionDa: string | null;
  author: string | null;
  sourceUrl: string | null;
  enabledByDefault: boolean;
  isBuiltIn: boolean;
  category: string;
  enabled: boolean;
}

// ── Category helpers ──────────────────────────────────────────────

const CATEGORY_META: Record<string, { label: string; labelDa: string; color: string }> = {
  writing: { label: 'Writing', labelDa: 'Skrivning', color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300' },
  compliance: { label: 'Compliance', labelDa: 'Compliance', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  analysis: { label: 'Analysis', labelDa: 'Analyse', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  productivity: { label: 'Productivity', labelDa: 'Produktivitet', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
};

// ── Component ──────────────────────────────────────────────────────

export function HermesSkillsAdmin() {
  const { t, language } = useTranslation();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const isDa = language === 'da';

  // ── Fetch skills ──
  const fetchSkills = useCallback(async () => {
    try {
      const response = await fetch('/api/hermes/skills');
      if (response.ok) {
        const data = await response.json();
        setSkills(data.skills ?? []);
      } else {
        toast.error(isDa ? 'Kunne ikke hente færdigheder' : 'Failed to fetch skills');
      }
    } catch {
      toast.error(isDa ? 'Kunne ikke hente færdigheder' : 'Failed to fetch skills');
    } finally {
      setIsLoading(false);
    }
  }, [isDa]);

  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  // ── Toggle skill globally ──
  const handleToggle = useCallback(async (skillId: string, enabled: boolean) => {
    setTogglingId(skillId);
    try {
      const response = await fetch('/api/hermes/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillId, enabled }),
      });

      if (response.ok) {
        setSkills(prev => prev.map(s => s.id === skillId ? { ...s, enabled, enabledByDefault: enabled } : s));
        toast.success(
          enabled
            ? (isDa ? 'Færdighed aktiveret for alle tenantvirksomheder' : 'Skill enabled for all tenant companies')
            : (isDa ? 'Færdighed deaktiveret for alle tenantvirksomheder' : 'Skill disabled for all tenant companies')
        );
      } else {
        toast.error(isDa ? 'Kunne ikke ændre færdighed' : 'Failed to toggle skill');
      }
    } catch {
      toast.error(isDa ? 'Kunne ikke ændre færdighed' : 'Failed to toggle skill');
    } finally {
      setTogglingId(null);
    }
  }, [isDa]);

  // ── Delete skill (non-built-in only) ──
  const handleDelete = useCallback(async (skillId: string, skillName: string) => {
    if (!confirm(isDa
      ? `Er du sikker på at du vil fjerne "${skillName}" fra kataloget?`
      : `Are you sure you want to remove "${skillName}" from the catalog?`
    )) return;

    setDeletingId(skillId);
    try {
      const response = await fetch('/api/hermes/skills', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillId }),
      });

      if (response.ok) {
        setSkills(prev => prev.filter(s => s.id !== skillId));
        toast.success(isDa ? 'Færdighed fjernet' : 'Skill removed');
      } else {
        const data = await response.json();
        toast.error(data.error || (isDa ? 'Kunne ikke fjerne færdighed' : 'Failed to remove skill'));
      }
    } catch {
      toast.error(isDa ? 'Kunne ikke fjerne færdighed' : 'Failed to remove skill');
    } finally {
      setDeletingId(null);
    }
  }, [isDa]);

  // ── Loading ──
  if (isLoading) {
    return (
      <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
        <CardHeader className="pb-4">
          <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center shrink-0">
              <Wrench className="h-4 w-4 text-white" />
            </div>
            {isDa ? 'Færdigheder' : 'Skills'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </CardContent>
      </Card>
    );
  }

  // ── Empty state ──
  if (skills.length === 0) {
    return (
      <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
        <CardHeader className="pb-4">
          <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center shrink-0">
              <Wrench className="h-4 w-4 text-white" />
            </div>
            {isDa ? 'Færdigheder' : 'Skills'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {isDa
              ? 'Ingen færdigheder installeret endnu. Brug "seed-hermes-skills" scriptet til at tilføje færdigheder til kataloget.'
              : 'No skills installed yet. Use the "seed-hermes-skills" script to add skills to the catalog.'}
          </p>
        </CardContent>
      </Card>
    );
  }

  // ── Skill cards ──
  return (
    <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
      <CardHeader className="pb-4">
        <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center shrink-0">
            <Wrench className="h-4 w-4 text-white" />
          </div>
          {isDa ? 'Færdigheder' : 'Skills'}
        </CardTitle>
        <CardDescription className="text-sm text-gray-500 dark:text-gray-400">
          {isDa
            ? 'Aktivér eller deaktivér færdigheder globalt. Ændringer gælder for alle tenantvirksomheder.'
            : 'Enable or disable skills globally. Changes apply to all tenant companies.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {skills.map((skill) => {
            const cat = CATEGORY_META[skill.category] || CATEGORY_META.writing;
            const description = (isDa && skill.descriptionDa) ? skill.descriptionDa : skill.descriptionEn;
            const isToggling = togglingId === skill.id;
            const isDeleting = deletingId === skill.id;

            return (
              <div
                key={skill.id}
                className={`relative rounded-xl border transition-all ${
                  skill.enabled
                    ? 'border-violet-200 bg-violet-50/50 dark:border-violet-800/30 dark:bg-violet-950/20'
                    : 'border-gray-200 bg-gray-50/50 dark:border-white/5 dark:bg-gray-900/20'
                } p-4`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    {/* Skill name + badges */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                        {skill.name}
                      </h4>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${cat.color}`}>
                        {isDa ? cat.labelDa : cat.label}
                      </Badge>
                      {skill.isBuiltIn && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                          <Lock className="h-2.5 w-2.5 mr-0.5" />
                          {isDa ? 'Indbygget' : 'Built-in'}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 bg-teal-50 text-teal-600 dark:bg-teal-900/20 dark:text-teal-400">
                        <Globe className="h-2.5 w-2.5 mr-0.5" />
                        {isDa ? 'Global' : 'Global'}
                      </Badge>
                      <span className="text-[10px] text-gray-400">v{skill.version}</span>
                    </div>

                    {/* Description */}
                    <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed line-clamp-2">
                      {description}
                    </p>

                    {/* Meta row */}
                    <div className="flex items-center gap-3 text-[10px] text-gray-400">
                      {skill.author && (
                        <span>{isDa ? 'Af' : 'By'} {skill.author}</span>
                      )}
                      {skill.sourceUrl && (
                        <a
                          href={skill.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 text-violet-500 hover:text-violet-600 dark:text-violet-400 dark:hover:text-violet-300"
                        >
                          <ExternalLink className="h-2.5 w-2.5" />
                          {isDa ? 'Kilde' : 'Source'}
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Toggle + delete */}
                  <div className="flex items-center gap-2 shrink-0">
                    {!skill.isBuiltIn && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-gray-400 hover:text-red-500"
                        onClick={() => handleDelete(skill.id, skill.name)}
                        disabled={isDeleting}
                        title={isDa ? 'Fjern færdighed' : 'Remove skill'}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <ResponsiveSwitch
                      checked={skill.enabled}
                      onCheckedChange={(checked) => handleToggle(skill.id, checked)}
                      disabled={isToggling}
                    />
                  </div>
                </div>

                {/* Toggling indicator */}
                {isToggling && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-gray-900/50 rounded-xl">
                    <div className="h-4 w-4 border-2 border-violet-300 border-t-violet-600 rounded-full animate-spin" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* SuperDev info */}
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-violet-50 dark:bg-violet-950/20 border border-violet-200/50 dark:border-violet-800/30 p-3">
          <Shield className="h-4 w-4 text-violet-500 shrink-0 mt-0.5" />
          <p className="text-xs text-violet-700 dark:text-violet-300 leading-relaxed">
            {isDa
              ? 'Som App Owner styrer du færdigheder globalt for alle tenantvirksomheder. Når du aktiverer/deaktiverer en færdighed, gælder det for alle. Indbyggede færdigheder kan ikke fjernes. Tenants har ingen UI til færdigheder — hvis de vil vide hvilke færdigheder du har aktiveret, kan de bare spørge Hermes.'
              : 'As App Owner you control skills globally for all tenant companies. When you enable/disable a skill, it applies to everyone. Built-in skills cannot be removed. Tenants have no skills UI — if they want to know which skills you have enabled, they can simply ask Hermes.'}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
