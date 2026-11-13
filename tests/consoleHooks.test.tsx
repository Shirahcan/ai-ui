import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useConsoleData } from '../src/terminal/useConsoleData';
import { useConsoleGuides, useConsoleTemplates } from '../src/terminal/useConsoleGuides';
import type { TerminalConsoleData, TerminalTurn } from '../src/terminal/types';

/**
 * The console's state hooks for any product (shared console C4b): they read and write only through the api they
 * are handed, a failure becomes a note a person can act on, and guides and templates stay silent while the
 * product's switch is off.
 */
const session = (id: string, extra: Record<string, unknown> = {}) => ({ session: { id }, turns: [], ...extra }) as unknown as TerminalConsoleData;

function fakeApi(overrides: Record<string, unknown> = {}) {
  return {
    open: vi.fn(async () => session('s1')),
    start: vi.fn(async () => session('s2')),
    openSession: vi.fn(async () => session('s1')),
    sessions: vi.fn(async () => [{ id: 's1' }]),
    commands: vi.fn(async () => []),
    saveCommands: vi.fn(async (_k: string, _i: string, next: unknown) => next),
    saveSpecialization: vi.fn(async () => ({ specialization: { key: 'blog_post', name: 'Blog post' }, specializations: [], specialization_choice: null })),
    saveTemplate: vi.fn(async () => ({ template: { key: 'story', name: 'Story' }, templates: [], template_choice: null })),
    ...overrides,
  } as never;
}

describe('useConsoleData', () => {
  it('opens the session and carries it on every ask', async () => {
    const api = fakeApi();
    const { result } = renderHook(() => useConsoleData(api, 'page', 'p1', true));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.sessionId()).toBe('s1');

    result.current.setAskMeta({ target: 'hero', files: ['brief.pdf'] });
    result.current.setTuning({ level: 'pro' });
    expect(result.current.extras()).toMatchObject({ session_id: 's1', console_target: 'hero', console_files: ['brief.pdf'], level: 'pro' });
  });

  it('says so in a note when the history cannot be read, and asks still work', async () => {
    const api = fakeApi({ open: vi.fn(async () => Promise.reject(new Error('500'))), start: vi.fn(async () => session('s9')) });
    const { result } = renderHook(() => useConsoleData(api, 'page', 'p1', true));

    await waitFor(() => expect(result.current.notes).toHaveLength(1));
    expect(result.current.notes[0]?.tone).toBe('fail');
    expect(await result.current.ensureSession('Make the hero shorter')).toBe('s9');
  });

  it('puts the commands back when the service refuses them', async () => {
    const api = fakeApi({ saveCommands: vi.fn(async () => Promise.reject(new Error('422'))) });
    const { result } = renderHook(() => useConsoleData(api, 'page', 'p1', true));

    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => result.current.saveCommands([{ name: 'tidy', prompt: 'Tidy it' } as never]));

    expect(result.current.commands).toEqual([]);
    expect(result.current.notes.at(-1)?.text).toMatch(/could not be saved/);
  });

  it('reads nothing while the product has the console off', () => {
    const api = fakeApi();

    renderHook(() => useConsoleData(api, 'page', 'p1', false));
    expect((api as unknown as { open: ReturnType<typeof vi.fn> }).open).not.toHaveBeenCalled();
  });
});

describe('useConsoleGuides and useConsoleTemplates', () => {
  const loaded = (extra: Record<string, unknown>) =>
    ({ data: session('s1', extra), accept: vi.fn(), note: vi.fn() }) as never;

  it('offers nothing while the product switch is off', () => {
    const { result } = renderHook(() =>
      useConsoleGuides({ api: fakeApi(), kind: 'page', id: 'p1', console: loaded({ specializations: [] }), turns: [], enabled: false }),
    );

    expect(result.current).toEqual({});
  });

  it('switches the guide and says what happens from the next ask', async () => {
    const data = loaded({ specialization: null, specializations: [{ key: 'blog_post' }] });
    const { result } = renderHook(() => useConsoleGuides({ api: fakeApi(), kind: 'page', id: 'p1', console: data, turns: [], enabled: true, manageHref: '/manage' }));

    expect(result.current.manageSpecializationsHref).toBe('/manage');
    expect(result.current.onProposal).toBeUndefined();

    result.current.onSpecializationChange?.('blog_post');
    await waitFor(() => expect((data as unknown as { note: ReturnType<typeof vi.fn> }).note).toHaveBeenCalledWith('I follow the Blog post guide here from your next ask.', 'ok'));
  });

  it('applies drafted fields through the product and remembers the choice', async () => {
    const apply = vi.fn(async () => undefined);
    const turns = [{ id: 't1', role: 'assistant', structured: { run_id: 'r1', outcome: { proposal: { fields: [{ key: 'title' }] } } } }] as unknown as TerminalTurn[];
    const { result } = renderHook(() =>
      useConsoleGuides({ api: fakeApi(), kind: 'page', id: 'p1', console: loaded({ specializations: [] }), turns, enabled: true, proposals: { apply, storageKey: 'test:proposals' } }),
    );

    act(() => result.current.onProposal?.('t1', 'apply'));
    await waitFor(() => expect(result.current.proposalState?.('t1')).toBe('applied'));
    expect(apply).toHaveBeenCalledWith('r1', ['title']);
  });

  it('starts a new subject\'s composer from the template the person chose', () => {
    const data = loaded({ session: null, template: { key: 'story', name: 'Story', source: 'person' }, templates: [{ key: 'story', name: 'Story', starter: 'Tell the story of...' }], template_choice: null });
    const { result } = renderHook(() => useConsoleTemplates({ api: fakeApi(), kind: 'page', id: 'p1', console: data, turns: [], enabled: true }));

    expect(result.current.starter).toBe('Tell the story of...');
  });
});
