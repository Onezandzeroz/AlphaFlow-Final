'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * CancelSubscriptionDialog (FASE 6)
 *
 * A dialog component that lets the OWNER cancel their subscription. Shows:
 *   - The current plan name and access-until date (binding end / period end)
 *   - A free-text reason textarea (optional)
 *   - A two-step confirmation (must type "OPSIG" to confirm)
 *   - A clear warning that the cancellation is not a refund and that data
 *     is retained for 5 years per Bogføringsloven §10-12
 *
 * On confirm, POST /api/subscription/cancel is called. On success, the
 * dialog closes and a toast confirms the cancellation. The parent should
 * refresh the user/company context to reflect the new planStatus.
 */

interface CancelSubscriptionDialogProps {
  /** Current plan display name (e.g. "AlphaFlow Pro") */
  planName: string;
  /** ISO date string for when access ends after cancellation, or null */
  accessUntil: string | null;
  /** Called after a successful cancellation (parent should refresh state) */
  onCancelled?: () => void;
  /** Trigger button label override */
  triggerLabel?: string;
  /** Optional trigger variant — defaults to "outline" */
  triggerVariant?: 'outline' | 'destructive' | 'ghost';
  children?: React.ReactNode;
}

const CONFIRM_TEXT = 'OPSIG';

export function CancelSubscriptionDialog({
  planName,
  accessUntil,
  onCancelled,
  triggerLabel = 'Opsig abonnement',
  triggerVariant = 'outline',
  children,
}: CancelSubscriptionDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmText, setConfirmText] = useState('');

  const accessUntilFormatted = accessUntil
    ? new Date(accessUntil).toLocaleDateString('da-DK', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'udgangen af den nuværende periode';

  const canConfirm = confirmText.trim().toUpperCase() === CONFIRM_TEXT;

  async function handleCancel() {
    if (!canConfirm) return;
    setLoading(true);

    try {
      const res = await fetch('/api/subscription/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Kunne ikke opsige abonnementet.');
        return;
      }

      toast.success(
        accessUntil
          ? `Abonnementet er opsagt. Du beholder adgang indtil ${new Date(accessUntil).toLocaleDateString('da-DK')}.`
          : 'Abonnementet er opsaget.',
      );
      setOpen(false);
      setReason('');
      setConfirmText('');
      onCancelled?.();
    } catch (err) {
      console.error('[CancelSubscriptionDialog] Error:', err);
      toast.error('Netværksfejl — kunne ikke opsige abonnementet.');
    } finally {
      setLoading(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      // Reset state on close
      setReason('');
      setConfirmText('');
    }
    setOpen(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {children || (
          <Button variant={triggerVariant} className="text-red-600 border-red-200 hover:bg-red-50">
            <AlertTriangle className="h-4 w-4 mr-2" />
            {triggerLabel}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="h-5 w-5" />
            Opsig abonnement
          </DialogTitle>
          <DialogDescription>
            Du er ved at opsige dit <strong className="text-gray-900">{planName}</strong>-abonnement.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Access-until info */}
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900">
            <p className="font-medium mb-1">Du beholder adgangen indtil {accessUntilFormatted}</p>
            <p className="text-amber-800">
              Opsigelse er ikke en refusion. Du har fortsat fuld adgang til AlphaFlow indtil
              ovenstående dato. Efter udløbet deaktiveres kontoen, men dine data opbevares i
              5 år jf. Bogføringsloven §10-12.
            </p>
          </div>

          {/* Optional reason */}
          <div className="space-y-2">
            <Label htmlFor="cancel-reason" className="text-sm font-medium">
              Årsag (valgfrit)
            </Label>
            <Textarea
              id="cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Fortæl os gerne, hvorfor du opsiges — det hjælper os med at forbedre AlphaFlow."
              rows={3}
              disabled={loading}
              className="resize-none"
            />
          </div>

          {/* Type-to-confirm */}
          <div className="space-y-2">
            <Label htmlFor="cancel-confirm" className="text-sm font-medium">
              Bekræft ved at skrive <code className="px-1.5 py-0.5 bg-gray-100 rounded text-red-700 font-mono">{CONFIRM_TEXT}</code>
            </Label>
            <input
              id="cancel-confirm"
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              disabled={loading}
              autoComplete="off"
              className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder={CONFIRM_TEXT}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={loading}
          >
            Behold abonnement
          </Button>
          <Button
            variant="destructive"
            onClick={handleCancel}
            disabled={!canConfirm || loading}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Opsiger…
              </>
            ) : (
              'Opsig abonnement'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
