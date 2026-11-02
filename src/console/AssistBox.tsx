import { useState } from 'react';
import { ConsoleError, useConsole } from './ConsoleContext';
import { Button, INPUT } from './primitives';

export type AssistField = 'system' | 'prompt' | 'voice';

/**
 * "Ask the assistant" beside a prompt or a voice (Site management v2, owner 2026-11-02: editable
 * things get CRUD with the assistant's help).
 *
 * The admin says what to change in plain words; the service returns the whole text rewritten,
 * shown as the lines it changed. "Use this" puts it in the field, and nothing is saved until the
 * admin saves the form as usual (where the template's own checks run again).
 *
 * ⚠ The service refuses a suggestion that invents a `{{placeholder}}`, so what reaches this box
 * keeps the product's variables; one it DROPPED is named here before it is used.
 */
export function AssistBox({ field, text, onUse, disabled }: { field: AssistField; text: string; onUse: (text: string) => void; disabled?: boolean }) {
  const { request, capabilities } = useConsole();
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<{ suggestion: string; dropped: string[] } | null>(null);

  if (capabilities?.can.assist !== true || disabled) return null;

  const ask = async () => {
    setBusy(true);
    setProblem(null);
    setResult(null);
    try {
      const body = await request<{ suggestion: string; dropped: string[] }>('POST', 'assist', {
        body: { field, text, instruction: instruction.trim() },
        // The reason shows here, beside the request it answers.
        quiet: true,
      });
      setResult({ suggestion: body.suggestion, dropped: body.dropped ?? [] });
    } catch (e) {
      setProblem((e as ConsoleError).message);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="whitespace-nowrap text-sm font-medium text-[var(--ai-accent)] underline-offset-2 outline-none hover:underline focus-visible:underline"
      >
        Ask the assistant
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-[var(--ai-border)] bg-[var(--ai-accent-soft)] p-3">
      <label className="block text-sm font-medium" htmlFor={`assist-${field}`}>
        What should change?
      </label>
      <textarea
        id={`assist-${field}`}
        rows={2}
        className={INPUT}
        placeholder={field === 'voice' ? 'e.g. warmer, shorter sentences, never use first names' : 'e.g. ask for two short lines instead of a paragraph'}
        value={instruction}
        maxLength={1000}
        onChange={(e) => setInstruction(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <Button tone="primary" disabled={busy || instruction.trim().length < 3 || text.trim() === ''} onClick={ask}>
          {busy ? 'Thinking…' : result ? 'Suggest again' : 'Suggest'}
        </Button>
        <Button onClick={() => { setOpen(false); setResult(null); setProblem(null); }}>Close</Button>
      </div>
      {problem ? <p className="text-sm text-[var(--ai-danger)]">{problem}</p> : null}
      {result ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Suggested change</p>
          <LineDiff before={text} after={result.suggestion} />
          {result.dropped.length ? (
            <p className="text-sm text-[var(--ai-danger)]">
              This drops {result.dropped.map((v) => `{{${v}}}`).join(', ')}: the product will still send it, but the AI will no longer see it.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button tone="primary" onClick={() => { onUse(result.suggestion); setOpen(false); setResult(null); setInstruction(''); }}>
              Use this
            </Button>
            <span className="self-center text-xs text-[var(--ai-muted)]">Nothing is saved until you save the form.</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** The lines that changed, removed then added, so an admin reads only the difference. */
export function LineDiff({ before, after }: { before: string; after: string }) {
  const rows = diffLines(before.split('\n'), after.split('\n'));
  const changed = rows.some((r) => r.kind !== 'same');
  return (
    <div className="max-h-72 overflow-y-auto rounded-lg border border-[var(--ai-border)] bg-[var(--ai-surface)] p-2 font-mono text-xs">
      {!changed ? <p className="text-[var(--ai-muted)]">No change.</p> : null}
      {rows.map((r, i) =>
        r.kind === 'same' ? (
          <div key={i} className="whitespace-pre-wrap text-[var(--ai-muted)]">{r.text || ' '}</div>
        ) : (
          <div
            key={i}
            className={`whitespace-pre-wrap ${r.kind === 'add' ? 'bg-[#dcfce7] text-[#166534]' : 'bg-[#fee2e2] text-[var(--ai-danger)] line-through'}`}
          >
            {r.kind === 'add' ? '+ ' : '- '}
            {r.text || ' '}
          </div>
        ),
      )}
    </div>
  );
}

/** A plain longest-common-subsequence line diff; templates are at most a few hundred lines. */
export function diffLines(a: string[], b: string[]): Array<{ kind: 'same' | 'add' | 'del'; text: string }> {
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const out: Array<{ kind: 'same' | 'add' | 'del'; text: string }> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: 'same', text: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ kind: 'del', text: a[i]! });
      i++;
    } else {
      out.push({ kind: 'add', text: b[j]! });
      j++;
    }
  }
  while (i < n) out.push({ kind: 'del', text: a[i++]! });
  while (j < m) out.push({ kind: 'add', text: b[j++]! });
  return out;
}
