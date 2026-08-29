'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from '@/lib/use-translation';

interface HermesRevealTabProps {
  /** Shows the tab when true (owl is off-screen). */
  visible: boolean;
  /** Called when the user hovers (desktop) or taps (mobile) the tab. */
  onReveal: () => void;
}

/**
 * A small vertical tab/flag pinned to the right edge of the viewport that
 * indicates Hermes is active but its owl FAB has auto-hidden off-screen.
 *
 * - Desktop: `onMouseEnter` reveals the owl (hover the top-right corner).
 * - Mobile: `onClick` reveals the owl (tap the tab).
 *
 * The tab itself animates in from the right when it appears, and slides
 * back out when the owl is revealed (or the chat is opened).
 */
export function HermesRevealTab({ visible, onReveal }: HermesRevealTabProps) {
  const { t } = useTranslation();
  const label = t('hermesRevealTab');

  return (
    <AnimatePresence>
      {visible && (
        <>
          {/* ── Mobile: small tab at top-right edge ── */}
          <motion.button
            key="mobile-reveal-tab"
            type="button"
            initial={{ x: 30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 30, opacity: 0 }}
            transition={{ duration: 0.4, ease: 'easeInOut' }}
            className="lg:hidden fixed right-0 top-2 z-[10003] pointer-events-auto cursor-pointer outline-none"
            onClick={onReveal}
            aria-label={label}
          >
            {/* Invisible hit area — wider than the visible tab for easy tapping */}
            <div className="absolute right-0 top-0 h-full" style={{ width: 40 }} />
            {/* Visible vertical flag */}
            <div
              className="bg-gradient-to-l from-[#0d9488] to-[#0e7490] rounded-l-full shadow-md flex items-center justify-center"
              style={{ width: 14, height: 40 }}
            >
              <motion.span
                className="block w-1.5 h-1.5 rounded-full bg-white/90"
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              />
            </div>
          </motion.button>

          {/* ── Desktop: vertical flag at top-right edge ── */}
          <motion.button
            key="desktop-reveal-tab"
            type="button"
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0 }}
            transition={{ duration: 0.4, ease: 'easeInOut' }}
            className="hidden lg:flex fixed right-0 top-8 z-[10003] pointer-events-auto cursor-pointer group outline-none"
            onMouseEnter={onReveal}
            onClick={onReveal}
            aria-label={label}
          >
            {/* Invisible hit area — generous hover zone so the user doesn't
                need to be pixel-perfect when sweeping to the corner. */}
            <div className="absolute right-0 top-0 h-full transition-colors group-hover:bg-teal-500/5" style={{ width: 50 }} />
            {/* Visible vertical flag */}
            <div
              className="bg-gradient-to-l from-[#0d9488] to-[#0e7490] rounded-l-lg shadow-lg flex flex-col items-center justify-center gap-1.5 transition-all group-hover:from-[#0e7490] group-hover:to-[#0d9488]"
              style={{ width: 18, height: 60 }}
            >
              {/* Pulsing indicator dot — draws attention without being obnoxious */}
              <motion.span
                className="block w-2 h-2 rounded-full bg-white/90"
                animate={{ opacity: [0.4, 1, 0.4], scale: [0.8, 1.1, 0.8] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
              />
              <span className="block w-1 h-1 rounded-full bg-white/50" />
            </div>
          </motion.button>
        </>
      )}
    </AnimatePresence>
  );
}
