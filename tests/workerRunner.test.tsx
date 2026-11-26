import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useWorkerConsoleRunner, waitForWorkerRun, type WorkerRun, type WorkerRunApi } from '../src/terminal/useWorkerConsoleRunner';

/**
 * The kit's worker runner (1.63.0, shared Studio P4a2, moved from Portify): an ask starts a background run and polls
 * it; the finished run lands through the product; a REFUSED ask is said in the console in the server's own words;
 * anything else reaches the product's error surface.
 */
function refusal(status: number, message: string) {
  return Object.assign(new Error('Request failed with status code ' + status), { status, response: { status, data: { message } } });
}

function api(startRun: WorkerRunApi['startRun'], getRun: WorkerRunApi['getRun'] = vi.fn()): WorkerRunApi {
  return { startRun, getRun, stopRun: vi.fn().mockResolvedValue(undefined) };
}

const instant = async () => undefined;

describe('useWorkerConsoleRunner', () => {
  it('runs an ask on the worker, draws its steps, and lands the finished run once', async () => {
    const finished: WorkerRun<{ nodes: string[] }> = { id: 'r1', status: 'succeeded', summary: 'I shortened the intro.', data: { nodes: ['p'] } };
    const getRun = vi
      .fn()
      .mockResolvedValueOnce({ id: 'r1', status: 'running', summary: null, progress: { steps: [{ kind: 'read', text: 'Reading the email' }] } })
      .mockResolvedValueOnce(finished);
    const startRun = vi.fn().mockResolvedValue({ run: { id: 'r1', status: 'queued', summary: null } });
    const onLanded = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() => useWorkerConsoleRunner(api(startRun, getRun), 'e1', () => ({ session_id: 's1' }), onLanded, { onError, sleep: instant }));

    let line: string | null = null;
    await act(async () => {
      line = await result.current.ask('Shorten the intro', null, ['f1']);
    });

    expect(line).toBe('I shortened the intro.');
    expect(startRun).toHaveBeenCalledWith('e1', { instruction: 'Shorten the intro', session_id: 's1', reference_ids: ['f1'] });
    // The second look asks only for what is new since the first.
    expect(getRun).toHaveBeenNthCalledWith(2, 'r1', 0, 1);
    expect(onLanded).toHaveBeenCalledTimes(1);
    expect(onLanded).toHaveBeenCalledWith(finished);
    expect(onError).not.toHaveBeenCalled();
    expect(result.current.building).toBeNull();
  });

  it('follows a run it did not start (a reload mid-run): steps from the start, lands once, and reports the run as it starts and ends', async () => {
    const finished: WorkerRun = { id: 'r5', status: 'succeeded', summary: 'I shortened the answer.', data: { applied: true } };
    const getRun = vi.fn().mockResolvedValueOnce({ id: 'r5', status: 'running', summary: null, progress: { steps: [{ kind: 'read', text: 'Reading the element' }] } }).mockResolvedValueOnce(finished);
    const startRun = vi.fn();
    const onLanded = vi.fn();
    const onRunChange = vi.fn();
    const { result } = renderHook(() => useWorkerConsoleRunner(api(startRun, getRun), 'p1', () => ({}), onLanded, { onError: vi.fn(), onRunChange, sleep: instant }));

    let line: string | null = null;
    await act(async () => {
      line = await result.current.resume('r5');
    });

    expect(line).toBe('I shortened the answer.');
    expect(startRun).not.toHaveBeenCalled();
    expect(getRun).toHaveBeenNthCalledWith(1, 'r5', 0, 0);
    expect(onLanded).toHaveBeenCalledWith(finished);
    expect(onRunChange.mock.calls).toEqual([['r5'], [null]]);
    expect(result.current.building).toBeNull();
  });

  it('a resumed run that failed says so on the error surface and is forgotten', async () => {
    const onError = vi.fn();
    const onRunChange = vi.fn();
    const getRun = vi.fn().mockResolvedValue({ id: 'r6', status: 'failed', summary: 'I could not finish that just now.' });
    const { result } = renderHook(() => useWorkerConsoleRunner(api(vi.fn(), getRun), 'p1', () => ({}), vi.fn(), { onError, onRunChange, sleep: instant }));

    await act(async () => {
      await result.current.resume('r6');
    });

    expect(onError).toHaveBeenCalledWith(new Error('I could not finish that just now.'));
    expect(onRunChange.mock.calls.at(-1)).toEqual([null]);
  });

  it("says a 422's own sentence in the console and keeps the ask's words (returns null)", async () => {
    const onRefused = vi.fn();
    const onError = vi.fn();
    const startRun = vi.fn().mockRejectedValue(refusal(422, 'Right now I can prepare this newsletter from a document.'));
    const { result } = renderHook(() => useWorkerConsoleRunner(api(startRun), 'c1', () => ({}), vi.fn(), { onError, onRefused }));

    let line: string | null = 'unset';
    await act(async () => {
      line = await result.current.ask('Shorten the intro', null, []);
    });

    expect(line).toBeNull();
    expect(onRefused).toHaveBeenCalledWith('Right now I can prepare this newsletter from a document.');
    expect(onError).not.toHaveBeenCalled();
  });

  it("without a console note, the refusal reaches the product's error surface in the server's words", async () => {
    const onError = vi.fn();
    const startRun = vi.fn().mockRejectedValue(refusal(409, 'That part of the post is no longer there.'));
    const { result } = renderHook(() => useWorkerConsoleRunner(api(startRun), 'p1', () => ({}), vi.fn(), { onError }));

    await act(async () => {
      await result.current.ask('Rewrite this section', [0], []);
    });

    expect(onError).toHaveBeenCalledWith('That part of the post is no longer there.');
  });

  it('any other failure goes to the error surface as the error it is', async () => {
    const onRefused = vi.fn();
    const onError = vi.fn();
    const failure = refusal(500, 'Server Error');
    const { result } = renderHook(() => useWorkerConsoleRunner(api(vi.fn().mockRejectedValue(failure)), 'c1', () => ({}), vi.fn(), { onError, onRefused }));

    await act(async () => {
      await result.current.ask('Prepare it', null, []);
    });

    expect(onRefused).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(failure);
  });
});

describe('useWorkerConsoleRunner: Plan first and Brainstorm (1.70.0)', () => {
  const planned: WorkerRun = { id: 'p1', status: 'succeeded', summary: 'I would warm up the headline.', data: { kind: 'plan' } };

  it('in Plan first an ask starts a plan run, lands nothing and is not remembered across a reload', async () => {
    const startRun = vi.fn();
    const startPlanRun = vi.fn().mockResolvedValue({ run: { id: 'p1', status: 'queued', summary: null } });
    const getRun = vi.fn().mockResolvedValue(planned);
    const onLanded = vi.fn();
    const onRunChange = vi.fn();
    const { result } = renderHook(() =>
      useWorkerConsoleRunner({ ...api(startRun, getRun), startPlanRun }, 'pg', () => ({ session_id: 's1' }), onLanded, { onError: vi.fn(), onRunChange, sleep: instant }),
    );

    act(() => result.current.setPlanFirst(true));
    expect(result.current.planFirst).toBe(true);

    let line: string | null = null;
    await act(async () => {
      line = await result.current.ask('Warm up the headline', null);
    });

    expect(line).toBe('I would warm up the headline.');
    expect(startPlanRun).toHaveBeenCalledWith('pg', { instruction: 'Warm up the headline', session_id: 's1', kind: 'plan' });
    expect(startRun).not.toHaveBeenCalled();
    expect(onLanded).not.toHaveBeenCalled();
    expect(onRunChange).not.toHaveBeenCalled();
  });

  it('Brainstorm and Plan first switch each other off, and an ask asked in a mode runs in it', async () => {
    const startPlanRun = vi.fn().mockResolvedValue({ run: { id: 'p1', status: 'queued', summary: null } });
    const { result } = renderHook(() =>
      useWorkerConsoleRunner({ ...api(vi.fn(), vi.fn().mockResolvedValue(planned)), startPlanRun }, 'pg', () => ({}), vi.fn(), { onError: vi.fn(), sleep: instant }),
    );

    act(() => result.current.setPlanFirst(true));
    act(() => result.current.setBrainstorm(true));
    expect([result.current.planFirst, result.current.brainstorm]).toEqual([false, true]);

    await act(async () => {
      await result.current.ask('What would help a reader?', null);
    });
    expect(startPlanRun).toHaveBeenLastCalledWith('pg', { instruction: 'What would help a reader?', kind: 'brainstorm' });
  });

  it('Build this builds the plan from the session with its steps, and lands it like any Build', async () => {
    const built: WorkerRun = { id: 'b1', status: 'succeeded', summary: 'I warmed up the headline.', data: { nodes: [] } };
    const startRun = vi.fn().mockResolvedValue({ run: { id: 'b1', status: 'queued', summary: null } });
    const onLanded = vi.fn();
    const { result } = renderHook(() =>
      useWorkerConsoleRunner({ ...api(startRun, vi.fn().mockResolvedValue(built)), startPlanRun: vi.fn() }, 'pg', () => ({}), onLanded, { onError: vi.fn(), sleep: instant }),
    );

    await act(async () => {
      await result.current.buildAgreed('Warm up the headline', ['Rewrite the headline.']);
    });

    expect(startRun).toHaveBeenCalledWith('pg', { instruction: 'Warm up the headline', plan: ['Rewrite the headline.'] });
    expect(onLanded).toHaveBeenCalledWith(built);
  });

  it('a product that cannot plan builds every ask, whatever the mode says', async () => {
    const startRun = vi.fn().mockResolvedValue({ run: { id: 'b2', status: 'queued', summary: null } });
    const { result } = renderHook(() =>
      useWorkerConsoleRunner(api(startRun, vi.fn().mockResolvedValue({ id: 'b2', status: 'succeeded', summary: 'Done.' })), 'pg', () => ({}), vi.fn(), { onError: vi.fn(), sleep: instant }),
    );

    act(() => result.current.setPlanFirst(true));
    await act(async () => {
      await result.current.ask('Warm up the headline', null);
    });

    expect(startRun).toHaveBeenCalledTimes(1);
  });
});

describe('waitForWorkerRun', () => {
  it("throws a failed run's own words", async () => {
    const getRun = vi.fn().mockResolvedValue({ id: 'r1', status: 'failed', summary: 'I could not open the email.' });

    await expect(waitForWorkerRun({ getRun }, 'r1', undefined, { sleep: instant })).rejects.toThrow('I could not open the email.');
  });

  it('stops waiting after the give-up time and says so in the first person', async () => {
    const getRun = vi.fn().mockResolvedValue({ id: 'r1', status: 'running', summary: null });

    await expect(waitForWorkerRun({ getRun }, 'r1', undefined, { sleep: instant, giveUpMs: -1 })).rejects.toThrow(/I stopped waiting/);
  });
});
