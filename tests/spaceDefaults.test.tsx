import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type SpaceCardState,
  AssistantSpacePanel,
  createAssistantSpaceClient,
  defaultHandlers,
  defaultToPanelMessage,
  type AssistantSpaceFetcher,
} from '../src';

/**
 * The defaults most products use (1.43; owner 2026-11-08: "message format and card buttons should have
 * proper defaults ... suggested prompts should be optional and auto handled from the knowledge and
 * audience").
 */
describe('defaultToPanelMessage', () => {
  it('reads the neutral turn the kit hands back', () => {
    expect(
      defaultToPanelMessage({ id: 't-1', role: 'assistant', content: 'Hello', structured: { kind: 'cards', meta: { a: 1 } }, created_at: '2026-11-08T10:00:00Z' }),
    ).toEqual({ id: 't-1', role: 'assistant', text: 'Hello', kind: 'cards', meta: { a: 1 }, at: '2026-11-08T10:00:00Z' });
  });

  it("reads Porter's shape, so Porter needs no mapper of its own", () => {
    const m = defaultToPanelMessage({
      id: 'p-1', role: 'assistant', content: 'Filed.', kind: 'action_module', meta: { executed: true }, is_grounded: false,
      attachments: [{ id: 'f', name: 'letter.pdf' }], created_at: '2026-11-08T10:00:00Z',
    });
    expect(m).toMatchObject({ id: 'p-1', text: 'Filed.', kind: 'action_module', meta: { executed: true }, grounded: false });
    expect(m.attachments).toHaveLength(1);
  });

  it('a user turn is the person, and a message with no words is empty text, never a crash', () => {
    expect(defaultToPanelMessage({ id: 'u', role: 'user', body: 'Hi' }).role).toBe('user');
    expect(defaultToPanelMessage(null)).toMatchObject({ id: '', role: 'assistant', text: '' });
  });
});

describe('defaultHandlers', () => {
  it('links navigate, an intake starts in the chat, Cancel is kept, a settled card stays settled', () => {
    const navigate = vi.fn();
    const ask = vi.fn();
    const kept = new Map<string, SpaceCardState>([['m-done', { card: 'done' }]]);
    const keepCardState = vi.fn((id: string, s: SpaceCardState) => {
      kept.set(id, s);
    });
    const h = defaultHandlers({ navigate, ask, cardState: (id) => kept.get(id), keepCardState });

    h.onCta?.({ label: 'Open the case', href: '/consultant/cases/1' }, { id: 'm', role: 'assistant', text: '' });
    h.onNavigate?.('/admin/people');
    h.onStartIntake?.('I want to study in Canada', { id: 'm', role: 'assistant', text: '' });
    h.onCancelAction?.({ messageId: 'm-1', actionId: 'a', moduleId: 'send_message', params: {}, timezone: null });

    expect(navigate.mock.calls).toEqual([['/consultant/cases/1'], ['/admin/people']]);
    expect(ask).toHaveBeenCalledWith('I want to study in Canada');
    expect(keepCardState).toHaveBeenCalledWith('m-1', { card: 'cancelled' });
    expect(h.actionState?.('m-1')).toBe('cancelled');
    expect(h.actionState?.('m-done')).toBe('done');
  });
});

describe('AssistantSpacePanel defaults', () => {
  beforeEach(() => {
    Object.defineProperty(Element.prototype, 'scrollTo', { value: vi.fn(), configurable: true });
  });

  const theme = { surface: '#fff', fg: '#111', muted: '#666', border: '#ddd', accent: '#000', accentFg: '#fff' };

  function fetcher(prompts: string[]) {
    return vi.fn<AssistantSpaceFetcher>(async (_m, path) => {
      if (path === 'prompts') return { data: { prompts } };
      if (path === 'active-conversation') return { data: { conversation_id: null } };
      return { data: {} };
    });
  }

  it("with no mapper, intro or prompts, greets by the assistant's name and offers the space's questions for this screen", async () => {
    const f = fetcher(['Which documents are still outstanding on my client\'s case?']);
    render(
      <AssistantSpacePanel
        client={createAssistantSpaceClient({ base: '/x', fetcher: f })}
        accountKey="u-1" assistantName="Mira" theme={theme} route="/consultant/cases/9"
        adapter={{ onError: vi.fn() }} onClose={() => {}}
      />,
    );

    expect(await screen.findByText("Which documents are still outstanding on my client's case?", {}, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByText("Hi, I'm Mira.")).toBeTruthy();
    expect(f).toHaveBeenCalledWith('GET', 'prompts', { query: { route: '/consultant/cases/9' } });
  });

  it("a product's own prompts win and the space is not asked", async () => {
    const f = fetcher(['From the space?']);
    render(
      <AssistantSpacePanel
        client={createAssistantSpaceClient({ base: '/x', fetcher: f })}
        accountKey="u-1" assistantName="Porter" theme={theme}
        adapter={{ onError: vi.fn(), intro: { greeting: 'Hi Maria', prompts: ['Where is my case?'] } }} onClose={() => {}}
      />,
    );

    expect(await screen.findByText('Where is my case?', {}, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByText('Hi Maria')).toBeTruthy();
    await waitFor(() => expect(f.mock.calls.some((c) => c[1] === 'prompts')).toBe(false));
  });
});
