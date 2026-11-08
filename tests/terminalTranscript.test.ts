import { describe, expect, it } from 'vitest';

import { outcomeLine, toLines, toMarkdown } from '../src/terminal/transcript';
import type { TerminalSessionRow, TerminalTurn } from '../src/terminal/types';

const ask = (id: string, body: string, structured: TerminalTurn['structured'] = null, rewound = false): TerminalTurn => ({ id, role: 'user', body, structured, rewound, at: null });
const answer = (id: string, structured: TerminalTurn['structured'], body: string | null = 'Done.', rewound = false): TerminalTurn => ({ id, role: 'assistant', body, structured, rewound, at: null });

const steps = [
  { kind: 'read', text: 'Reading the page', ms: 300 },
  { kind: 'write', text: 'Writing the hero', ms: 4100, detail: '1 element' },
  { kind: 'check', text: 'Checking the page', ms: 800, detail: 'fixed 2 colours' },
];

describe('toLines', () => {
  it('draws a finished ask as its ask, steps, reply and outcome, in order', () => {
    const lines = toLines([ask('a1', 'Make the hero darker', { target: 'Hero', files: ['brand.pdf'] }), answer('b1', { steps, outcome: { changed: true, elements: 1, kept: 1 } }, 'Darker hero, white text.')]);

    expect(lines.map((l) => l.kind)).toEqual(['ask', 'step', 'step', 'step', 'detail', 'reply', 'outcome']);
    expect(lines[0]).toMatchObject({ text: 'Make the hero darker', chips: ['@Hero', '1 file'] });
    expect(lines[4]).toMatchObject({ kind: 'detail', text: 'fixed 2 colours' });
    expect(lines[6]).toMatchObject({ tone: 'ok', text: 'Changed 1 element, kept the edits you made meanwhile', turnId: 'a1', canRewind: true });
  });

  it('shows every detail when expanded (Ctrl+O)', () => {
    const lines = toLines([ask('a1', 'x'), answer('b1', { steps, outcome: { changed: true } })], { expanded: true });

    expect(lines.filter((l) => l.kind === 'detail').map((l) => (l as { text: string }).text)).toEqual(['1 element', 'fixed 2 colours']);
  });

  it('says why an ask could not finish, and that nothing changed when nothing did', () => {
    expect(outcomeLine({ changed: false, reason: 'The site refused the visit.' })).toEqual({ tone: 'fail', text: 'Could not finish: The site refused the visit.' });
    expect(outcomeLine({ changed: false })).toEqual({ tone: 'none', text: 'Nothing changed' });
    expect(outcomeLine({ changed: true, elements: 3, conflicts: 2 }).text).toBe('Changed 3 elements, kept your version of 2 elements you changed meanwhile');
  });

  it('grows a live ask step by step without re-keying the lines already drawn', () => {
    const turns = [ask('a1', 'First'), answer('b1', { outcome: { changed: true } })];
    const live = { startedAt: 5, ask: { text: 'Add a FAQ', mode: 'build' }, steps: [{ kind: 'read', text: 'Reading the page' }], verb: null, queued: null };
    const before = toLines(turns, { live });
    const after = toLines(turns, { live: { ...live, steps: [...live.steps, { kind: 'write', text: 'Writing the FAQ' }], queued: 'then a footer' } });

    expect(after.slice(0, before.length - 1).map((l) => l.key)).toEqual(before.slice(0, before.length - 1).map((l) => l.key));
    expect(after.slice(-3).map((l) => [l.kind, (l as { live?: boolean }).live ?? null])).toEqual([['step', false], ['step', true], ['queued', null]]);
  });

  it('dims rewound turns, marks folded ones and places the summary marker after them', () => {
    const session: TerminalSessionRow = { id: 's', title: null, started_at: null, last_at: null, turns: 6, summary: { text: 'Built two sections.', scope: 'before', turns_folded: 2, at: 't', folded: ['a1', 'b1'] } };
    const lines = toLines([ask('a1', 'One'), answer('b1', { outcome: { changed: true } }), ask('a2', 'Two', null, true), answer('b2', { outcome: { changed: true } }, 'x', true)], { session, assistantName: 'Porter' });

    expect(lines[0]).toMatchObject({ kind: 'ask', muted: 'folded' });
    const marker = lines.findIndex((l) => l.kind === 'system');
    expect(lines[marker]).toMatchObject({ text: 'Session summarised (2 turns folded into the summary Porter reads)' });
    expect(lines[marker + 1]).toMatchObject({ kind: 'ask', text: 'Two', muted: 'rewound' });
    expect(lines.at(-1)).toMatchObject({ kind: 'outcome', canRewind: false, muted: 'rewound' });
  });

  it('keeps a plan open only while it is the last thing said', () => {
    const plan = { summary: 'Add a pricing table', steps: ['Add a table', 'Fill three plans'] };
    const open = toLines([ask('a1', 'Plan a pricing table', { mode: 'plan' }), answer('b1', { plan }, null)]);
    const closed = toLines([ask('a1', 'Plan it', { mode: 'plan' }), answer('b1', { plan }, null), ask('a2', 'Build it')]);

    expect(open.at(-1)).toMatchObject({ kind: 'plan', open: true, turnId: 'a1' });
    expect(open[0]).toMatchObject({ chips: ['plan'] });
    expect(closed.find((l) => l.kind === 'plan')).toMatchObject({ open: false });
  });

  it('hides what Ctrl+L cleared, and keeps the host notes', () => {
    const lines = toLines([ask('a1', 'Old'), answer('b1', { outcome: { changed: true } }), ask('a2', 'New')], { clearedThrough: 'b1', notes: [{ key: '1', text: 'Brief saved' }] });

    expect(lines.map((l) => l.kind)).toEqual(['ask', 'system']);
    expect(lines[0]).toMatchObject({ text: 'New' });
  });
});

describe('toMarkdown', () => {
  it('reads like the screen', () => {
    const md = toMarkdown('Home page', toLines([ask('a1', 'Make it dark'), answer('b1', { steps: steps.slice(0, 2), outcome: { changed: true, elements: 1 } }, 'Done.')]));

    expect(md).toBe('# Home page\n\n> Make it dark\n\n● Reading the page (1s)\n● Writing the hero (4s)\n◆ Done.\n✓ Changed 1 element\n');
  });
});
