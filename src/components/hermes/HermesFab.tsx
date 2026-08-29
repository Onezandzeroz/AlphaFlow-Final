'use client';

import { motion } from 'framer-motion';
import { useTranslation } from '@/lib/use-translation';

interface HermesFabProps {
  onClick: () => void;
  hasNotifications: boolean;
  isTyping: boolean;
  /**
   * When true, the owl animates off-screen to the right (x +200px, opacity 0)
   * and its pointer-events are disabled so the hot-zone div underneath can
   * capture hover/tap to reveal it again.
   */
  fabHidden: boolean;
}

export function HermesFab({ onClick, hasNotifications, isTyping, fabHidden }: HermesFabProps) {
  const { t } = useTranslation();

  // Distance to slide the owl off-screen to the right.
  // Desktop owl is 120px at right-16 (64px) → needs >184px to clear;
  // mobile owl is 60px at right-1 (4px) → needs >64px. 200px covers both.
  const HIDE_OFFSET_X = 200;

  return (
    <>
      {/* ── Mobile: 60×60, positioned in header ── */}
      <div className="relative flex items-center justify-center lg:hidden" style={{ width: 60, height: 60, background: 'transparent' }}>
        {/* Outer wrapper: handles the hide/show slide+fade animation */}
        <motion.div
          animate={{
            x: fabHidden ? HIDE_OFFSET_X : 0,
            opacity: fabHidden ? 0 : 1,
          }}
          transition={{
            duration: 0.6,
            ease: 'easeInOut',
          }}
          style={{ pointerEvents: fabHidden ? 'none' : 'auto' }}
        >
          {/* Inner: handles hover/tap/typing animations */}
          <motion.div
            className="relative pointer-events-auto cursor-pointer"
            whileTap={{ scale: 0.92 }}
            onClick={onClick}
            role="button"
            tabIndex={0}
            aria-label={t('hermesOpenAssistant')}
            aria-hidden={fabHidden}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }}
            animate={
              isTyping
                ? { y: [0, -2, 0] }
                : {}
            }
            transition={
              isTyping
                ? { duration: 0.6, repeat: Infinity, ease: 'easeInOut' }
                : {}
            }
          >
            <img
              src="/hermes-owl.webp"
              alt=""
              className="w-auto object-contain drop-shadow-md"
              style={{ height: 60 }}
              draggable={false}
            />

            {/* Typing indicator dots */}
            {isTyping && (
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-0.5">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="block h-1.5 w-1.5 rounded-full bg-teal-400"
                    animate={{ y: [0, -2, 0], opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
                  />
                ))}
              </div>
            )}

            {/* Notification badge */}
            {hasNotifications && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-sm ring-2 ring-white dark:ring-gray-900"
              >
                !
              </motion.span>
            )}
          </motion.div>
        </motion.div>
      </div>

      {/* ── Desktop: 120×120, positioned over banner ── */}
      <div className="hidden lg:flex items-center justify-center" style={{ width: 120, height: 120, background: 'transparent' }}>
        {/* Outer wrapper: handles the hide/show slide+fade animation */}
        <motion.div
          animate={{
            x: fabHidden ? HIDE_OFFSET_X : 0,
            opacity: fabHidden ? 0 : 1,
          }}
          transition={{
            duration: 0.6,
            ease: 'easeInOut',
          }}
          style={{ pointerEvents: fabHidden ? 'none' : 'auto' }}
        >
          {/* Inner: handles hover/tap/typing animations */}
          <motion.div
            className="relative pointer-events-auto cursor-pointer"
            whileHover={{ scale: 1.12 }}
            whileTap={{ scale: 0.92 }}
            onClick={onClick}
            role="button"
            tabIndex={0}
            aria-label={t('hermesOpenAssistant')}
            aria-hidden={fabHidden}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }}
            animate={
              isTyping
                ? { y: [0, -3, 0] }
                : {}
            }
            transition={
              isTyping
                ? { duration: 0.6, repeat: Infinity, ease: 'easeInOut' }
                : {}
            }
          >
            <img
              src="/hermes-owl.webp"
              alt=""
              className="w-auto object-contain drop-shadow-lg"
              style={{ height: 120 }}
              draggable={false}
            />

            {/* Typing indicator dots */}
            {isTyping && (
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="block h-2 w-2 rounded-full bg-teal-400"
                    animate={{ y: [0, -3, 0], opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
                  />
                ))}
              </div>
            )}

            {/* Notification badge */}
            {hasNotifications && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-sm font-bold text-white shadow-sm ring-2 ring-white dark:ring-gray-900"
              >
                !
              </motion.span>
            )}
          </motion.div>
        </motion.div>
      </div>
    </>
  );
}
