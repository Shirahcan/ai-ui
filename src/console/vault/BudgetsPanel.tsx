'use client';

/**
 * Spend thresholds, per product.
 *
 * ⚠ THE PRODUCTS WITH NO CAP ARE THE POINT OF THIS PANEL. `ai_budget_limits` was
 * EMPTY on production, so the hard cap could never fire for anybody - and from
 * every product's side "no cap" and "a generous cap" look identical, because the
 * AI simply never refuses. The row has to say "no cap" in words.
 *
 * ⚠ A CAP IS NOT A DEFENCE AGAINST A RUNAWAY LOOP, and this panel must not imply
 * it is. Both thresholds measure MONEY, which only accumulates after the
 * requests have already been made. The service's per-product rate limit is what
 * catches a loop in its first minutes.
 */

import { useState } from 'react';
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
import { Button } from './ui';
import { money, setVaultBudget, toMicros, type VaultBudget } from './api';
import { productName } from './names';

const GLASS =
  'bg-[var(--ai-surface)] border border-[var(--ai-border)] rounded-[var(--ai-radius)]';
const FIELD =
  'w-full rounded-xl border border-[var(--ai-border)] bg-[var(--ai-surface)] px-3 py-2 text-sm text-[var(--ai-fg)] outline-none focus:border-[var(--ai-accent)] placeholder:text-[var(--ai-muted)]';
const LABEL = 'block text-xs font-bold text-[var(--ai-fg)] mb-1.5';

const dollars = (micros: number | null) =>
  micros === null ? '' : String(Math.round(micros / 10_000) / 100);

export function BudgetsPanel({
  budgets,
  summary,
  onChanged,
}: {
  budgets: VaultBudget[];
  summary: { products: number; armed: number; refusing: number };
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState<VaultBudget | null>(null);
  const [soft, setSoft] = useState('');
  const [hard, setHard] = useState('');
  const [notify, setNotify] = useState('');
  const [period, setPeriod] = useState<'day' | 'month'>('month');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = (budget: VaultBudget) => {
    setEditing(budget);
    setSoft(dollars(budget.soft_micros));
    setHard(dollars(budget.hard_micros));
    setNotify(budget.notify_to ?? '');
    setPeriod(budget.period ?? 'month');
    setError(null);
  };

  const save = async () => {
    if (!editing) return;

    const softMicros = toMicros(soft);
    const hardMicros = toMicros(hard);

    if (soft.trim() !== '' && softMicros === null) {
      setError('The warn-at figure has to be a number of dollars, or empty.');
      return;
    }
    if (hard.trim() !== '' && hardMicros === null) {
      setError('The stop-at figure has to be a number of dollars, or empty.');
      return;
    }
    if (softMicros !== null && hardMicros !== null && softMicros > hardMicros) {
      /*
       * Caught here as well as on the service, because the explanation is what
       * the operator needs: a soft cap above the hard one can never alert, since
       * the hard cap refuses first.
       */
      setError('Warn at a figure BELOW the stop-at one, or the warning can never arrive.');
      return;
    }
    if ((softMicros !== null || hardMicros !== null) && notify.trim() === '') {
      setError('Give an address to alert. A threshold with nowhere to warn is not a control.');
      return;
    }

    setBusy(true);
    try {
      await setVaultBudget({
        product: editing.product,
        period,
        soft_micros: softMicros,
        hard_micros: hardMicros,
        notify_to: notify.trim() === '' ? null : notify.trim(),
      });

      toast({
        title:
          softMicros === null && hardMicros === null
            ? `${productName(editing.product)} has no spend cap`
            : `Spend thresholds saved for ${productName(editing.product)}`,
        description:
          hardMicros === null
            ? 'Nothing will be refused on cost; the alert is the whole control.'
            : 'Over the stop-at figure, that product is refused until a human raises it.',
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
        <h2 className="text-base font-bold text-[var(--ai-fg)]">Spend caps</h2>
        <p className="text-xs text-[var(--ai-muted)]">
          {summary.armed} of {summary.products} products capped
          {summary.refusing > 0 && (
            <span className="font-bold text-[var(--ai-danger)]"> · {summary.refusing} refusing now</span>
          )}
        </p>
      </div>

      {summary.armed === 0 && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          No product has a cap, so no AI spend in the estate will ever be refused on cost. That was
          the state on production while six tests covered a control nothing could trigger. A cap
          needs two figures and an address: warn at one, stop at a higher one.
        </p>
      )}

      <p className="mb-4 text-xs text-[var(--ai-muted)]">
        Caps measure money, which only lands after the calls were made. They are the backstop, not
        the thing that catches a runaway loop - the service&apos;s per-minute limit does that.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs font-bold text-[var(--ai-muted)]">
              <th className="py-2 pr-3">Product</th>
              <th className="py-2 pr-3">Spent</th>
              <th className="py-2 pr-3">Warn at</th>
              <th className="py-2 pr-3">Stop at</th>
              <th className="py-2 pr-3">Alerts to</th>
              <th className="py-2 pr-3">State</th>
              <th className="py-2 w-16" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--ai-border)]">
            {budgets.map((b) => (
              <tr key={b.product}>
                <td className="py-2.5 pr-3 font-bold text-[var(--ai-fg)]">{productName(b.product)}</td>
                <td className="py-2.5 pr-3 text-[var(--ai-fg)]">{money(b.spend_micros)}</td>
                <td className="py-2.5 pr-3 text-[var(--ai-fg)]">{money(b.soft_micros)}</td>
                <td className="py-2.5 pr-3 text-[var(--ai-fg)]">{money(b.hard_micros)}</td>
                <td className="py-2.5 pr-3 text-xs text-[var(--ai-muted)]">{b.notify_to ?? '-'}</td>
                <td className="py-2.5 pr-3">
                  <span
                    className={
                      'text-xs font-bold ' +
                      (b.refusing
                        ? 'text-[var(--ai-danger)]'
                        : b.armed
                          ? 'text-emerald-700'
                          : 'text-amber-700')
                    }
                  >
                    {b.refusing ? 'Refusing' : b.armed ? 'Within budget' : 'No cap'}
                  </span>
                  {b.armed && b.hard_micros === null && (
                    <div className="text-xs text-[var(--ai-muted)]">Alert only</div>
                  )}
                </td>
                <td className="py-2.5">
                  <button
                    type="button"
                    onClick={() => open(b)}
                    className="whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold text-[var(--ai-accent)] outline-none hover:bg-[var(--ai-accent-soft)]"
                  >
                    {b.armed ? 'Change' : 'Set a cap'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Spend thresholds for {productName(editing?.product)}</DialogTitle>
            <DialogDescription>
              Warning and stopping are different jobs. The warning is advisory and the product keeps
              working - a consultant mid-filing should not lose Porter because the month ran hot.
              The stop refuses every call and is the buffer until somebody acts.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <span className={LABEL}>Measured over</span>
              <div className="flex gap-2">
                {(['month', 'day'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPeriod(p)}
                    className={
                      'whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold outline-none ' +
                      (period === p
                        ? 'bg-[var(--ai-accent)] text-white'
                        : 'bg-[var(--ai-surface)] border border-[var(--ai-border)] text-[var(--ai-muted)]')
                    }
                  >
                    {p === 'month' ? 'This calendar month' : 'Today'}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={LABEL} htmlFor="budget-soft">
                  Warn at (CAD)
                </label>
                <input
                  id="budget-soft"
                  className={FIELD}
                  inputMode="decimal"
                  value={soft}
                  onChange={(e) => setSoft(e.target.value)}
                  placeholder="Leave empty for none"
                />
              </div>
              <div>
                <label className={LABEL} htmlFor="budget-hard">
                  Stop at (CAD)
                </label>
                <input
                  id="budget-hard"
                  className={FIELD}
                  inputMode="decimal"
                  value={hard}
                  onChange={(e) => setHard(e.target.value)}
                  placeholder="Leave empty for none"
                />
              </div>
            </div>

            <div>
              <label className={LABEL} htmlFor="budget-notify">
                Alert this address
              </label>
              <input
                id="budget-notify"
                className={FIELD}
                type="email"
                value={notify}
                onChange={(e) => setNotify(e.target.value)}
                placeholder="who reads this?"
              />
              <p className="mt-1.5 text-xs text-[var(--ai-muted)]">
                The warning gates nothing, so this alert IS the whole control. An address nobody
                reads makes the warning look like protection while spend runs.
              </p>
            </div>

            {editing && money(editing.spend_micros) !== '-' && (
              <p className="text-xs text-[var(--ai-muted)]">
                {productName(editing.product)} has spent {money(editing.spend_micros)} so far this{' '}
                {editing.period ?? 'month'}.
              </p>
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
              {busy ? 'Saving...' : 'Save thresholds'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
