'use client';

/**
 * How long each product keeps its assistant conversations.
 *
 * ⚠ IT USED TO BE SETTABLE ONLY OVER SSH. Each window sat behind an artisan command, so MployNow
 * ran on the service's 365-day default for weeks: nobody had decided it and nobody could change it
 * without a developer. A retention period is a promise to real people about their data, so it is
 * on the screen where an admin can see whether anybody decided it, and change it.
 *
 * ⚠ "NOT DECIDED" IS SAID IN WORDS. A product with no row runs on the service default, and on a
 * screen that looks exactly like a deliberate choice - the same shape that left every spend cap
 * unarmed in production.
 *
 * ⚠ SHORTENING ERASES at the next nightly prune and cannot be undone, so it needs an explicit
 * acknowledgement before it saves.
 */

import { useState } from 'react';
import { MoreVertical } from './icons';
import { useToast } from './ui';
import { reportErrorToPorter } from './bridge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui';
import { Button } from './ui';
import {
  setVaultRetention,
  type VaultRetention,
  type VaultRetentionSummary,
} from './api';
import { productName } from './names';

const GLASS =
  'bg-[var(--ai-surface)] border border-[var(--ai-border)] rounded-[var(--ai-radius)]';
const FIELD =
  'w-full rounded-xl border border-[var(--ai-border)] bg-[var(--ai-surface)] px-3 py-2 text-sm text-[var(--ai-fg)] outline-none focus:border-[var(--ai-accent)] placeholder:text-[var(--ai-muted)]';
const LABEL = 'block text-xs font-bold text-[var(--ai-fg)] mb-1.5';

/** What is being edited: a product's default (audience null) or one audience's own window. */
interface Editing {
  product: string;
  audience: string | null;
  /** The window in force today, to know whether the change shortens it. */
  currentDays: number;
  /** Adding a new audience row: the audience name is typed rather than fixed. */
  newAudience: boolean;
}

/** Days as a person says them. */
function span(days: number): string {
  if (days % 365 === 0) return `${days / 365} year${days === 365 ? '' : 's'}`;
  if (days % 30 === 0 && days < 365) return `${days / 30} month${days === 30 ? '' : 's'}`;

  return `${days} days`;
}

export function RetentionPanel({
  retention,
  summary,
  onChanged,
}: {
  retention: VaultRetention[];
  summary: VaultRetentionSummary;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [audience, setAudience] = useState('');
  const [days, setDays] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = (next: Editing) => {
    setEditing(next);
    setAudience(next.audience ?? '');
    setDays(next.newAudience ? '' : String(next.currentDays));
    setUnderstood(false);
    setError(null);
  };

  const wanted = Number.parseInt(days, 10);
  const valid = Number.isInteger(wanted) && wanted >= 1 && wanted <= summary.max_days;
  const shortens = editing !== null && valid && wanted < editing.currentDays;

  const save = async () => {
    if (!editing) return;

    const target = editing.newAudience ? audience.trim().toLowerCase() : editing.audience;
    if (editing.newAudience && (target === null || target === '')) {
      setError('Name the audience this window is for, for example "guest".');
      return;
    }
    if (!valid) {
      setError(`Enter a whole number of days from 1 to ${summary.max_days}.`);
      return;
    }
    if (shortens && !understood) {
      setError('Tick the box to confirm. Shortening the window erases older conversations.');
      return;
    }

    setBusy(true);
    try {
      const result = await setVaultRetention({ product: editing.product, days: wanted, audience: target });
      const who = target ? `${productName(editing.product)} (${target})` : productName(editing.product);

      toast({
        title: `${who} keeps conversations for ${span(wanted)}`,
        description:
          result.erased_by_next_prune > 0
            ? `${result.erased_by_next_prune} conversation(s) are now past the window and will be erased at the next nightly prune.`
            : 'Nothing is past the new window.',
      });

      setEditing(null);
      onChanged();
    } catch (err) {
      reportErrorToPorter(err as Error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`${GLASS} p-5 sm:p-6`}>
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-1">
        <h2 className="text-base font-bold text-[var(--ai-fg)]">Conversation retention</h2>
        <p className="text-xs text-[var(--ai-muted)]">
          {summary.configured} of {summary.products} products decided
          {summary.threads_past_window > 0 && (
            <span className="font-bold text-amber-700">
              {' '}
              · {summary.threads_past_window} due for erasure tonight
            </span>
          )}
        </p>
      </div>

      <p className="mb-4 text-xs text-[var(--ai-muted)]">
        How long each product keeps assistant conversations after the last message. A product that
        nobody has decided runs on the service default of {span(summary.default_days)}. An audience
        with its own window (for example visitors who never signed in) overrides the product&apos;s.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs font-bold text-[var(--ai-muted)]">
              <th className="py-2 pr-3">Product</th>
              <th className="py-2 pr-3">Who</th>
              <th className="py-2 pr-3">Kept for</th>
              <th className="py-2 pr-3">Conversations</th>
              <th className="py-2 pr-3">State</th>
              <th className="py-2 w-12" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--ai-border)]">
            {retention.flatMap((r) => [
              <tr key={r.product}>
                <td className="py-2.5 pr-3 font-bold text-[var(--ai-fg)]">{productName(r.product)}</td>
                <td className="py-2.5 pr-3 text-[var(--ai-fg)]">
                  {r.audiences.length > 0 ? 'Everyone else' : 'Everyone'}
                </td>
                <td className="py-2.5 pr-3 text-[var(--ai-fg)]">{span(r.days)}</td>
                <td className="py-2.5 pr-3 text-[var(--ai-fg)]">
                  {r.threads_held}
                  {r.threads_past_window > 0 && (
                    <div className="text-xs text-amber-700">{r.threads_past_window} past the window</div>
                  )}
                </td>
                <td className="py-2.5 pr-3">
                  <span className={'text-xs font-bold ' + (r.configured ? 'text-emerald-700' : 'text-amber-700')}>
                    {r.configured ? 'Decided' : 'Not decided (default)'}
                  </span>
                </td>
                <td className="py-2.5">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Actions for ${productName(r.product)}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--ai-muted)] outline-none hover:bg-[var(--ai-accent-soft)]"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onSelect={() =>
                          open({ product: r.product, audience: null, currentDays: r.days, newAudience: false })
                        }
                      >
                        {r.configured ? 'Change the window' : 'Decide the window'}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() =>
                          open({ product: r.product, audience: null, currentDays: r.days, newAudience: true })
                        }
                      >
                        Set a window for one audience
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>,
              ...r.audiences.map((a) => (
                <tr key={`${r.product}:${a.audience}`}>
                  <td className="py-2.5 pr-3" />
                  <td className="py-2.5 pr-3 text-[var(--ai-fg)]">{a.audience}</td>
                  <td className="py-2.5 pr-3 text-[var(--ai-fg)]">{span(a.days)}</td>
                  <td className="py-2.5 pr-3 text-[var(--ai-fg)]">{a.threads_held}</td>
                  <td className="py-2.5 pr-3">
                    <span className="text-xs font-bold text-emerald-700">Decided</span>
                  </td>
                  <td className="py-2.5">
                    <button
                      type="button"
                      onClick={() =>
                        open({ product: r.product, audience: a.audience, currentDays: a.days, newAudience: false })
                      }
                      className="whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold text-[var(--ai-accent)] outline-none hover:bg-[var(--ai-accent-soft)]"
                    >
                      Change
                    </button>
                  </td>
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing?.newAudience
                ? `A window for one ${productName(editing?.product)} audience`
                : editing?.audience
                  ? `${productName(editing?.product)}: ${editing.audience}`
                  : `${productName(editing?.product)}: everyone`}
            </DialogTitle>
            <DialogDescription>
              Conversations are erased this many days after their last message. Lengthening it keeps
              people&apos;s conversations for longer; shortening it erases older ones at the next
              nightly prune.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {editing?.newAudience && (
              <div>
                <label className={LABEL} htmlFor="retention-audience">
                  Audience
                </label>
                <input
                  id="retention-audience"
                  className={FIELD}
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  placeholder="guest"
                />
                <p className="mt-1.5 text-xs text-[var(--ai-muted)]">
                  As the product records it: MployNow uses guest, candidate, employer, recruiter and
                  admin; Portify uses public for visitors.
                </p>
              </div>
            )}

            <div>
              <label className={LABEL} htmlFor="retention-days">
                Keep for (days)
              </label>
              <input
                id="retention-days"
                className={FIELD}
                inputMode="numeric"
                value={days}
                onChange={(e) => {
                  setDays(e.target.value);
                  setUnderstood(false);
                }}
                placeholder="365"
              />
              <p className="mt-1.5 text-xs text-[var(--ai-muted)]">
                From 1 to {summary.max_days} days.
                {editing && !editing.newAudience && <> Today: {span(editing.currentDays)}.</>}
              </p>
            </div>

            {shortens && (
              <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <input
                  type="checkbox"
                  checked={understood}
                  onChange={(e) => setUnderstood(e.target.checked)}
                  className="mt-0.5 outline-none"
                />
                <span>
                  I understand that conversations older than {span(wanted)} will be erased at the next
                  nightly prune, and that this cannot be undone.
                </span>
              </label>
            )}

            {error && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-[var(--ai-danger)]">
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} className="whitespace-nowrap">
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={busy} className="whitespace-nowrap">
              {busy ? 'Saving...' : 'Save window'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
