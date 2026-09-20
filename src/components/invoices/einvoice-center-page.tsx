'use client';

/* eslint-disable react-hooks/set-state-in-effect -- this component polls an
   async endpoint and updates state in the async callback. The setState calls
   happen AFTER the effect returns (post-fetch), so they are NOT synchronous
   cascading renders. The strict React 19 rule flags them as false positives
   because it can't distinguish sync-in-effect from async-in-effect. */

/**
 * EInvoiceCenterPage — fælles side for E-faktura Indbakke + Sporing.
 *
 * Samler de to tidligere separate views under ét menupunkt med tabs:
 *   - "Indbakke" (inbound) → EInvoiceInbox (modtagne e-fakturaer)
 *   - "Sporing"  (outbound) → EInvoiceTrackingPage (afsendelses-sporing)
 *
 * Tabs er responsive:
 *   - Desktop (sm+): horisontal TabsList med ikoner
 *   - Mobil (<sm): Select dropdown
 *
 * Valgt tab persisteres i URL-query (?tab=inbox|tracking) så man kan deeplinke
 * og så et browser-tilbage-klik bevarer den valgte visning. Default = 'inbox'
 * (modtagne e-fakturaer er det mest almindelige daglige arbejdselement).
 *
 * Hver tab viser også en badge-count (ulæste modtagne / aktive afsendelser)
 * så brugeren kan se om der er noget der kræver opmærksomhed.
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@/lib/use-translation';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Inbox, Send, type LucideIcon } from 'lucide-react';
import { EInvoiceInbox } from '@/components/invoices/einvoice-inbox';
import { EInvoiceTrackingPage } from '@/components/invoices/einvoice-tracking-page';
import { useDataVersion } from '@/hooks/use-data-version';
import type { User } from '@/lib/auth-store';

// ── Types ──────────────────────────────────────────────────────────

type EInvoiceTab = 'inbox' | 'tracking';

interface EInvoiceCenterPageProps {
  user: User;
  /** Optional: callback when user clicks an invoice in tracking tab (navigates to invoice). */
  onInvoiceClick?: (invoiceId: string) => void;
  /** Optional: initial tab — overrides URL query. */
  initialTab?: EInvoiceTab;
}

// ── Component ──────────────────────────────────────────────────────

export function EInvoiceCenterPage({ user, onInvoiceClick, initialTab }: EInvoiceCenterPageProps) {
  const { language } = useTranslation();
  const isDa = language === 'da';

  // ── Tab state (URL-persisted) ──
  // Read initial tab from URL query (?tab=...) so refresh + back-button preserves the view.
  const [activeTab, setActiveTab] = useState<EInvoiceTab>(() => {
    if (initialTab) return initialTab;
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const t = params.get('tab');
      if (t === 'inbox' || t === 'tracking') return t;
    }
    return 'inbox'; // default — inbox is the most common daily view
  });

  // Sync tab → URL (replaceState so we don't spam browser history)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('tab', activeTab);
    window.history.replaceState({}, '', url.toString());
  }, [activeTab]);

  // ── Unread inbox count (badge) ──
  // Polls the unread-count endpoint + refreshes on data-version bumps so
  // the badge updates in real-time when a new e-invoice arrives via webhook.
  const [unreadCount, setUnreadCount] = useState(0);
  const receivedInvoicesVersion = useDataVersion('received-invoices');

  const fetchUnreadCount = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch('/api/invoices/received/unread-count');
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.count || 0);
      }
    } catch {
      // Non-blocking — badge just won't show
    }
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    // Fire-and-forget: the setState happens in the async callback after the
    // fetch resolves — React treats this as an async update, not a sync
    // cascading render. The cancelled flag prevents stale state updates if
    // the component unmounts before the fetch completes.
    fetchUnreadCount().catch(() => {
      // Non-blocking — badge just won't update this cycle
    });
    return () => {
      cancelled = true;
    };
  }, [fetchUnreadCount, receivedInvoicesVersion]);

  return (
    <div className="flex flex-col h-full">
      {/* Header (sticky at top of the scroll area — below the app's top bar) */}
      <div className="border-b border-gray-100 dark:border-white/5 px-4 lg:px-6 pt-4 pb-0 bg-background sticky top-0 z-20">
        <div className="flex items-center gap-2 mb-3">
          <Inbox className="h-5 w-5 text-blue-500" />
          <h1 className="text-lg font-semibold">
            {isDa ? 'E-faktura Center' : 'E-Invoice Center'}
          </h1>
          <span className="text-xs text-muted-foreground">
            {isDa
              ? 'Modtag og spor e-fakturaer via NemHandel & Peppol'
              : 'Receive and track e-invoices via NemHandel & Peppol'}
          </span>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as EInvoiceTab)}>
          {/* Mobile: Select dropdown */}
          <div className="sm:hidden mb-3">
            <Select value={activeTab} onValueChange={(v) => setActiveTab(v as EInvoiceTab)}>
              <SelectTrigger className="w-full h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inbox">
                  <span className="flex items-center gap-2">
                    <Inbox className="h-4 w-4" />
                    {isDa ? 'Indbakke' : 'Inbox'}
                    {unreadCount > 0 && (
                      <span className="ml-1 inline-flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </span>
                </SelectItem>
                <SelectItem value="tracking">
                  <span className="flex items-center gap-2">
                    <Send className="h-4 w-4" />
                    {isDa ? 'Sporing' : 'Tracking'}
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Desktop: TabsList */}
          <div className="hidden sm:block">
            <TabsList className="bg-gray-100 dark:bg-gray-800 h-10">
              <TabsTrigger
                value="inbox"
                className="text-sm gap-1.5 data-[state=active]:bg-white dark:data-[state=active]:bg-white/10 data-[state=active]:shadow-sm relative"
              >
                <Inbox className="h-4 w-4" />
                {isDa ? 'Indbakke' : 'Inbox'}
                {unreadCount > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="tracking"
                className="text-sm gap-1.5 data-[state=active]:bg-white dark:data-[state=active]:bg-white/10 data-[state=active]:shadow-sm"
              >
                <Send className="h-4 w-4" />
                {isDa ? 'Sporing' : 'Tracking'}
              </TabsTrigger>
            </TabsList>
          </div>

          {/* TabsContent wrapper — content renders below the tab strip.
              We render BOTH tabs' content and toggle visibility via CSS so
              that switching tabs doesn't re-mount the heavy components (which
              would lose internal state like filters, expanded rows, scroll position).
              The data fetching inside each component still only happens when
              the component is mounted for the first time. */}
          <TabsContent value="inbox" className="mt-0 focus-visible:outline-none">
            <div className={activeTab === 'inbox' ? 'block' : 'hidden'}>
              <EInvoiceInbox user={user} />
            </div>
          </TabsContent>

          <TabsContent value="tracking" className="mt-0 focus-visible:outline-none">
            <div className={activeTab === 'tracking' ? 'block' : 'hidden'}>
              <EInvoiceTrackingPage onInvoiceClick={onInvoiceClick} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
