'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { useTranslation } from '@/lib/use-translation';
import { toast } from 'sonner';
import { Loader2, Send, Mail, CheckCircle2, XCircle } from 'lucide-react';

// ── Email type definitions ──────────────────────────────────────

interface EmailType {
  key: string;
  labelDa: string;
  labelEn: string;
  descriptionDa: string;
  descriptionEn: string;
}

const EMAIL_TYPES: EmailType[] = [
  {
    key: 'welcome',
    labelDa: 'Velkomstmail',
    labelEn: 'Welcome Email',
    descriptionDa: 'Sendes når et betalt abonnement aktiveres',
    descriptionEn: 'Sent when a paid subscription is activated',
  },
  {
    key: 'receipt',
    labelDa: 'Betalingskvittering',
    labelEn: 'Payment Receipt',
    descriptionDa: 'Kvittering med PDF-faktura efter betaling',
    descriptionEn: 'Receipt with PDF invoice after payment',
  },
  {
    key: 'pre-renewal',
    labelDa: 'Fornyelsespåmindelse',
    labelEn: 'Pre-Renewal Reminder',
    descriptionDa: 'Sendes 14/7/3/1 dage før abonnement fornyes',
    descriptionEn: 'Sent 14/7/3/1 days before subscription renews',
  },
  {
    key: 'pre-billing',
    labelDa: 'Pre-billing påmindelse',
    labelEn: 'Pre-Billing Reminder',
    descriptionDa: 'Sendes før prøveperiode konverteres til betalt abonnement',
    descriptionEn: 'Sent before trial converts to paid subscription',
  },
  {
    key: 'cancelled',
    labelDa: 'Opsigelsesbekræftelse',
    labelEn: 'Cancellation Confirmation',
    descriptionDa: 'Bekræftelse når kunden opsiger sit abonnement',
    descriptionEn: 'Confirmation when customer cancels subscription',
  },
  {
    key: 'payment-failed',
    labelDa: 'Betalingsfejl',
    labelEn: 'Payment Failed',
    descriptionDa: 'Notifikation når en fornyelsesbetaling fejler',
    descriptionEn: 'Notification when a renewal payment fails',
  },
  {
    key: 'terms-change',
    labelDa: 'Ændring af betingelser',
    labelEn: 'Terms Change Notice',
    descriptionDa: 'Informerer om ændringer i forretningsbetingelser',
    descriptionEn: 'Notifies about changes to terms of service',
  },
];

// ── Component ───────────────────────────────────────────────────

export function SystemMessagesTab() {
  const { language } = useTranslation();
  const isDa = language === 'da';

  const [emailTo, setEmailTo] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<Array<{ type: string; success: boolean; error?: string }>>([]);

  const toggleEmail = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === EMAIL_TYPES.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(EMAIL_TYPES.map((e) => e.key)));
    }
  };

  const canSend = emailTo.includes('@') && selected.size > 0 && !sending;

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    setResults([]);

    try {
      const res = await fetch('/api/oversight/test-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: emailTo,
          emails: Array.from(selected),
          language,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Fejl');
        return;
      }

      if (data.results) {
        setResults(data.results);
      }

      if (data.failed === 0) {
        toast.success(
          isDa
            ? `${data.sent} e-mail(s) sendt til ${emailTo}`
            : `${data.sent} email(s) sent to ${emailTo}`,
        );
      } else {
        toast.warning(
          isDa
            ? `${data.sent} sendt, ${data.failed} fejlede`
            : `${data.sent} sent, ${data.failed} failed`,
        );
      }
    } catch {
      toast.error(isDa ? 'Netværksfejl' : 'Network error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Email recipient ── */}
      <Card className="stat-card card-hover-lift border-0 shadow-lg dark:border dark:border-white/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Mail className="h-5 w-5 text-amber-600" />
            {isDa ? 'Send test-batch' : 'Send test batch'}
          </CardTitle>
          <CardDescription className="text-sm text-gray-500 dark:text-gray-400">
            {isDa
              ? 'Vælg hvilke systemmeddelelser der skal sendes, og angiv modtagerens e-mailadresse. Alle e-mails sendes med test-data.'
              : 'Select which system messages to send and specify the recipient email. All emails are sent with test data.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Email field */}
          <div className="space-y-2">
            <Label htmlFor="test-email-to" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {isDa ? 'Modtager (e-mail)' : 'Recipient (email)'}
            </Label>
            <Input
              id="test-email-to"
              type="email"
              placeholder="firma@eksempel.dk"
              value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
              className="max-w-md"
            />
          </div>

          <Separator />

          {/* Select all */}
          <div className="flex items-center gap-3">
            <Checkbox
              id="select-all"
              checked={selected.size === EMAIL_TYPES.length}
              onCheckedChange={toggleAll}
              className="data-[state=checked]:bg-amber-600 data-[state=checked]:border-amber-600"
            />
            <Label
              htmlFor="select-all"
              className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer select-none"
            >
              {isDa ? 'Vælg alle' : 'Select all'}
              <span className="ml-2 text-xs text-gray-400">
                ({selected.size}/{EMAIL_TYPES.length})
              </span>
            </Label>
          </div>

          <Separator />

          {/* Email type checkboxes */}
          <div className="space-y-3">
            {EMAIL_TYPES.map((email) => {
              const checked = selected.has(email.key);
              const result = results.find((r) => r.type === email.key);
              return (
                <div
                  key={email.key}
                  className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                    checked
                      ? 'border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/30'
                      : 'border-gray-100 dark:border-white/5'
                  }`}
                >
                  <Checkbox
                    id={`email-${email.key}`}
                    checked={checked}
                    onCheckedChange={() => toggleEmail(email.key)}
                    disabled={sending}
                    className="mt-0.5 data-[state=checked]:bg-amber-600 data-[state=checked]:border-amber-600"
                  />
                  <div className="flex-1 min-w-0">
                    <Label
                      htmlFor={`email-${email.key}`}
                      className="text-sm font-medium text-gray-800 dark:text-gray-200 cursor-pointer select-none"
                    >
                      {isDa ? email.labelDa : email.labelEn}
                      {result && (
                        result.success
                          ? <CheckCircle2 className="inline-block h-4 w-4 text-green-500 ml-2" />
                          : <XCircle className="inline-block h-4 w-4 text-red-500 ml-2" />
                      )}
                    </Label>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {isDa ? email.descriptionDa : email.descriptionEn}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <Separator />

          {/* Send button */}
          <Button
            onClick={send}
            disabled={!canSend}
            className="bg-amber-600 hover:bg-amber-700 text-white border-amber-600 gap-2 font-medium transition-all"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {sending
              ? (isDa ? 'Sender...' : 'Sending...')
              : (isDa ? `Send ${selected.size > 0 ? selected.size : ''} e-mail(s)` : `Send ${selected.size > 0 ? selected.size : ''} email(s)`)}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
