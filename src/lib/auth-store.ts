import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { logger } from '@/lib/logger';

export interface User {
  id: string;
  email: string;
  emailVerified?: boolean;
  businessName?: string | null;
  demoModeEnabled?: boolean;
  isDemoCompany?: boolean;
  isSuperDev?: boolean;
  hasAppOwner?: boolean;
  isFirstLogin?: boolean;
  activeCompanyId?: string | null;
  activeCompanyRole?: string | null;
  activeCompanyName?: string | null;
  companies?: CompanyInfo[];
  oversightCompanyId?: string | null;
  oversightCompanyName?: string | null;
  isOversightMode?: boolean;
  // ── Project Mode (FASE 4) ──
  /** SuperDev-controlled per-tenant flag: when false, Projects UI + APIs are hidden */
  projectModeEnabled?: boolean;
  /** When set, the user is working inside this project's context */
  activeProjectId?: string | null;
  activeProjectName?: string | null;
  activeProjectColor?: string | null;
  activeProjectStatus?: string | null;
  /** Project's start/end dates (ISO strings) — used to auto-default date filters */
  activeProjectStartDate?: string | null;
  activeProjectEndDate?: string | null;
  /** True when activeProjectId is set */
  isProjectMode?: boolean;
  // ── Subscription plan (FASE 5 — feature gating) ──
  /** Active company's plan tier ('free' | 'monthly' | 'annual' | 'twoyear' | 'threeyear') */
  planTier?: string | null;
  /** When the current plan was activated (ISO string or null) */
  planPurchasedAt?: string | null;
  /** End of binding period (ISO string or null for free + monthly) */
  planExpiresAt?: string | null;
  /** Pre-computed list of features available to this user+company */
  availableFeatures?: string[];
  /** Team member seat cap for the active company (null = unlimited) */
  seatCap?: number | null;
  /** Current team member count (members + pending invitations) */
  seatCount?: number;
}

export interface CompanyInfo {
  id: string;
  name: string;
  role: string;
  isDemo: boolean;
  isActive: boolean;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
  checkAuth: () => Promise<void>;
  switchCompany: (companyId: string) => Promise<void>;
  startOversight: (companyId: string) => Promise<void>;
  stopOversight: () => Promise<void>;
  // ── Project Mode (FASE 4) ──
  enterProject: (projectId: string) => Promise<void>;
  exitProject: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isLoading: true,
      setUser: (user) => set({ user, isLoading: false }),
      setLoading: (loading) => set({ isLoading: loading }),
      logout: () => {
        set({ user: null, isLoading: false });
        // Call logout API
        if (typeof window !== 'undefined') {
          fetch('/api/auth/logout', { method: 'POST' });
        }
      },
      checkAuth: async () => {
        try {
          const response = await fetch('/api/auth/me');
          const data = await response.json();
          
          if (data.user) {
            set({ user: data.user, isLoading: false });
          } else {
            set({ user: null, isLoading: false });
          }
        } catch (error) {
          logger.error('Auth check failed:', error);
          set({ user: null, isLoading: false });
        }
      },
      switchCompany: async (companyId: string) => {
        try {
          const response = await fetch('/api/company/switch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ companyId }),
          });

          if (response.ok) {
            const data = await response.json();
            // Update user state with new active company
            const currentUser = get().user;
            if (currentUser) {
              set({
                user: {
                  ...currentUser,
                  activeCompanyId: data.companyId,
                  activeCompanyName: data.companyName,
                  activeCompanyRole: data.role,
                  isDemoCompany: data.isDemoCompany ?? false,
                },
              });
            }
            // Reload page to refresh all data for new company context
            if (typeof window !== 'undefined') {
              window.location.reload();
            }
          }
        } catch (error) {
          logger.error('Switch company failed:', error);
        }
      },
      startOversight: async (companyId: string) => {
        try {
          const response = await fetch('/api/oversight/switch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ companyId }),
          });

          if (response.ok) {
            const data = await response.json();
            const currentUser = get().user;
            if (currentUser) {
              set({
                user: {
                  ...currentUser,
                  oversightCompanyId: data.oversightCompanyId,
                  oversightCompanyName: data.oversightCompanyName,
                  isOversightMode: true,
                },
              });
            }
            // Reload to refresh all data with oversight tenant scoping
            if (typeof window !== 'undefined') {
              window.location.reload();
            }
          } else {
            const data = await response.json();
            logger.error('Start oversight failed:', data.error);
            throw new Error(data.error || 'Failed to start oversight');
          }
        } catch (error) {
          logger.error('Start oversight failed:', error);
          throw error;
        }
      },
      stopOversight: async () => {
        try {
          const response = await fetch('/api/oversight/clear', {
            method: 'POST',
          });

          if (response.ok) {
            const currentUser = get().user;
            if (currentUser) {
              set({
                user: {
                  ...currentUser,
                  oversightCompanyId: null,
                  oversightCompanyName: null,
                  isOversightMode: false,
                },
              });
            }
            // Reload to return to normal data scoping
            if (typeof window !== 'undefined') {
              window.location.reload();
            }
          }
        } catch (error) {
          logger.error('Stop oversight failed:', error);
        }
      },
      // ── Project Mode (FASE 4) ──
      // Enter project mode: sets activeProjectId on the session so all
      // subsequent API calls scope to this project. The colored banner
      // appears and forms auto-attach new entries to the project.
      enterProject: async (projectId: string) => {
        try {
          const response = await fetch('/api/project-mode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'enter', projectId }),
          });

          if (response.ok) {
            const data = await response.json();
            const currentUser = get().user;
            if (currentUser) {
              set({
                user: {
                  ...currentUser,
                  activeProjectId: data.activeProjectId ?? projectId,
                  activeProjectName: data.activeProjectName ?? null,
                  activeProjectColor: data.activeProjectColor ?? null,
                  activeProjectStatus: data.activeProjectStatus ?? null,
                  activeProjectStartDate: data.activeProjectStartDate ?? null,
                  activeProjectEndDate: data.activeProjectEndDate ?? null,
                  isProjectMode: true,
                },
              });
            }
            // Reload so all data lists re-fetch with the new project scope.
            // (Lighter than demo/oversight which also swap the company —
            // here only the project filter changes, but a reload keeps the
            // mental model identical for the user.)
            if (typeof window !== 'undefined') {
              window.location.reload();
            }
          } else {
            const data = await response.json().catch(() => null);
            logger.error('Enter project mode failed:', data?.error || response.status);
            throw new Error(data?.error || 'Failed to enter project mode');
          }
        } catch (error) {
          logger.error('Enter project mode failed:', error);
          throw error;
        }
      },
      // Exit project mode: clears activeProjectId. Triggered by the
      // "Tilbage til tenant-regnskabet" link in the project banner.
      exitProject: async () => {
        try {
          const response = await fetch('/api/project-mode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'exit' }),
          });

          if (response.ok) {
            const currentUser = get().user;
            if (currentUser) {
              set({
                user: {
                  ...currentUser,
                  activeProjectId: null,
                  activeProjectName: null,
                  activeProjectColor: null,
                  activeProjectStatus: null,
                  activeProjectStartDate: null,
                  activeProjectEndDate: null,
                  isProjectMode: false,
                },
              });
            }
            if (typeof window !== 'undefined') {
              window.location.reload();
            }
          }
        } catch (error) {
          logger.error('Exit project mode failed:', error);
        }
      },
    }),
    {
      name: 'danish-bookkeeping-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user ? { ...state.user, isFirstLogin: undefined } : null,
      }),
    }
  )
);
