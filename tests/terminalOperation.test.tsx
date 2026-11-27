import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { AssistantTerminal, type AssistantTerminalProps } from '../src/terminal/AssistantTerminal';
import { toLines, toMarkdown } from '../src/terminal/transcript';
import type { TerminalMode, TerminalTurn } from '../src/terminal/types';

/**
 * An answer's proposed change in the console (1.73.0, owner 2026-11-27: "match the console UX").
 *
 * ⚠ WHAT THIS GUARDS: the card is drawn in the console's own marks (never the chat card), waits for approval in the
 * composer's place, runs with the reason picked (by click, by number, or typed), keeps the block on a refusal,
 * declines on Esc, and folds to its result once decided, also after a reload (the turn's card_state).
 */
const plan = {
  operation: 'run_plan',
  params: { goal: 'A test family', steps: [] },
  preview: {
    title: 'A test family for Maria Okafor',
    target: { label: '3 steps' },
    changes: [
      { label: 'Step 1', before: null, after: 'Create the test person Maria Okafor' },
      { label: 'Step 2', before: null, after: "Open a case (uses step 1's email)" },
      { label: 'Step 3', before: null, after: 'Put the family on it' },
    ],
    notes: ['Test server only; tagged as your test data.'],
    consequential: false,
    undoable: true,
  },
  reason_options: ['The tester asked for this family', 'Setting up wave 1'],
  verb: 'Run the plan',
};

const turnsWith = (cardState: TerminalTurn['card_state'] = null): TerminalTurn[] => [
  { id: 'a1', role: 'user', body: 'Make Maria with her family', structured: null, rewound: false, at: null },
  { id: 'b1', role: 'assistant', body: 'Here is the plan.', structured: { outcome: { changed: false, operation: plan } }, rewound: false, card_state: cardState, at: null },
];

function Harness(overrides: Partial<AssistantTerminalProps> & { turns?: TerminalTurn[] } = {}) {
  const [value, setValue] = useState('');
  const [mode, setMode] = useState<TerminalMode>('build');

  return (
    <AssistantTerminal
      open
      onClose={() => {}}
      assistantName="Porter"
      subjectLabel="Test round"
      session={{ id: 's1', title: 'Round', started_at: null, last_at: null, turns: 2, summary: null }}
      turns={overrides.turns ?? turnsWith()}
      mode={mode}
      onModeChange={setMode}
      value={value}
      onChange={setValue}
      onAsk={() => {}}
      onStop={() => {}}
      onCommand={() => {}}
      onRewind={() => {}}
      onSaveBrief={() => {}}
      theme="dark"
      onThemeChange={() => {}}
      {...overrides}
    />
  );
}

beforeAll(() => {
  Element.prototype.scrollTo = vi.fn() as unknown as typeof Element.prototype.scrollTo;
});

describe('the operation card', () => {
  it('becomes a console line with its steps, waiting, then folds to its result once decided', () => {
    const open = toLines(turnsWith()).find((l) => l.kind === 'operation');
    expect(open).toMatchObject({ kind: 'operation', turnId: 'b1', state: 'open', actionable: true, open: true });

    const done = toLines(turnsWith({ card: 'done', summary: 'All 3 steps are done.' })).find((l) => l.kind === 'operation');
    expect(done).toMatchObject({ state: 'done', summary: 'All 3 steps are done.', open: false });
    expect(toLines(turnsWith({ card: 'cancelled' })).find((l) => l.kind === 'operation')).toMatchObject({ state: 'cancelled' });
    // The page's own state wins while it holds one (between the approval and the result).
    expect(toLines(turnsWith(), { operationState: () => ({ state: 'running', summary: null }) }).find((l) => l.kind === 'operation')).toMatchObject({ state: 'running' });

    const md = toMarkdown('Round', toLines(turnsWith({ card: 'done', summary: 'All 3 steps are done.' })));
    expect(md).toContain('◆ A test family for Maria Okafor');
    expect(md).toContain("2. Open a case (uses step 1's email)");
    expect(md).toContain('✓ All 3 steps are done.');
  });

  it('asks in the composer\'s place and runs with the reason picked by click or by number', async () => {
    const run = vi.fn(async () => {});
    render(<Harness onOperation={run} />);

    const block = screen.getByRole('dialog', { name: /Approve: A test family for Maria Okafor/ });
    expect(screen.queryByRole('textbox', { name: /describe what you want/i })).toBeNull();
    expect(screen.getByText('Run this?')).toBeTruthy();
    expect(screen.getByText('Approve or decline below.')).toBeTruthy();
    expect(screen.getByText('1. Create the test person Maria Okafor')).toBeTruthy();

    await act(async () => {
      fireEvent.keyDown(block, { key: '2' });
    });
    expect(run).toHaveBeenLastCalledWith('b1', { operation: 'run_plan', params: plan.params, reason: 'Setting up wave 1' });

    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: /The tester asked for this family/ }));
    });
    expect(run).toHaveBeenLastCalledWith('b1', expect.objectContaining({ reason: 'The tester asked for this family' }));
  });

  it('takes a typed reason, keeps the block with the sentence on a refusal, and declines on Esc', async () => {
    const run = vi.fn(async () => {
      throw new Error('You need the "cases.manage" permission for this.');
    });
    const decline = vi.fn();
    render(<Harness onOperation={run} onDeclineOperation={decline} />);

    const own = screen.getByRole('textbox', { name: 'Yes, with my own reason' });
    fireEvent.change(own, { target: { value: 'no' } });
    await act(async () => {
      fireEvent.keyDown(own, { key: 'Enter' });
    });
    expect(run).not.toHaveBeenCalled(); // shorter than the audit's floor

    fireEvent.change(own, { target: { value: 'Demo for Sofia' } });
    await act(async () => {
      fireEvent.keyDown(own, { key: 'Enter' });
    });
    expect(run).toHaveBeenLastCalledWith('b1', expect.objectContaining({ reason: 'Demo for Sofia' }));
    expect(screen.getByRole('alert').textContent).toContain('cases.manage');
    expect(screen.getByRole('dialog', { name: /Approve:/ })).toBeTruthy();

    fireEvent.keyDown(screen.getByRole('dialog', { name: /Approve:/ }), { key: 'Escape' });
    expect(decline).toHaveBeenCalledWith('b1');
    expect(screen.queryByRole('dialog', { name: /Approve:/ })).toBeNull();
    expect(screen.getByRole('textbox', { name: /describe what you want/i })).toBeTruthy();
  });

  it('asks nothing once decided, or without a host to run it', () => {
    const { unmount } = render(<Harness onOperation={vi.fn()} turns={turnsWith({ card: 'done', summary: 'Stopped at step 2 of 3: no package matches.', partial: true })} />);
    expect(screen.queryByRole('dialog', { name: /Approve:/ })).toBeNull();
    // A plan that stopped part-way never reads as a success.
    expect(screen.getByText('! Stopped at step 2 of 3: no package matches.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show what it was' }));
    expect(screen.getByText('1. Create the test person Maria Okafor')).toBeTruthy();
    unmount();

    render(<Harness />);
    expect(screen.queryByRole('dialog', { name: /Approve:/ })).toBeNull();
  });
});
