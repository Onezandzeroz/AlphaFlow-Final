'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Bell, Clock, Info } from 'lucide-react';
import type { HermesNotification } from './types';

interface HermesNotificationCardProps {
  notification: HermesNotification;
  onDismiss: (id: string) => void;
}

const iconMap = {
  reminder: Bell,
  deadline: Clock,
  info: Info,
};

export function HermesNotificationCard({
  notification,
  onDismiss,
}: HermesNotificationCardProps) {
  const [isVisible, setIsVisible] = useState(true);

  // Auto-dismiss after 8 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      // Wait for exit animation before actually removing
      setTimeout(() => onDismiss(notification.id), 400);
    }, 8000);

    return () => clearTimeout(timer);
  }, [notification.id, onDismiss]);

  const Icon = iconMap[notification.type] || Info;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 80, scale: 0.9 }}
      animate={isVisible ? { opacity: 1, x: 0, scale: 1 } : { opacity: 0, x: 80, scale: 0.9 }}
      exit={{ opacity: 0, x: 80, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className="pointer-events-auto relative mb-3 max-w-sm overflow-hidden rounded-xl border border-teal-200/30 bg-teal-50/80 shadow-lg backdrop-blur-md dark:border-teal-700/30 dark:bg-teal-900/20"
      role="alert"
    >
      {/* Left teal accent bar */}
      <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-[#0d9488] to-[#0e7490] dark:from-teal-400 dark:to-cyan-400" />

      <div className="flex items-start gap-3 p-4 pl-5">
        {/* Icon */}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-100/80 dark:bg-teal-800/30">
          <Icon className="h-4 w-4 text-teal-600 dark:text-teal-400" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-teal-900 dark:text-teal-100">
            {notification.title}
          </p>
          {notification.description && (
            <p className="mt-0.5 text-xs text-teal-700/80 dark:text-teal-300/70 line-clamp-2">
              {notification.description}
            </p>
          )}
          {notification.dueDate && (
            <p className="mt-1 flex items-center gap-1 text-xs text-teal-600/70 dark:text-teal-400/60">
              <Clock className="h-3 w-3" />
              {notification.dueDate}
            </p>
          )}
        </div>

        {/* Dismiss button */}
        <button
          onClick={() => {
            setIsVisible(false);
            setTimeout(() => onDismiss(notification.id), 400);
          }}
          className="shrink-0 rounded-md p-1 text-teal-400 transition-colors hover:bg-teal-100 hover:text-teal-600 dark:text-teal-500 dark:hover:bg-teal-800/40 dark:hover:text-teal-300"
          aria-label="Dismiss notification"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </motion.div>
  );
}
