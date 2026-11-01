'use client';

/**
 * What each AI provider charges, as the spend caps and usage reports price it.
 *
 * ⚠ IT WAS THREE PHP ARRAYS IN ai-service UNTIL 2026-10-29, so when a provider
 * changed a price the caps and reports stayed wrong until a developer deployed.
 * A price is a changeable fact about money, so an admin sets it here.
 *
 * ⚠ ADDED, NEVER EDITED, NEVER BACK-DATED. A change is a new price from a date.
 * Every call already recorded keeps the cost it was charged at, so a back-dated
 * price could only make this screen disagree with the ledger.
 *
 * ⚠ AN UNPRICED PAID KEY IS SAID FIRST, IN WORDS. Its spend records as $0 and no
 * cap ever sees it, which looks exactly like a free key on every other screen.
 */

import { useState } from 'react';
import { AlertTriangle, MoreVertical, Plus } from './icons';
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
  addVaultRate,
  deleteVaultRate,
  type NewVaultRate,
  type RateKind,
  type VaultRate,
  type VaultRateEntry,
  type VaultUnpricedKey,
} from './api';
import { providerName } from './names';

const GLASS = 'bg-[var(--ai-surface)] border border-[var(--ai-border)] rounded-[var(--ai-radius)]';
const FIELD =
  'w-full rounded-xl border border-[var(--ai-border)] bg-[var(--ai-surface)] px-3 py-2 text-sm text-[var(--ai-fg)] outline-none focus:border-[var(--ai-accent)] placeholder:text-[var(--ai-muted)]';
const LABEL = 'block text-xs font-bold text-[var(--ai-fg)] mb-1.5';

const KIND_NAMES: Record<RateKind, string> = {
  tokens: 'Model',
  search: 'Web search',
  transcription: 'Transcription',
};

/*
 * Units. Stored values are micro-dollars; people think in $ per 1M tokens,
 * $ per 1,000 searches and $ per hour of audio. Tokens and searches share a
 * factor (micros per 1K tokens = $ per 1M x 1000; micros per call = $ per 1,000 calls x 1000).
 */
const PER_THOUSAND = 1_000;
const PER_HOUR = 1_000_000;

const dollars = (micros: number, factor: number) =>
  `$${(micros / factor).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;

const toMicros = (value: string, factor: number): number | null => {
  const n = Number(value);
  return value.trim() !== '' && Number.isFinite(n) && n >= 0 ? Math.round(n * factor) : null;
};

const fromMicros = (micros: number | null | undefined, factor: number) =>
  micros === null || micros === undefined ? '' : String(micros / factor);

/** One price in plain words, in the units a person would quote it in. */
function priceText(kind: RateKind, e: VaultRateEntry): string {
  if (kind === 'tokens') {
    const base = `${dollars(e.in ?? 0, PER_THOUSAND)} in, ${dollars(e.out ?? 0, PER_THOUSAND)} out per 1M tokens`;
    return e.long
      ? `${base}; above ${e.long.above.toLocaleString()} tokens ${dollars(e.long.in, PER_THOUSAND)} in, ${dollars(e.long.out, PER_THOUSAND)} out`
      : base;
  }
  if (kind === 'search') {
    const basic = `${dollars(e.basic ?? 0, PER_THOUSAND)} per 1,000 searches`;
    return e.advanced !== null ? `${basic}, ${dollars(e.advanced, PER_THOUSAND)} advanced` : basic;
  }
  return `${dollars(e.per_hour ?? 0, PER_HOUR)} per hour of audio`;
}

const today = () => new Date().toISOString().slice(0, 10);

interface Draft {
  kind: RateKind;
  match: string;
  /** False when the row is fixed (setting a new price for something already listed). */
  editableName: boolean;
  from: string;
  input: string;
  output: string;
  longOn: boolean;
  longAbove: string;
  longIn: string;
  longOut: string;
  basic: string;
  advanced: string;
  perHour: string;
}

const blank = (kind: RateKind, match: string, editableName: boolean, from?: VaultRateEntry | null): Draft => ({
  kind,
  match,
  editableName,
  from: today(),
  input: fromMicros(from?.in, PER_THOUSAND),
  output: fromMicros(from?.out, PER_THOUSAND),
  longOn: !!from?.long,
  longAbove: from?.long ? String(from.long.above) : '',
  longIn: fromMicros(from?.long?.in, PER_THOUSAND),
  longOut: fromMicros(from?.long?.out, PER_THOUSAND),
  basic: fromMicros(from?.basic, PER_THOUSAND),
  advanced: fromMicros(from?.advanced, PER_THOUSAND),
  perHour: fromMicros(from?.per_hour, PER_HOUR),
});

/** The price set HERE that a "remove" acts on: a pending one first, else today's. */
const removable = (rate: VaultRate): VaultRateEntry | null =>
  rate.next?.source === 'set' ? rate.next : rate.current?.source === 'set' ? rate.current : null;

export function RatesPanel({
  rates,
  unpriced,
  onChanged,
}: {
  rates: VaultRate[];
  unpriced: VaultUnpricedKey[];
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [removing, setRemoving] = useState<{
    rate: VaultRate;
    entry: VaultRateEntry;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = (next: Draft) => {
    setDraft(next);
    setError(null);
  };

  const change = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: 'Name copied' });
    } catch (err) {
      // A clipboard failure is not an API error, so Porter has to be told.
      reportErrorToPorter(err as Error);
    }
  };

  /** Build the request, or say in words what is missing. */
  const build = (d: Draft): NewVaultRate | string => {
    const match = d.match.trim().toLowerCase();
    if (match === '') return 'Name the model (or its prefix, for example claude-haiku-5) or the provider.';
    if (d.from < today()) return 'A price starts today or later. Spend already recorded keeps its price.';

    const base = { kind: d.kind, match, effective_from: d.from };

    if (d.kind === 'tokens') {
      const inMicros = toMicros(d.input, PER_THOUSAND);
      const outMicros = toMicros(d.output, PER_THOUSAND);
      if (inMicros === null || outMicros === null) return 'Enter both the input and the output price per 1M tokens.';
      if (!d.longOn) return { ...base, in_micros: inMicros, out_micros: outMicros };

      const above = Number.parseInt(d.longAbove, 10);
      const longIn = toMicros(d.longIn, PER_THOUSAND);
      const longOut = toMicros(d.longOut, PER_THOUSAND);
      if (!Number.isInteger(above) || above < 1 || longIn === null || longOut === null) {
        return 'Complete the long-prompt band: the token threshold and both prices.';
      }
      return {
        ...base,
        in_micros: inMicros,
        out_micros: outMicros,
        long_above_tokens: above,
        long_in_micros: longIn,
        long_out_micros: longOut,
      };
    }

    if (d.kind === 'search') {
      const basic = toMicros(d.basic, PER_THOUSAND);
      if (basic === null) return 'Enter the price per 1,000 searches.';
      const advanced = toMicros(d.advanced, PER_THOUSAND);
      return advanced === null
        ? { ...base, basic_micros: basic }
        : { ...base, basic_micros: basic, advanced_micros: advanced };
    }

    const perHour = toMicros(d.perHour, PER_HOUR);
    if (perHour === null) return 'Enter the price per hour of audio.';
    return { ...base, per_hour_micros: perHour };
  };

  const save = async () => {
    if (!draft) return;
    const payload = build(draft);
    if (typeof payload === 'string') {
      setError(payload);
      return;
    }

    setBusy(true);
    try {
      await addVaultRate(payload);
      toast({
        title: `Price saved for ${payload.match}`,
        description:
          payload.effective_from === today()
            ? 'New spend is priced at it from now.'
            : `It applies from ${payload.effective_from}.`,
      });
      setDraft(null);
      onChanged();
    } catch (err) {
      reportErrorToPorter(err as Error);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!removing?.entry.id) return;

    setBusy(true);
    try {
      await deleteVaultRate(removing.entry.id);
      toast({ title: `Price removed for ${removing.rate.match}` });
      setRemoving(null);
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
        <h2 className="text-base font-bold text-[var(--ai-fg)]">Prices</h2>
        <button
          type="button"
          onClick={() => open(blank('tokens', '', true))}
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold text-[var(--ai-accent)] outline-none hover:bg-[var(--ai-accent-soft)]"
        >
          <Plus className="h-3.5 w-3.5" />
          Add a price
        </button>
      </div>

      <p className="mb-4 text-xs text-[var(--ai-muted)]">
        What each provider charges, as the spend caps and usage reports price it. A price applies from its start date;
        every call already recorded keeps the price it was charged at.
      </p>

      {unpriced.length > 0 && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <p className="mb-2 flex items-center gap-1.5 font-bold">
            <AlertTriangle className="h-4 w-4" />
            {unpriced.length === 1 ? 'A paid key has no price' : `${unpriced.length} paid keys have no price`}
          </p>
          <p className="mb-2">Their spend records as $0, so no spend cap or report sees it.</p>
          <ul className="space-y-1">
            {unpriced.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {providerName(k.provider)} {k.model ?? `(${k.kind})`}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    open(
                      k.kind === 'search'
                        ? blank('search', k.provider, false)
                        : k.kind === 'transcription'
                          ? blank('transcription', k.provider, false)
                          : blank('tokens', k.model ?? '', true),
                    )
                  }
                  className="whitespace-nowrap rounded-full bg-[var(--ai-surface)] px-3 py-1 font-bold text-amber-900 outline-none hover:bg-amber-100"
                >
                  Set a price
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="text-left text-xs font-bold text-[var(--ai-muted)]">
              <th className="py-2 pr-3">Priced for</th>
              <th className="py-2 pr-3">Price today</th>
              <th className="py-2 pr-3">Set by</th>
              <th className="py-2 w-12" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--ai-border)]">
            {rates.map((rate) => {
              const target = removable(rate);

              return (
                <tr key={`${rate.kind}:${rate.match}`}>
                  <td className="py-2.5 pr-3 align-top">
                    <div className="font-bold text-[var(--ai-fg)]">{rate.match}</div>
                    <div className="text-xs text-[var(--ai-muted)]">{KIND_NAMES[rate.kind]}</div>
                  </td>
                  <td className="py-2.5 pr-3 align-top text-[var(--ai-fg)]">
                    {rate.current ? (
                      priceText(rate.kind, rate.current)
                    ) : (
                      <span className="text-amber-700">No price in force</span>
                    )}
                    {rate.next && (
                      <div className="text-xs text-[var(--ai-accent)]">
                        From {rate.next.from}: {priceText(rate.kind, rate.next)}
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 align-top">
                    {rate.current?.source === 'set' ? (
                      <span className="text-xs text-[var(--ai-fg)]">{rate.current.set_by ?? 'Set here'}</span>
                    ) : (
                      <span className="text-xs text-[var(--ai-muted)]">Shipped default</span>
                    )}
                    {rate.current && <div className="text-xs text-[var(--ai-muted)]">since {rate.current.from}</div>}
                  </td>
                  <td className="py-2.5 align-top">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label={`Actions for ${rate.match}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--ai-muted)] outline-none hover:bg-[var(--ai-accent-soft)]"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => open(blank(rate.kind, rate.match, false, rate.next ?? rate.current))}
                        >
                          Set a new price
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => void copy(rate.match)}>Copy name</DropdownMenuItem>
                        {target && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-[var(--ai-danger)]"
                              onSelect={() => setRemoving({ rate, entry: target })}
                            >
                              Remove the price set here
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* The shared DialogContent keeps max-h-[90vh] overflow-y-auto, so the long-prompt band still fits a short screen. */}
      <Dialog open={draft !== null} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft?.editableName ? 'Add a price' : `New price for ${draft?.match ?? ''}`}</DialogTitle>
            <DialogDescription>
              The price applies from its start date. Calls already recorded keep the price they were charged at.
            </DialogDescription>
          </DialogHeader>

          {draft && (
            <div className="space-y-4">
              {draft.editableName && (
                <>
                  <div>
                    <label className={LABEL} htmlFor="rate-kind">
                      What is priced
                    </label>
                    <select
                      id="rate-kind"
                      className={FIELD}
                      value={draft.kind}
                      onChange={(e) => change({ kind: e.target.value as RateKind })}
                    >
                      <option value="tokens">A model (per token)</option>
                      <option value="search">A web search provider (per search)</option>
                      <option value="transcription">A transcription provider (per hour)</option>
                    </select>
                  </div>
                  <div>
                    <label className={LABEL} htmlFor="rate-match">
                      {draft.kind === 'tokens' ? 'Model name or prefix' : 'Provider'}
                    </label>
                    <input
                      id="rate-match"
                      className={FIELD}
                      value={draft.match}
                      onChange={(e) => change({ match: e.target.value })}
                      placeholder={draft.kind === 'tokens' ? 'claude-haiku-5' : 'tavily'}
                    />
                    {draft.kind === 'tokens' && (
                      <p className="mt-1.5 text-xs text-[var(--ai-muted)]">
                        A prefix covers every model that starts with it. The longest matching name wins.
                      </p>
                    )}
                  </div>
                </>
              )}

              <div>
                <label className={LABEL} htmlFor="rate-from">
                  Applies from
                </label>
                <input
                  id="rate-from"
                  type="date"
                  className={FIELD}
                  min={today()}
                  value={draft.from}
                  onChange={(e) => change({ from: e.target.value })}
                />
              </div>

              {draft.kind === 'tokens' && (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className={LABEL} htmlFor="rate-in">
                        Input, $ per 1M tokens
                      </label>
                      <input
                        id="rate-in"
                        className={FIELD}
                        inputMode="decimal"
                        value={draft.input}
                        onChange={(e) => change({ input: e.target.value })}
                        placeholder="0.10"
                      />
                    </div>
                    <div>
                      <label className={LABEL} htmlFor="rate-out">
                        Output, $ per 1M tokens
                      </label>
                      <input
                        id="rate-out"
                        className={FIELD}
                        inputMode="decimal"
                        value={draft.output}
                        onChange={(e) => change({ output: e.target.value })}
                        placeholder="0.50"
                      />
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-xs text-[var(--ai-fg)]">
                    <input
                      type="checkbox"
                      className="outline-none"
                      checked={draft.longOn}
                      onChange={(e) => change({ longOn: e.target.checked })}
                    />
                    Long prompts cost more (the whole call is billed at the higher price)
                  </label>

                  {draft.longOn && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div>
                        <label className={LABEL} htmlFor="rate-long-above">
                          Above (tokens)
                        </label>
                        <input
                          id="rate-long-above"
                          className={FIELD}
                          inputMode="numeric"
                          value={draft.longAbove}
                          onChange={(e) => change({ longAbove: e.target.value })}
                          placeholder="100000"
                        />
                      </div>
                      <div>
                        <label className={LABEL} htmlFor="rate-long-in">
                          Input, $ per 1M
                        </label>
                        <input
                          id="rate-long-in"
                          className={FIELD}
                          inputMode="decimal"
                          value={draft.longIn}
                          onChange={(e) => change({ longIn: e.target.value })}
                          placeholder="0.50"
                        />
                      </div>
                      <div>
                        <label className={LABEL} htmlFor="rate-long-out">
                          Output, $ per 1M
                        </label>
                        <input
                          id="rate-long-out"
                          className={FIELD}
                          inputMode="decimal"
                          value={draft.longOut}
                          onChange={(e) => change({ longOut: e.target.value })}
                          placeholder="2.50"
                        />
                      </div>
                    </div>
                  )}
                </>
              )}

              {draft.kind === 'search' && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className={LABEL} htmlFor="rate-basic">
                      $ per 1,000 searches
                    </label>
                    <input
                      id="rate-basic"
                      className={FIELD}
                      inputMode="decimal"
                      value={draft.basic}
                      onChange={(e) => change({ basic: e.target.value })}
                      placeholder="8"
                    />
                  </div>
                  <div>
                    <label className={LABEL} htmlFor="rate-advanced">
                      Advanced, $ per 1,000 (optional)
                    </label>
                    <input
                      id="rate-advanced"
                      className={FIELD}
                      inputMode="decimal"
                      value={draft.advanced}
                      onChange={(e) => change({ advanced: e.target.value })}
                      placeholder="16"
                    />
                  </div>
                </div>
              )}

              {draft.kind === 'transcription' && (
                <div>
                  <label className={LABEL} htmlFor="rate-hour">
                    $ per hour of audio
                  </label>
                  <input
                    id="rate-hour"
                    className={FIELD}
                    inputMode="decimal"
                    value={draft.perHour}
                    onChange={(e) => change({ perHour: e.target.value })}
                    placeholder="0.04"
                  />
                </div>
              )}

              {error && (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-[var(--ai-danger)]">{error}</p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)} className="whitespace-nowrap">
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={busy} className="whitespace-nowrap">
              {busy ? 'Saving...' : 'Save price'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={removing !== null} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this price for {removing?.rate.match}?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing ? `${priceText(removing.rate.kind, removing.entry)}, from ${removing.entry.from}. ` : ''}
              The previous price applies again. Calls already recorded keep the price they were charged at.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="whitespace-nowrap">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void remove();
              }}
              disabled={busy}
              className="whitespace-nowrap bg-[var(--ai-danger)] hover:bg-[var(--ai-danger)]"
            >
              {busy ? 'Removing...' : 'Remove the price'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
