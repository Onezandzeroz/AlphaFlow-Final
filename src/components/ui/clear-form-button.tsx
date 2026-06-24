'use client';

/**
 * ClearFormButton
 *
 * A discreet icon button that clears the current form: resets fields to
 * defaults and removes the persisted draft. Designed to sit unobtrusively
 * in a form header / toolbar next to the title, not compete with the
 * primary Submit / Cancel buttons.
 *
 * Behavior:
 *   - Shows a small ghost icon button (Eraser) with a tooltip.
 *   - If `isDirty` is true (form has user input), shows a confirm dialog
 *     before clearing — prevents accidental wipes.
 *   - If `isDirty` is false, clears immediately (no confirmation needed).
 *   - Calls `onClear()` which the parent uses to reset form state + clear
 *     the draft (via the form's clearDraft from useDraftSync/useDraftForm).
 *
 * Usage:
 *   <ClearFormButton
 *     onClear={() => { resetForm(); clearDraft(); }}
 *     isDirty={isDirty}
 *     label="Ryd"  // accessible label + tooltip
 *   />
 *
 * Placement suggestion: top-right of the form, in the same row as the
 * form title, with `className="h-7 w-7"` for a compact footprint.
 */

import { useState } from 'react';
import { Eraser, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export interface ClearFormButtonProps {
  /** Called when the user confirms the clear (or immediately if not dirty). */
  onClear: () => void | Promise<void>;
  /** Whether the form currently has unsaved user input. When true, a confirm
   *  dialog is shown before clearing. When false/undefined, clears immediately. */
  isDirty?: boolean;
  /** Accessible label + tooltip text. Defaults to "Ryd" (Danish). */
  label?: string;
  /** Compact size variant. Default 'sm'. */
  size?: 'sm' | 'xs';
  /** Extra classes for the button. */
  className?: string;
  /** Disable the button (e.g. during submit). */
  disabled?: boolean;
}

export function ClearFormButton({
  onClear,
  isDirty = false,
  label = 'Ryd',
  size = 'sm',
  className = '',
  disabled = false,
}: ClearFormButtonProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const handleClick = () => {
    if (disabled) return;
    if (isDirty) {
      setShowConfirm(true);
    } else {
      void onClear();
    }
  };

  const handleConfirm = async () => {
    setIsClearing(true);
    try {
      await onClear();
    } finally {
      setIsClearing(false);
      setShowConfirm(false);
    }
  };

  const btnClasses =
    size === 'xs'
      ? 'h-6 w-6 p-0 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'
      : 'h-7 w-7 p-0 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300';

  return (
    <>
      <TooltipProvider delayDuration={400}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleClick}
              disabled={disabled || isClearing}
              className={`${btnClasses} ${className}`}
              aria-label={label}
            >
              {isClearing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Eraser className="h-3.5 w-3.5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {label}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">Ryd formular?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              Dette sletter alle indtastede felter i denne formular og fjerner
              det gemte udkast. Handlingen kan ikke fortrydes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isClearing} className="mt-0">
              Annullér
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              disabled={isClearing}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isClearing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Rydder…
                </>
              ) : (
                'Ryd formular'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
