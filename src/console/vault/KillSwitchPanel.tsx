'use client';

/**
 * Stop AI spending now, for the estate or for one product.
 *
 * ⚠ TWO FIELDS PER PRODUCT, AND COLLAPSING THEM WOULD BREAK THE SCREEN.
 * `stopped` is that product's OWN switch; `refusing` is what the generation path
 * actually gets, which is also true while the global switch is down. Show only
 * the second and a global stop reads as four independent product stops - so an
 * operator resumes one product, sees no change, and keeps clicking. Show only
 * the first and a product that refuses every call reads as healthy.
 *
 * ⚠ THE REASON IS REQUIRED TO STOP. It is the only artefact the next operator
 * gets, and an unexplained stop is indistinguishable from one somebody forgot to
 * undo - which costs either days of no AI or spend resumed for a reason nobody
 * can recall.
 */

import { useState } from 'react';
import { OctagonX, Play } from './icons';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui';
import { Button } from './ui';
import { useToast } from './ui';
import { reportErrorToPorter } from './bridge';
import { setKillSwitch, type KillSwitchState } from './api';
import { productName } from './names';

const GLASS =
  'bg-[var(--ai-surface)] border border-[var(--ai-border)] rounded-[var(--ai-radius)]';
const FIELD =
  'w-full rounded-xl border border-[var(--ai-border)] bg-[var(--ai-surface)] px-3 py-2 text-sm text-[var(--ai-fg)] outline-none focus:border-[var(--ai-accent)] placeholder:text-[var(--ai-muted)]';

function Detail({ detail }: { detail: KillSwitchState['global']['detail'] }) {
  if (!detail) return null;

  return (
    <p className="mt-1 text-xs text-[var(--ai-muted)]">
      {detail.reason ? <span className="font-bold">{detail.reason}</span> : 'No reason was recorded.'}
      {detail.by && <> · {detail.by}</>}
      {detail.at && <> · {new Date(detail.at).toLocaleString()}</>}
    </p>
  );
}

export function KillSwitchPanel({
  state,
  onChanged,
}: {
  state: KillSwitchState;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [stopScope, setStopScope] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const act = async (scope: string, stop: boolean, why?: string) => {
    setBusy(true);
    try {
      await setKillSwitch({ scope, stop, reason: why });
      toast({
        title: stop
          ? scope === 'global'
            ? 'All AI stopped across the estate'
            : `AI stopped for ${productName(scope)}`
          : scope === 'global'
            ? 'AI resumed across the estate'
            : `AI resumed for ${productName(scope)}`,
        description: stop
          ? 'Callers fall back to their deterministic paths. Nothing is generated.'
          : undefined,
      });
      setStopScope(null);
      setReason('');
      onChanged();
    } catch (error) {
      reportErrorToPorter(error as Error);
    } finally {
      setBusy(false);
    }
  };

  const globalStopped = state.global.stopped;

  return (
    <section
      className={`${GLASS} p-5 sm:p-6 ${globalStopped ? 'ring-2 ring-red-300' : ''}`}
    >
      <h2 className="text-base font-bold text-[var(--ai-fg)] mb-1">Emergency stop</h2>
      <p className="mb-4 text-xs text-[var(--ai-muted)]">
        Stops generation immediately, with no deploy. Reach for the estate-wide stop when a key has
        leaked or a bill is running away; stop one product when only that product is misbehaving.
      </p>

      <div className="rounded-2xl border border-[var(--ai-border)] bg-[var(--ai-surface)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-[var(--ai-fg)]">
              The whole estate{' '}
              <span className={globalStopped ? 'text-[var(--ai-danger)]' : 'text-emerald-700'}>
                {globalStopped ? '- STOPPED' : '- Running'}
              </span>
            </p>
            <Detail detail={state.global.detail} />
          </div>
          {globalStopped ? (
            <Button
              onClick={() => void act('global', false)}
              disabled={busy}
              className="whitespace-nowrap"
            >
              <Play className="mr-2 h-4 w-4" />
              Resume everything
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => setStopScope('global')}
              disabled={busy}
              className="whitespace-nowrap border-red-200 text-[var(--ai-danger)]"
            >
              <OctagonX className="mr-2 h-4 w-4" />
              Stop all AI
            </Button>
          )}
        </div>
      </div>

      <div className="mt-3 divide-y divide-[var(--ai-border)] rounded-2xl border border-[var(--ai-border)] bg-[var(--ai-surface)]">
        {state.products.map((p) => (
          <div key={p.product} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="text-sm font-bold text-[var(--ai-fg)]">{productName(p.product)}</p>
              <p className="text-xs">
                {p.stopped ? (
                  <span className="font-bold text-[var(--ai-danger)]">Stopped here</span>
                ) : p.refusing ? (
                  /*
                   * ⚠ THE ASYMMETRY MADE VISIBLE. This product's own switch is
                   * up, and it still refuses every call, because the global
                   * switch is down. Resuming this product alone would do nothing.
                   */
                  <span className="font-bold text-amber-700">
                    Refusing - the estate-wide stop is on
                  </span>
                ) : (
                  <span className="text-emerald-700">Running</span>
                )}
              </p>
              <Detail detail={p.detail} />
            </div>
            {p.stopped ? (
              <button
                type="button"
                onClick={() => void act(p.product, false)}
                disabled={busy}
                className="whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold text-[var(--ai-accent)] outline-none hover:bg-[var(--ai-accent-soft)]"
              >
                Resume {productName(p.product)}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStopScope(p.product)}
                disabled={busy || p.refusing}
                title={p.refusing ? 'The estate-wide stop is already on.' : undefined}
                className="whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold text-[var(--ai-danger)] outline-none hover:bg-red-50 disabled:text-[var(--ai-muted)] disabled:hover:bg-transparent"
              >
                Stop {productName(p.product)}
              </button>
            )}
          </div>
        ))}
      </div>

      <AlertDialog open={stopScope !== null} onOpenChange={(o) => !o && setStopScope(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {stopScope === 'global'
                ? 'Stop all AI across the estate?'
                : `Stop AI for ${productName(stopScope ?? '')}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {stopScope === 'global'
                ? 'Every product stops generating immediately: Porter, MployNow, finance and Studendly. Callers fall back to their deterministic paths, so notices still go out - they just stop being written by a model.'
                : `${productName(stopScope ?? '')} stops generating immediately. Every other product keeps working.`}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="mt-2">
            <label className="block text-xs font-bold text-[var(--ai-fg)] mb-1.5" htmlFor="kill-reason">
              Why are you stopping it?
            </label>
            <input
              id="kill-reason"
              className={FIELD}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="a key leaked / the bill is running away / a runaway job"
            />
            <p className="mt-1.5 text-xs text-[var(--ai-muted)]">
              Required, and it is all the next person gets. A stop with no reason is
              indistinguishable from one somebody forgot to undo.
            </p>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Leave it running</AlertDialogCancel>
            <Button
              onClick={() => stopScope && void act(stopScope, true, reason.trim())}
              disabled={busy || reason.trim() === ''}
              className="whitespace-nowrap bg-[var(--ai-danger)] hover:bg-[var(--ai-danger)]"
            >
              {busy ? 'Stopping...' : 'Stop it now'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
