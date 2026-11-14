import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ConsoleRunner, ConsoleSubject, ConsoleTarget } from '../src/terminal/consoleHostPorts';
import { useConsoleHost } from '../src/terminal/useConsoleHost';
import type { TerminalConsoleData, TerminalTurn } from '../src/terminal/types';

/**
 * The console host for any product (shared console C4c): it asks through the product's runner, aims at the product's
 * target, puts the product's design back on a rewind, and reports what is not an HTTP answer through the product's own
 * error surface.
 */
function consoleData(turns: TerminalTurn[] = [], sessionId: string | null = 's1') {
  return {
    data: { session: sessionId ? { id: sessionId } : null, turns, subject: { label: 'Home' }, history: [] } as unknown as TerminalConsoleData,
    loading: false,
    notes: [],
    note: vi.fn(),
    clearNotes: vi.fn(),
    accept: vi.fn(),
    ensureSession: vi.fn(async () => sessionId),
    refresh: vi.fn(async () => undefined),
    extras: vi.fn(() => ({})),
    setAskMeta: vi.fn(),
    setTuning: vi.fn(),
    sessionId: () => sessionId,
    commands: [],
    saveCommands: vi.fn(async () => undefined),
    sessions: null,
    loadSessions: vi.fn(async () => undefined),
  };
}

function runner(overrides: Partial<ConsoleRunner> = {}): ConsoleRunner {
  return {
    building: null,
    queued: null,
    asking: false,
    answer: null,
    plan: null,
    planFirst: false,
    brainstorm: false,
    ask: vi.fn(async () => 'Done: the hero is shorter.'),
    buildPlan: vi.fn(async () => 'Built.'),
    buildAgreed: vi.fn(async () => 'Built.'),
    dismissPlan: vi.fn(),
    stop: vi.fn(),
    setPlanFirst: vi.fn(),
    setBrainstorm: vi.fn(),
    ...overrides,
  };
}

const target: ConsoleTarget = { node: { primitive: 'box' }, path: [0], add: vi.fn(), clear: vi.fn() };

function subject(overrides: Partial<ConsoleSubject> = {}): ConsoleSubject {
  return { noun: 'page', nodes: [{ children: [] }], labelFor: (path) => (path.length === 1 ? 'Hero' : ''), restoreDesign: vi.fn(), ...overrides };
}

function host(options: { data?: ReturnType<typeof consoleData>; runner?: ConsoleRunner; subject?: ConsoleSubject; api?: Record<string, unknown>; onError?: (e: unknown) => void }) {
  const api = { checkpoint: vi.fn(async () => ({ id: 'c1', design: [{ uid: 'a' }], created_at: null })), rewind: vi.fn(async () => consoleData().data), compact: vi.fn(), start: vi.fn(), usage: vi.fn(), recap: vi.fn(), openSession: vi.fn(), saveBrief: vi.fn(), ...options.api };

  return renderHook(() =>
    useConsoleHost({
      api: api as never,
      kind: 'page',
      id: 'p1',
      console: (options.data ?? consoleData()) as never,
      runner: options.runner ?? runner(),
      target,
      subject: options.subject ?? subject(),
      verbFor: () => 'Writing the hero',
      assistantName: 'Porter',
      storagePrefix: 'test-console',
      onError: options.onError ?? vi.fn(),
    }),
  );
}

describe('useConsoleHost', () => {
  it('asks through the runner, aimed at the target, with the session and the transcript meta', async () => {
    const data = consoleData();
    const run = runner();
    const { result } = host({ data, runner: run });

    await act(async () => result.current.onAsk?.('Make the hero shorter', []));

    expect(data.ensureSession).toHaveBeenCalledWith('Make the hero shorter');
    expect(data.setAskMeta).toHaveBeenCalledWith({ target: 'Hero', files: [], answers: undefined });
    expect(run.ask).toHaveBeenCalledWith('Make the hero shorter', [0], [], undefined);
    expect(data.refresh).toHaveBeenCalled();
    expect(result.current.value).toBe('');
  });

  it('puts the words back in the composer when the ask fails', async () => {
    const { result } = host({ runner: runner({ ask: vi.fn(async () => null) }) });

    await act(async () => result.current.onAsk?.('Add a pricing table', []));

    expect(result.current.value).toBe('Add a pricing table');
  });

  it('puts the design back from the rewind point the answer recorded', async () => {
    const turns = [
      { id: 't1', role: 'user', body: 'Make it blue' },
      { id: 't2', role: 'assistant', body: 'Done', structured: { checkpoint_id: 'c1' } },
    ] as unknown as TerminalTurn[];
    const data = consoleData(turns);
    const restoreDesign = vi.fn();
    const { result } = host({ data, subject: subject({ restoreDesign }) });

    act(() => result.current.onRewind?.('t1', 'design'));

    await waitFor(() => expect(restoreDesign).toHaveBeenCalledWith({ id: 'c1', design: [{ uid: 'a' }], created_at: null }));
    expect(data.note).toHaveBeenCalledWith('Put the page back as it was before "Make it blue".', 'ok');
  });

  it('builds a plan from an earlier visit with the steps it set out', async () => {
    const turns = [
      { id: 't1', role: 'user', body: 'Plan a pricing page' },
      { id: 't2', role: 'assistant', body: 'Plan', structured: { plan: { steps: ['Hero', 'Tiers'] } } },
    ] as unknown as TerminalTurn[];
    const run = runner();
    const { result } = host({ data: consoleData(turns), runner: run });

    act(() => result.current.onBuildPlan?.());

    await waitFor(() => expect(run.buildAgreed).toHaveBeenCalledWith('Plan a pricing page', ['Hero', 'Tiers']));
    expect(run.setPlanFirst).toHaveBeenCalledWith(false);
  });

  it('shows the run as it streams, in the product\'s words', () => {
    const { result } = host({ runner: runner({ building: { startedAt: 1, steps: [{ kind: 'read', text: 'Read the page' }], thinking: 'Weighing it' } as never }) });

    expect(result.current.live?.verb).toBe('Writing the hero');
    expect(result.current.live?.steps.map((s) => s.kind)).toEqual(['read', 'think']);
  });

  it('reports a refused Compare upload through the product, not as a silent failure', async () => {
    const onError = vi.fn();
    const refused = new Error('The file is too large');
    const { result } = host({ onError, subject: subject({ capture: vi.fn(async () => new File(['x'], 'shot.png')), upload: vi.fn(async () => Promise.reject(refused)) }) });

    await act(async () => result.current.onCompare?.());

    await waitFor(() => expect(onError).toHaveBeenCalledWith(refused));
  });

  it('offers only the modes the surface supports (1.60.1)', () => {
    const { result } = renderHook(() =>
      useConsoleHost({ api: {} as never, kind: 'email', id: 'e1', console: consoleData() as never, runner: runner(), target, subject: subject(), verbFor: () => 'Writing', assistantName: 'Porter', onError: vi.fn(), modes: ['build'] }),
    );

    expect(result.current.modes).toEqual(['build']);
  });

  it('offers no Compare without both a capture and an upload', () => {
    const { result } = host({ subject: subject({ capture: vi.fn(async () => null) }) });

    expect(result.current.onCompare).toBeUndefined();
  });
});
