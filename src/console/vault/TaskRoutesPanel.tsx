'use client';

/**
 * Which models each AI task tries first, in order.
 *
 * ⚠ IT WAS A PHP ARRAY UNTIL 2026-10-29. Moving Porter's data agent from Gemini
 * to Claude, or a case-verdict tier from Haiku to Sonnet, took a developer and a
 * deploy of ai-service (and, for the verdict, of Portify too). Which model reads
 * a client's file is a cost-and-quality decision that moves with prices and
 * credits, so it is on this screen where an admin can change it alone.
 *
 * ⚠ "NOT DECIDED" IS SAID IN WORDS, like retention: an undecided route runs on
 * the shipped default, and on a screen that looks exactly like a choice.
 *
 * ⚠ A RUNG WITH NO KEY IS SAID IN WORDS TOO. The walk skips a model the vault
 * holds no enabled key for, silently, so a route can read "Claude first" while
 * Claude is never tried. The panel marks those rungs rather than letting an
 * admin believe a route is live.
 */

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, MoreVertical, Plus, X } from './icons';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui';
import { Button } from './ui';
import {
  resetVaultTaskRoute,
  setVaultTaskRoute,
  type VaultCredential,
  type VaultRouteStep,
  type VaultTaskRoute,
  type VaultTaskRouteSummary,
} from './api';
import { providerName } from './names';

const GLASS = 'bg-[var(--ai-surface)] border border-[var(--ai-border)] rounded-[var(--ai-radius)]';
const FIELD =
  'w-full rounded-xl border border-[var(--ai-border)] bg-[var(--ai-surface)] px-3 py-2 text-sm text-[var(--ai-fg)] outline-none focus:border-[var(--ai-accent)]';
const ICON_BUTTON =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--ai-muted)] outline-none hover:bg-[var(--ai-accent-soft)] disabled:opacity-30';

/** What a route is FOR, in an admin's words. A key not listed here shows as itself. */
const ROUTE_NAMES: Record<string, string> = {
  _default: 'Every other task',
  'query.agent': 'Porter data questions',
  job_description: 'Job description drafts',
  job_description_options: 'Job description options',
  'assess.case.outcome:base': 'Case verdict (free, proactive)',
  'assess.case.outcome:standard': 'Case verdict, paid: routine case',
  'assess.case.outcome:moderate': 'Case verdict, paid: some complexity',
  'assess.case.outcome:deep': 'Case verdict, paid: complex case',
};

const routeName = (key: string) => ROUTE_NAMES[key] ?? key;

/** "Claude claude-haiku-5-5", or "Gemini (any model)". */
const rungName = (step: VaultRouteStep) => `${providerName(step.provider)} ${step.model ?? '(any model)'}`;

/** A select value that round-trips provider and model. */
const encode = (step: VaultRouteStep) => `${step.provider}|${step.model ?? ''}`;
const decode = (value: string): VaultRouteStep => {
  const [provider = '', model = ''] = value.split('|');
  return { provider, model: model === '' ? null : model };
};

function Ladder({ steps }: { steps: VaultRouteStep[] }) {
  if (steps.length === 0) {
    return <span className="text-xs text-[var(--ai-muted)]">No preference: the normal order</span>;
  }

  return (
    <ol className="flex flex-wrap items-center gap-1.5">
      {steps.map((step, i) => (
        <li
          key={`${encode(step)}:${i}`}
          className={
            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ' +
            (step.available === false
              ? 'border-amber-200 bg-amber-50 text-amber-800'
              : 'border-[var(--ai-border)] bg-[var(--ai-surface)] text-[var(--ai-fg)]')
          }
        >
          <span className="font-bold text-[var(--ai-accent)]">{i + 1}</span>
          <span>{rungName(step)}</span>
          {step.available === false && <span className="font-bold">no key, skipped</span>}
        </li>
      ))}
    </ol>
  );
}

export function TaskRoutesPanel({
  routes,
  summary,
  credentials,
  onChanged,
}: {
  routes: VaultTaskRoute[];
  summary: VaultTaskRouteSummary;
  credentials: VaultCredential[];
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState<VaultTaskRoute | null>(null);
  const [draft, setDraft] = useState<VaultRouteStep[]>([]);
  const [resetting, setResetting] = useState<VaultTaskRoute | null>(null);
  const [busy, setBusy] = useState(false);

  /** Every model the vault can actually serve, one option per provider and model. */
  const options = useMemo(() => {
    const seen = new Map<string, VaultRouteStep>();

    for (const c of credentials) {
      if (c.kind !== 'generation' || !c.enabled) continue;
      const step = { provider: c.provider, model: c.model };
      seen.set(encode(step), step);
    }

    return [...seen.values()].sort((a, b) => rungName(a).localeCompare(rungName(b)));
  }, [credentials]);

  const open = (route: VaultTaskRoute) => {
    setEditing(route);
    setDraft(route.steps.map(({ provider, model }) => ({ provider, model })));
  };

  /** The options for one rung: everything the vault serves, plus the rung's own value if it does not. */
  const optionsFor = (step: VaultRouteStep) =>
    options.some((o) => encode(o) === encode(step)) ? options : [step, ...options];

  const move = (from: number, to: number) => {
    setDraft((current) => {
      const next = [...current];
      const [item] = next.splice(from, 1);
      if (item) next.splice(to, 0, item);
      return next;
    });
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: 'Route key copied' });
    } catch (error) {
      // A clipboard failure is not an API error, so Porter has to be told.
      reportErrorToPorter(error as Error);
    }
  };

  const save = async () => {
    if (!editing) return;
    if (draft.length === 0) {
      reportErrorToPorter('A route needs at least one model. Reset it instead to use the default.');
      return;
    }

    setBusy(true);
    try {
      await setVaultTaskRoute({ route_key: editing.route_key, steps: draft });
      toast({
        title: `${routeName(editing.route_key)} saved`,
        description: draft[0] ? `Tries ${rungName(draft[0])} first from the next call.` : undefined,
      });
      setEditing(null);
      onChanged();
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
      await resetVaultTaskRoute(resetting.route_key);
      toast({
        title: `${routeName(resetting.route_key)} is back on the default`,
      });
      setResetting(null);
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
        <h2 className="text-base font-bold text-[var(--ai-fg)]">Task routing</h2>
        <p className="text-xs text-[var(--ai-muted)]">
          {summary.configured} of {summary.routes} routes decided
          {summary.unavailable_rungs > 0 && (
            <span className="font-bold text-amber-700">
              {' '}
              and {summary.unavailable_rungs} model
              {summary.unavailable_rungs === 1 ? '' : 's'} with no key
            </span>
          )}
        </p>
      </div>

      <p className="mb-4 text-xs text-[var(--ai-muted)]">
        Which models a task tries first, in order. Every other key still follows behind, so a model that fails or runs
        out of credit falls through to the next one. A route nobody has decided runs on the shipped default, and a task
        with no route of its own follows Every other task.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs font-bold text-[var(--ai-muted)]">
              <th className="py-2 pr-3">Task</th>
              <th className="py-2 pr-3">Tries first</th>
              <th className="py-2 pr-3">State</th>
              <th className="py-2 w-12" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--ai-border)]">
            {routes.map((route) => (
              <tr key={route.route_key}>
                <td className="py-2.5 pr-3 align-top">
                  <div className="font-bold text-[var(--ai-fg)]">{routeName(route.route_key)}</div>
                  <div className="text-xs text-[var(--ai-muted)]">{route.route_key}</div>
                </td>
                <td className="py-2.5 pr-3 align-top">
                  <Ladder steps={route.steps} />
                </td>
                <td className="py-2.5 pr-3 align-top">
                  <span className={'text-xs font-bold ' + (route.configured ? 'text-emerald-700' : 'text-amber-700')}>
                    {route.configured ? 'Decided' : 'Not decided (default)'}
                  </span>
                  {route.configured && route.set_by && <div className="text-xs text-[var(--ai-muted)]">{route.set_by}</div>}
                </td>
                <td className="py-2.5 align-top">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Actions for ${routeName(route.route_key)}`}
                        className={ICON_BUTTON}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => open(route)}>
                        {route.configured ? 'Change the order' : 'Decide the order'}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => void copy(route.route_key)}>Copy route key</DropdownMenuItem>
                      {route.configured && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-[var(--ai-danger)]" onSelect={() => setResetting(route)}>
                            Reset to the default
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

      {/* The shared DialogContent keeps max-h-[90vh] overflow-y-auto, so a long ladder scrolls on a short screen. */}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? routeName(editing.route_key) : ''}</DialogTitle>
            <DialogDescription>
              The first model is tried first. If it fails, is out of credit or has no key, the next one is tried, then
              every other key in the vault.
            </DialogDescription>
          </DialogHeader>

          <ol className="space-y-2">
            {draft.map((step, i) => (
              <li key={`${encode(step)}:${i}`} className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-center text-sm font-bold text-[var(--ai-accent)]">{i + 1}</span>
                <select
                  aria-label={`Model ${i + 1}`}
                  className={FIELD}
                  value={encode(step)}
                  onChange={(e) => setDraft((current) => current.map((s, j) => (j === i ? decode(e.target.value) : s)))}
                >
                  {optionsFor(step).map((o) => (
                    <option key={encode(o)} value={encode(o)}>
                      {rungName(o)}
                      {options.some((x) => encode(x) === encode(o)) ? '' : ' (no key)'}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  aria-label="Move up"
                  className={ICON_BUTTON}
                  disabled={i === 0}
                  onClick={() => move(i, i - 1)}
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Move down"
                  className={ICON_BUTTON}
                  disabled={i === draft.length - 1}
                  onClick={() => move(i, i + 1)}
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Remove"
                  className={ICON_BUTTON}
                  onClick={() => setDraft((current) => current.filter((_, j) => j !== i))}
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ol>

          {draft.length < 8 && options.length > 0 && (
            <button
              type="button"
              onClick={() => setDraft((current) => (options[0] ? [...current, options[0]] : current))}
              className="inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold text-[var(--ai-accent)] outline-none hover:bg-[var(--ai-accent-soft)]"
            >
              <Plus className="h-3.5 w-3.5" />
              Add a model
            </button>
          )}

          {editing && editing.default_steps.length > 0 && (
            <p className="text-xs text-[var(--ai-muted)]">Default: {editing.default_steps.map(rungName).join(', then ')}.</p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} className="whitespace-nowrap">
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={busy || draft.length === 0} className="whitespace-nowrap">
              {busy ? 'Saving...' : 'Save order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={resetting !== null} onOpenChange={(o) => !o && setResetting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset {resetting ? routeName(resetting.route_key) : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              The decided order is removed and the task goes back to the shipped default
              {resetting && resetting.default_steps.length > 0
                ? `: ${resetting.default_steps.map(rungName).join(', then ')}`
                : ''}
              .
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="whitespace-nowrap">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void reset();
              }}
              disabled={busy}
              className="whitespace-nowrap bg-[var(--ai-danger)] hover:bg-[var(--ai-danger)]"
            >
              {busy ? 'Resetting...' : 'Reset to the default'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
