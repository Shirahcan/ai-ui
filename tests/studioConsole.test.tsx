import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createConsoleApi, type ConsoleFetcher } from '../src/terminal/consoleApi';
import { nodeAtPath, replaceAtPath, type StudioConsoleSubject } from '../src/terminal/studioConsole';
import type { TerminalTurn } from '../src/terminal/types';
import { StudioConsole, useStudioConsole } from '../src/terminal/useStudioConsole';
import type { WorkerRun } from '../src/terminal/useWorkerConsoleRunner';

/**
 * The console on any Studio (1.63.0, shared Studio P4a3), one test per mount rule; each rule is a defect already paid
 * for on Portify.
 */
type Node = { primitive: string; uid?: string; children?: Node[] };

const base = (kind: string, id: string) => `/x/console/${kind}/${id}`;
const session = { id: 's1', title: null, started_at: null, last_at: null, turns: 0, summary: null };

function answer(id: string, run: string, extra: Partial<TerminalTurn> = {}): TerminalTurn {
  return { id, role: 'assistant', body: 'I drafted a title.', structured: { run_id: run, outcome: { changed: true, elements: 1 } as never }, rewound: false, at: null, ...extra };
}

function fakeApi(turns: TerminalTurn[]) {
  const calls: { method: string; url: string; body?: unknown }[] = [];
  const console = () => ({ subject: { ref: 'growth_post:p1', label: 'My post' }, session, turns, brief: null, size: { design_chars: 100, budget_tokens: 1000 } as never, history: [] });
  const fetcher: ConsoleFetcher = {
    get: vi.fn(async (url: string) => (calls.push({ method: 'GET', url }), console()) as never),
    post: vi.fn(async (url: string, body?: unknown) => (calls.push({ method: 'POST', url, body }), console()) as never),
    put: vi.fn(async (url: string, body?: unknown) => (calls.push({ method: 'PUT', url, body }), { card_state: { card: (body as { card: string }).card } }) as never),
  };
  const finished: WorkerRun<{ values?: Record<string, string> }> = { id: 'r9', status: 'succeeded', summary: 'I rewrote the intro.', data: { values: { title: 'New' } } };
  const runs = {
    startRun: vi.fn(async () => ({ run: { id: 'r9', status: 'queued', summary: null } })),
    getRun: vi.fn(async () => finished),
    stopRun: vi.fn(async () => undefined),
  };

  return { api: { ...createConsoleApi<'growth_post', Node[]>({ base, checkpointUrl: () => '/x/cp', fetcher }), ...runs }, calls, runs, finished };
}

const NODES: Node[] = [
  { primitive: 'post_title', uid: 't1' },
  { primitive: 'section', uid: 's1', children: [{ primitive: 'heading', uid: 'h1' }] },
];

function subject(api: ReturnType<typeof fakeApi>['api'], overrides: Partial<StudioConsoleSubject<'growth_post', Node, { values?: Record<string, string> }>> = {}) {
  return {
    api,
    kind: 'growth_post' as const,
    id: 'p1',
    noun: 'post',
    nodes: NODES,
    flush: vi.fn(async () => true),
    land: vi.fn(),
    restore: vi.fn(),
    labelFor: (path: number[]) => (path.length === 1 && path[0] === 1 ? 'Intro' : path.length === 1 ? 'Title' : ''),
    // The profile's rule: a post's own pieces (its title) change in the details, never by an ask.
    canAim: (node: Node) => !node.primitive.startsWith('post_'),
    applyProposal: vi.fn(async () => undefined),
    openDetails: vi.fn(),
    ...overrides,
  };
}

const options = { assistantName: 'Porter', openKey: 'test-console:open', onError: vi.fn() };

describe('useStudioConsole', () => {
  beforeAll(() => Object.defineProperty(Element.prototype, 'scrollTo', { value: vi.fn(), configurable: true }));
  beforeEach(() => window.localStorage.clear());

  it("rule 1: a hand-off asks through the composer's own ask (its session and aim ride with it) and lands at its path", async () => {
    const { api, runs, finished } = fakeApi([]);
    const s = subject(api);
    const { result } = renderHook(() => useStudioConsole(s, options));
    await waitFor(() => expect(result.current.host.terminal.loading).toBe(false));

    act(() => result.current.handOff({ text: 'Rewrite this section', path: [1], label: 'Intro' }));

    await waitFor(() => expect(s.land).toHaveBeenCalledWith(finished, [1]));
    expect(result.current.host.open).toBe(true);
    // The composer's ask is what records the session and the aim's name; a runner called by hand carries neither.
    expect(runs.startRun).toHaveBeenCalledWith('p1', expect.objectContaining({ instruction: 'Rewrite this section', session_id: 's1', console_target: 'Intro', path: [1] }));
    expect(s.flush).toHaveBeenCalled();
  });

  it("rule 2: a proposal's state is the server's card_state, and a decision is written to its turn, then read back", async () => {
    const turns = [answer('a1', 'r1', { card_state: { card: 'done' } }), answer('a2', 'r2'), answer('a3', 'r3')];
    const { api, calls, runs, finished } = fakeApi(turns);
    const s = subject(api);
    const { result } = renderHook(() => useStudioConsole(s, options));
    await waitFor(() => expect(result.current.host.terminal.turns).toHaveLength(3));
    const terminal = () => result.current.host.terminal;

    // A fresh mount (a reload) shows the decided card as decided: no per-tab memory involved.
    expect(terminal().proposalState?.('a1')).toBe('applied');
    expect(terminal().proposalState?.('a2')).toBeNull();

    await act(async () => terminal().onProposal?.('a2', 'dismiss'));
    await waitFor(() => expect(terminal().proposalState?.('a2')).toBe('dismissed'));
    expect(calls).toContainEqual({ method: 'PUT', url: '/x/console/growth_post/p1/sessions/s1/turns/a2/card-state', body: { card: 'cancelled' } });
    expect(s.applyProposal).not.toHaveBeenCalled();

    await act(async () => terminal().onProposal?.('a3', 'apply'));
    await waitFor(() => expect(calls).toContainEqual({ method: 'PUT', url: '/x/console/growth_post/p1/sessions/s1/turns/a3/card-state', body: { card: 'done' } }));
    expect(runs.getRun).toHaveBeenCalledWith('r3');
    expect(s.applyProposal).toHaveBeenCalledWith(finished);
    // The session is read again after a decision, so what is drawn is the server's state.
    expect(calls.filter((c) => c.method === 'GET' && c.url === '/x/console/growth_post/p1/sessions/s1').length).toBeGreaterThan(0);
  });

  it('rule 3: "Changed N elements" is the outcome the server recorded; the console never recounts the design', async () => {
    window.localStorage.setItem('test-console:open', '1');
    // A design of many elements: a recount would say far more than the one the server recorded.
    const many = Array.from({ length: 19 }, (_, i) => ({ primitive: 'p', uid: `p${i}` }));
    const { api } = fakeApi([{ id: 'u1', role: 'user', body: 'Write the headline', structured: null, rewound: false, at: null }, answer('a1', 'r1')]);

    render(<StudioConsole subject={subject(api, { nodes: many })} options={options} />);

    expect(await screen.findByText(/Changed 1 element/)).toBeTruthy();
    expect(screen.queryByText(/Changed 19 elements/)).toBeNull();
  });

  it("rule 4: what can be aimed is the subject's canAim: a refused block opens the details and is not offered in \"@\"", async () => {
    const { api, runs } = fakeApi([]);
    const s = subject(api);
    const { result } = renderHook(() => useStudioConsole(s, options));
    await waitFor(() => expect(result.current.host.terminal.loading).toBe(false));

    act(() => result.current.handOff({ text: 'Rewrite this', path: [0], label: 'Title' }));

    expect(s.openDetails).toHaveBeenCalledTimes(1);
    expect(runs.startRun).not.toHaveBeenCalled();
    const offered = await result.current.host.terminal.mentions?.search('');
    expect(offered?.map((m) => m.label)).toEqual(['Intro']);
  });
});

describe("the composer's tools (1.66.0)", () => {
  beforeAll(() => Object.defineProperty(Element.prototype, 'scrollTo', { value: vi.fn(), configurable: true }));
  beforeEach(() => window.localStorage.clear());

  it('offers the files and dictation the product gives, and an ask with a file sends it as its reference', async () => {
    const { api, runs } = fakeApi([]);
    const s = subject(api);
    const attachments = { accept: ['application/pdf'], onUpload: vi.fn() } as never;
    const dictation = { transcribe: vi.fn() } as never;
    const answered = vi.fn();
    const { result } = renderHook(() => useStudioConsole(s, { ...options, composer: { attachments, dictation }, answered }));
    await waitFor(() => expect(result.current.host.terminal.loading).toBe(false));

    // The kit's own controls stay the kit's: Send's label, busy and Stop.
    expect(result.current.host.composer).toMatchObject({ attachments, dictation, sendLabel: 'Change', busy: false });

    await act(async () => result.current.host.terminal.onAsk('Use this brochure for the intro', [{ id: 'f-1', name: 'brochure.pdf', mime: 'application/pdf', size: 10 }]));

    await waitFor(() => expect(runs.startRun).toHaveBeenCalledWith('p1', expect.objectContaining({ instruction: 'Use this brochure for the intro', reference_ids: ['f-1'] })));
    await waitFor(() => expect(answered).toHaveBeenCalledWith('I rewrote the intro.'));
  });

  it('without them the composer takes words only, as before', async () => {
    const { api } = fakeApi([]);
    const { result } = renderHook(() => useStudioConsole(subject(api), options));
    await waitFor(() => expect(result.current.host.terminal.loading).toBe(false));

    expect(result.current.host.composer.attachments).toBeUndefined();
    expect(result.current.host.composer.dictation).toBeUndefined();
  });
});

describe('a run outlives its tab (1.65.0)', () => {
  beforeAll(() => Object.defineProperty(Element.prototype, 'scrollTo', { value: vi.fn(), configurable: true }));
  beforeEach(() => window.localStorage.clear());

  const KEY = 'porter-console:live-run:growth_post:p1';
  const ask = (): TerminalTurn => ({ id: 'u1', role: 'user', body: 'Rewrite this section', structured: null, rewound: false, at: null });

  it('remembers the run it waits on, and forgets it once the run has landed', async () => {
    const { api, runs, finished } = fakeApi([]);
    let seen: string | null = null;
    runs.getRun.mockImplementation(async () => {
      seen = window.localStorage.getItem(KEY);

      return finished;
    });
    const s = subject(api);
    const { result } = renderHook(() => useStudioConsole(s, options));
    await waitFor(() => expect(result.current.host.terminal.loading).toBe(false));

    act(() => result.current.handOff({ text: 'Rewrite this section', path: [1], label: 'Intro' }));

    await waitFor(() => expect(s.land).toHaveBeenCalledWith(finished, [1]));
    expect(JSON.parse(seen ?? '{}')).toMatchObject({ run: 'r9', path: [1] });
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it('a reopened console follows a run left under way and lands it at its own path, then reads the session again', async () => {
    window.localStorage.setItem(KEY, JSON.stringify({ run: 'r7', path: [1], at: Date.now() }));
    const { api, calls, runs, finished } = fakeApi([ask()]);
    const s = subject(api);
    renderHook(() => useStudioConsole(s, options));

    await waitFor(() => expect(s.land).toHaveBeenCalledWith(finished, [1]));
    expect(runs.getRun).toHaveBeenCalledWith('r7', 0, 0);
    expect(runs.startRun).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(KEY)).toBeNull();
    // The answer the worker recorded is read, so the ask no longer stands without one.
    await waitFor(() => expect(calls.filter((c) => c.method === 'GET' && c.url === '/x/console/growth_post/p1/sessions/s1').length).toBeGreaterThan(0));
  });

  it('follows nothing when the answer is already recorded (the design holds the result) or the run is too old', async () => {
    window.localStorage.setItem(KEY, JSON.stringify({ run: 'r7', path: null, at: Date.now() }));
    const done = fakeApi([ask(), answer('a1', 'r7')]);
    const first = subject(done.api);
    const { result, unmount } = renderHook(() => useStudioConsole(first, options));
    await waitFor(() => expect(result.current.host.terminal.turns).toHaveLength(2));
    await waitFor(() => expect(window.localStorage.getItem(KEY)).toBeNull());
    expect(done.runs.getRun).not.toHaveBeenCalled();
    expect(first.land).not.toHaveBeenCalled();
    unmount();

    window.localStorage.setItem(KEY, JSON.stringify({ run: 'r8', path: null, at: Date.now() - 11 * 60 * 1000 }));
    const old = fakeApi([ask()]);
    const second = subject(old.api);
    const again = renderHook(() => useStudioConsole(second, options));
    await waitFor(() => expect(again.result.current.host.terminal.loading).toBe(false));
    await waitFor(() => expect(window.localStorage.getItem(KEY)).toBeNull());
    expect(old.runs.getRun).not.toHaveBeenCalled();
  });
});

describe('a subject with its own design shape and a host that owns the open state (1.64.0)', () => {
  beforeEach(() => window.localStorage.clear());

  type CardDesign = { source: string; nodes: Node[]; alt: string | null };

  it("restores a share card's rewind point in the card's own shape, opens through the host, and names its own verb", async () => {
    const design: CardDesign = { source: 'designed', nodes: [{ primitive: 'heading', uid: 'h1' }], alt: 'Our checklist' };
    const turns: TerminalTurn[] = [
      { id: 'u1', role: 'user', body: 'Shorten the headline', structured: null, rewound: false, at: null },
      { ...answer('a1', 'r1'), structured: { run_id: 'r1', checkpoint_id: 'cp1', outcome: { changed: true } as never } },
    ];
    const console = () => ({ subject: { ref: 'site_page_card:p1', label: 'Card' }, session, turns, brief: null, size: { design_chars: 100, budget_tokens: 1000 } as never, history: [] });
    const fetcher: ConsoleFetcher = {
      get: vi.fn(async (url: string) => (url === '/x/cp' ? { checkpoint: { id: 'cp1', design, created_at: null } } : console()) as never),
      post: vi.fn(async () => console() as never),
      put: vi.fn(async () => ({}) as never),
    };
    const api = { ...createConsoleApi<'site_page_card', CardDesign>({ base, checkpointUrl: () => '/x/cp', fetcher }), startRun: vi.fn(), getRun: vi.fn(), stopRun: vi.fn() };
    const restore = vi.fn();
    const onOpenChange = vi.fn();
    const subject: StudioConsoleSubject<'site_page_card', Node, unknown, CardDesign> = {
      api, kind: 'site_page_card', id: 'p1', noun: 'card', nodes: [], flush: async () => true, land: vi.fn(), restore,
      labelFor: () => '', canAim: () => false,
    };
    const { result } = renderHook(() =>
      useStudioConsole(subject, { ...options, open: false, onOpenChange, offset: { top: '76px', height: 'h-[calc(100dvh-88px)]' }, workingVerb: 'Designing' }),
    );
    await waitFor(() => expect(result.current.host.terminal.turns).toHaveLength(2));

    // The host's own state, not the console's memory; a hand-off asks the host to open it.
    expect(result.current.host.open).toBe(false);
    expect(result.current.host.offset).toEqual({ top: '76px', height: 'h-[calc(100dvh-88px)]' });
    act(() => result.current.handOff({ text: 'Make it bolder', path: null }));
    expect(onOpenChange).toHaveBeenCalledWith(true);

    await act(async () => result.current.host.terminal.onRewind?.('u1', 'design'));
    expect(restore).toHaveBeenCalledWith(design);
    // A card has no elements to aim at: no "@" at all.
    expect(result.current.host.terminal.mentions).toBeUndefined();
  });
});

describe('the tree helpers', () => {
  it('find and replace an element by its path, leaving the rest as it was', () => {
    expect(nodeAtPath(NODES, [1, 0])?.uid).toBe('h1');
    expect(nodeAtPath(NODES, [5])).toBeNull();

    const next = replaceAtPath(NODES, [1, 0], { primitive: 'heading', uid: 'h2' });
    expect(nodeAtPath(next, [1, 0])?.uid).toBe('h2');
    expect(next[0]).toBe(NODES[0]);
    expect(NODES[1]?.children?.[0]?.uid).toBe('h1');
  });
});
