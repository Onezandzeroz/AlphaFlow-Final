'use client';

import { createContext, useContext } from 'react';

/**
 * Simple context to share the Hermes enabled state across the component tree.
 * 
 * When Hermes is NOT enabled, PageHeader and AppLayout can reduce their
 * right-side padding since the owl overlay won't be rendered.
 * 
 * Provided by HermesProvider, consumed by PageHeader and AppLayout.
 */
const HermesEnabledContext = createContext(false);

export function HermesEnabledProvider({
  children,
  enabled,
}: {
  children: React.ReactNode;
  enabled: boolean;
}) {
  return (
    <HermesEnabledContext.Provider value={enabled}>
      {children}
    </HermesEnabledContext.Provider>
  );
}

export function useHermesEnabled(): boolean {
  return useContext(HermesEnabledContext);
}
