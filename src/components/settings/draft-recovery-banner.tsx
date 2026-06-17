'use client';

/**
 * DraftRecoveryBanner
 *
 * Settings UI that lists all persisted form drafts and lets the user:
 *   - see when each was last edited
 *   - discard an individual draft
 *   - discard all drafts at once
 *
 * Renders nothing if there are no drafts (so it's safe to always mount).
 *
 * Drafts auto-expire after 7 days (handled by the store), so this view is
 * purely for explicit user control — most users will never need it.
 */

import { useDraftStore, type DraftMeta } from '@/lib/draft-store';
import { useAuthStore } from '@/lib/auth-store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileEdit, Trash2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

// ─── Pretty labels for known draft key prefixes ──────────────────────
// Maps the first segment of a draft key (e.g. 'transaction' from
// 'transaction:new') to a human-readable label, so the recovery UI can
// show "New transaction" rather than the raw key.

const KEY_LABELS: Record<string, { da: string; en: string }> = {
  transaction: { da: 'Transaktion', en: 'Transaction' },
  'journal-entry': { da: 'Postering', en: 'Journal entry' },
  contact: { da: 'Kontakt', en: 'Contact' },
  invoice: { da: 'Faktura', en: 'Invoice' },
  budget: { da: 'Budget', en: 'Budget' },
  account: { da: 'Konto', en: 'Account' },
  project: { da: 'Projekt', en: 'Project' },
  'bank-reconciliation': { da: 'Bankafstemning', en: 'Bank reconciliation' },
  'bank-connection': { da: 'Bankforbindelse', en: 'Bank connection' },
  'company-settings': { da: 'Firmaindstillinger', en: 'Company settings' },
  'fiscal-period': { da: 'Regnskabsperiode', en: 'Fiscal period' },
  'recurring-entry': { da: 'Tilbagevendende post', en: 'Recurring entry' },
};

function labelForDraft(meta: DraftMeta, isDanish: boolean): string {
  if (meta.label) return meta.label;
  const prefix = meta.key.split(':')[0] ?? meta.key;
  const entry = KEY_LABELS[prefix];
  if (entry) return isDanish ? entry.da : entry.en;
  return meta.key;
}

function relativeTime(ts: number, isDanish: boolean): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return isDanish ? 'lige nu' : 'just now';
  if (min < 60) return isDanish ? `for ${min} min siden` : `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return isDanish ? `for ${hr} timer siden` : `${hr} hr ago`;
  const days = Math.floor(hr / 24);
  return isDanish ? `for ${days} dage siden` : `${days} days ago`;
}

export function DraftRecoveryBanner() {
  const drafts = useDraftStore((s) => s.drafts);
  const clearDraft = useDraftStore((s) => s.clearDraft);
  const clearAllDrafts = useDraftStore((s) => s.clearAllDrafts);
  const listDrafts = useDraftStore((s) => s.listDrafts);

  const user = useAuthStore((s) => s.user);
  const isDanish = (user as never as { language?: string } | null)?.language !== 'en';
  // Fall back to a simple heuristic — the app's default is Danish.
  const lang = typeof window !== 'undefined' && localStorage.getItem('alphaflow-language');
  const danish = lang ? lang === 'da' : true;

  const draftList = listDrafts();

  // Nothing to show — render nothing so the tab can be hidden when empty.
  if (draftList.length === 0) {
    return (
      <Card className="border-0 shadow-lg">
        <CardContent className="py-10 flex flex-col items-center justify-center text-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-gray-100 dark:bg-white/5 flex items-center justify-center">
            <FileEdit className="h-6 w-6 text-gray-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {danish ? 'Ingen gemte udkast' : 'No saved drafts'}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-sm">
              {danish
                ? 'Når du udfylder en formular, gemmes dit input automatisk som et udkast, så du ikke mister det ved et uheld.'
                : 'When you fill in a form, your input is automatically saved as a draft so you don\'t lose it by accident.'}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const handleDiscard = (key: string) => {
    clearDraft(key);
    toast.success(danish ? 'Udkast kasseret' : 'Draft discarded');
  };

  const handleDiscardAll = () => {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        danish
          ? `Kassér alle ${draftList.length} udkast? Dette kan ikke fortrydes.`
          : `Discard all ${draftList.length} drafts? This cannot be undone.`
      )
    ) {
      return;
    }
    clearAllDrafts();
    toast.success(danish ? 'Alle udkast kasseret' : 'All drafts discarded');
  };

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
              <FileEdit className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">
                {danish ? 'Gemte udkast' : 'Saved drafts'}
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                {danish
                  ? `${draftList.length} udkast • udløber automatisk efter 7 dage`
                  : `${draftList.length} draft(s) • expire automatically after 7 days`}
              </CardDescription>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDiscardAll}
            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 border-red-200 dark:border-red-900/50 gap-1.5"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{danish ? 'Kassér alle' : 'Discard all'}</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ScrollArea className="max-h-80">
          <ul className="space-y-2">
            {draftList.map((meta) => (
              <li
                key={meta.key}
                className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 dark:border-white/10 p-3 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {labelForDraft(meta, danish)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {relativeTime(meta.updatedAt, danish)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className="text-[10px] font-mono text-gray-400 hidden sm:inline-flex">
                    {meta.key.length > 24 ? meta.key.slice(0, 22) + '…' : meta.key}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                    onClick={() => handleDiscard(meta.key)}
                    aria-label={danish ? 'Kassér udkast' : 'Discard draft'}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </ScrollArea>
        <div className="mt-3 flex items-start gap-2 text-xs text-gray-400 dark:text-gray-500">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <p>
            {danish
              ? 'Udkast gendannes automatisk, når du åbner den samme formular igen. Kassér et udkast hvis du vil starte forfra.'
              : 'Drafts are restored automatically when you reopen the same form. Discard a draft to start fresh.'}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
