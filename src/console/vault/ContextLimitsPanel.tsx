'use client';

/**
 * How much the assistant reads on each turn, per product (owner 2026-11-25: "admins should be able to modify these
 * limits via the shared UI surfaces", and "it shouldn't end up affecting real-world users").
 *
 * ⚠ IT USED TO NEED A DEVELOPER. The chat window and the page details per turn were env-backed config on ai-service, and
 * the console window a Portify setting with no screen. Nothing changes until an admin saves a number here: a product
 * with no value runs on the service default, and says so in words ("Not decided"), never looking like a choice.
 *
 * ⚠ OPT-IN (`<AiVault contextLimits />`) and loaded on its own, so a product that has not wired the proxy keeps its vault.
 */

import { useCallback, useEffect, useState } from 'react';
import { MoreVertical } from './icons';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  useToast,
} from './ui';
import { reportErrorToPorter } from './bridge';
import {
  getVaultContextLimits,
  resetVaultContextLimit,
  setVaultContextLimit,
  type VaultContextLimit,
  type VaultContextLimitSpec,
} from './api';
import { productName } from './names';

const GLASS = 'bg-[var(--ai-surface)] border border-[var(--ai-border)] rounded-[var(--ai-radius)]';
const FIELD =
  'w-full rounded-xl border border-[var(--ai-border)] bg-[var(--ai-surface)] px-3 py-2 text-sm text-[var(--ai-fg)] outline-none focus:border-[var(--ai-accent)] placeholder:text-[var(--ai-muted)]';
const LABEL = 'block text-xs font-bold text-[var(--ai-fg)] mb-1.5';

const tokens = (n: number) => `${n.toLocaleString()} tokens`;
/** Roughly what a reader can picture: about four characters, or three quarters of a word, per token. */
const words = (n: number) => `about ${(Math.round((n * 0.75) / 100) * 100).toLocaleString()} words`;

export function ContextLimitsPanel() {
  const { toast } = useToast();
  const [rows, setRows] = useState<VaultContextLimit[] | null>(null);
  const [specs, setSpecs] = useState<VaultContextLimitSpec[]>([]);
  const [editing, setEditing] = useState<VaultContextLimit | null>(null);
  const [resetting, setResetting] = useState<VaultContextLimit | null>(null);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const out = await getVaultContextLimits();
      setRows(out.context_limits);
      setSpecs(out.limits);
    } catch (err) {
      reportErrorToPorter(err as Error);
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const spec = (limit: string) => specs.find((s) => s.limit === limit);
  const editingSpec = editing ? spec(editing.limit) : undefined;
  const wanted = Number.parseInt(value.replace(/[,\s]/g, ''), 10);
  const valid = editingSpec !== undefined && Number.isInteger(wanted) && wanted >= editingSpec.min && wanted <= editingSpec.max;

  const open = (row: VaultContextLimit) => {
    setEditing(row);
    setValue(String(row.tokens));
    setError(null);
  };

  const save = async () => {
    if (!editing || !editingSpec) return;
    if (!valid) {
      setError(`Enter a whole number of tokens from ${editingSpec.min.toLocaleString()} to ${editingSpec.max.toLocaleString()}.`);
      return;
    }
    setBusy(true);
    try {
      await setVaultContextLimit({ product: editing.product, limit: editing.limit, tokens: wanted });
      toast({ title: `${productName(editing.product)}: ${editing.label} set to ${tokens(wanted)}`, description: 'It applies from the next turn (within a minute).' });
      setEditing(null);
      await load();
    } catch (err) {
      reportErrorToPorter(err as Error);
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!resetting) return;
    setBusy(true);
    try {
      const out = await resetVaultContextLimit({ product: resetting.product, limit: resetting.limit });
      toast({ title: `${productName(resetting.product)}: ${resetting.label} is back on the default`, description: tokens(out.context_limit.tokens) });
      setResetting(null);
      await load();
    } catch (err) {
      reportErrorToPorter(err as Error);
    } finally {
      setBusy(false);
    }
  };

  const copy = async (row: VaultContextLimit) => {
    try {
      await navigator.clipboard.writeText(`${row.product} ${row.limit} ${row.tokens}`);
      toast({ title: 'Copied', description: `${row.product} ${row.limit} ${row.tokens}` });
    } catch (err) {
      reportErrorToPorter(err as Error);
    }
  };

  const decided = (rows ?? []).filter((r) => r.configured).length;

  return (
    <section className={`${GLASS} p-5 sm:p-6`}>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-base font-bold text-[var(--ai-fg)]">Context limits</h2>
        {rows !== null && (
          <p className="text-xs text-[var(--ai-muted)]">
            {decided} of {rows.length} decided
          </p>
        )}
      </div>
      <p className="mb-4 text-xs text-[var(--ai-muted)]">
        How much each product&apos;s assistant reads on every turn. A larger number lets it see more and costs more on every
        turn; a smaller one is cheaper and makes it summarise sooner. Nothing changes until you save a value.
      </p>

      {specs.length > 0 && (
        <ul className="mb-4 space-y-1 text-xs text-[var(--ai-muted)]">
          {specs.map((s) => (
            <li key={s.limit}>
              <strong className="text-[var(--ai-fg)]">{s.label}</strong>: {s.explains} Default {tokens(s.default_tokens)}.
            </li>
          ))}
        </ul>
      )}

      {rows === null ? (
        <p className="text-sm text-[var(--ai-muted)]">Loading...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs font-bold text-[var(--ai-muted)]">
                <th className="py-2 pr-3">Product</th>
                <th className="py-2 pr-3">Limit</th>
                <th className="py-2 pr-3">Reads</th>
                <th className="py-2 pr-3">State</th>
                <th className="w-12 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--ai-border)]">
              {rows.map((r) => (
                <tr key={`${r.product}:${r.limit}`}>
                  <td className="py-2.5 pr-3 font-bold text-[var(--ai-fg)]">{productName(r.product)}</td>
                  <td className="py-2.5 pr-3 text-[var(--ai-fg)]">{r.label}</td>
                  <td className="py-2.5 pr-3 text-[var(--ai-fg)]">
                    {tokens(r.tokens)}
                    <div className="text-xs text-[var(--ai-muted)]">{words(r.tokens)}</div>
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className={'text-xs font-bold ' + (r.configured ? 'text-emerald-700' : 'text-amber-700')}>
                      {r.configured ? 'Decided' : 'Not decided (default)'}
                    </span>
                    {r.clamped && <div className="text-xs text-amber-700">Saved value was outside the range; using {tokens(r.tokens)}</div>}
                  </td>
                  <td className="py-2.5">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label={`Actions for ${productName(r.product)} ${r.label}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--ai-muted)] outline-none hover:bg-[var(--ai-accent-soft)]"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => open(r)}>{r.configured ? 'Change' : 'Decide'}</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => void copy(r)}>Copy</DropdownMenuItem>
                        {r.configured && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-red-600" onSelect={() => setResetting(r)}>
                              Reset to default
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {productName(editing?.product)}: {editing?.label}
            </DialogTitle>
            <DialogDescription>{editingSpec?.explains}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className={LABEL} htmlFor="context-limit-tokens">
                Tokens
              </label>
              <input
                id="context-limit-tokens"
                className={FIELD}
                inputMode="numeric"
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setError(null);
                }}
              />
              {editingSpec && (
                <p className="mt-1.5 text-xs text-[var(--ai-muted)]">
                  From {editingSpec.min.toLocaleString()} to {editingSpec.max.toLocaleString()}. Default {tokens(editingSpec.default_tokens)}.
                  {valid && <> That is {words(wanted)}.</>}
                </p>
              )}
            </div>
            {error && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-[var(--ai-danger)]">{error}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} className="whitespace-nowrap">
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={busy} className="whitespace-nowrap">
              {busy ? 'Saving...' : 'Save limit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={resetting !== null} onOpenChange={(o) => !o && setResetting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset to the default?</AlertDialogTitle>
            <AlertDialogDescription>
              {productName(resetting?.product)}&apos;s {resetting?.label.toLowerCase()} goes back to the service default of{' '}
              {resetting ? tokens(resetting.default_tokens) : ''}, and shows as not decided.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setResetting(null)} disabled={busy}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => void reset()} disabled={busy}>
              {busy ? 'Resetting...' : 'Reset'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
