import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AssistantSpacePanel,
  createAssistantSpaceClient,
  type AssistantSpaceAdapter,
  type AssistantSpaceFetcher,
  type PanelMessage,
} from '../src';

/**
 * The ONE panel (1.43, plan S3c). Owner 2026-11-08: "a true (completely) shared component".
 *
 * ⚠ WHAT THIS GUARDS: two products with different adapters get the same chrome (header, menu, memory,
 * composer, Stop); the memory view opens INSIDE the panel; a vote names the service's turn, not the
 * product's message id; a failure reaches the product's error surface with the real reason.
 */
const theme = { surface: '#fff', fg: '#111', muted: '#666', border: '#ddd', accent: '#6f6df3', accentFg: '#fff' };

function fakeFetcher(overrides: Partial<Record<string, unknown>> = {}) {
  return vi.fn<AssistantSpaceFetcher>(async (method, path) => {
    const key = `${method} ${path}`;
    if (key in overrides) {
      const value = overrides[key];
      if (value instanceof Error) throw value;
      return value;
    }
    if (key === 'GET active-conversation') return { data: { conversation_id: 'c-1' } };
    if (key === 'GET conversations/c-1')
      return {
        data: {
          conversation: { id: 'c-1', title: 'Biometrics' },
          messages: [
            { id: 'p-user', ai_turn_id: 't-user', role: 'user', content: 'When are biometrics due?' },
            { id: 'p-answer', ai_turn_id: 't-answer', role: 'assistant', content: 'Book the appointment soon.' },
          ],
        },
      };
    if (key === 'GET input-history') return { data: { history: ['When are biometrics due?'] } };
    if (key === 'GET memory') return { data: { memory: [{ key: 'identity.name', label: 'Name', value: 'Amara', source: 'explicit', updated_at: null }] } };
    if (key === 'GET threads') return { data: { items: [{ id: 'c-1', title: 'Biometrics', audience: null, last_message_at: null, created_at: null, pinned: false }], next_before: null, pinned: [] } };
    return { data: {} };
  });
}

function adapter(extra: Partial<AssistantSpaceAdapter> = {}): AssistantSpaceAdapter {
  return {
    toPanelMessage: (raw: unknown): PanelMessage => {
      const m = raw as { id: string; role: string; content: string };
      return { id: m.id, role: m.role === 'user' ? 'user' : 'assistant', text: m.content };
    },
    intro: { greeting: 'Hi', body: 'Ask me anything.', prompts: [] },
    onError: vi.fn(),
    ...extra,
  };
}

function mount(fetcher: ReturnType<typeof fakeFetcher>, a: AssistantSpaceAdapter, name = 'Mira') {
  const client = createAssistantSpaceClient({ base: '/api/assistant/space', fetcher });
  return render(<AssistantSpacePanel client={client} accountKey="u-1" assistantName={name} theme={theme} adapter={a} onClose={() => {}} />);
}

describe('AssistantSpacePanel', () => {
  beforeEach(() => {
    Object.defineProperty(Element.prototype, 'scrollTo', { value: vi.fn(), configurable: true });
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true });
  });

  it('restores the last conversation and draws the assistant by name', async () => {
    mount(fakeFetcher(), adapter());

    expect(await screen.findByText('Book the appointment soon.')).toBeTruthy();
    expect(screen.getAllByText('Mira').length).toBeGreaterThan(0);
    expect(screen.getByPlaceholderText('Ask a question...')).toBeTruthy();
  });

  it('gives a minimal and a full adapter the same menu, memory included', async () => {
    const menuOf = async (a: AssistantSpaceAdapter) => {
      const view = mount(fakeFetcher(), a);
      await screen.findByText('Book the appointment soon.');
      fireEvent.click(screen.getByRole('button', { name: /Open the menu/ }));
      const items = screen.getAllByRole('button').map((b) => b.textContent?.trim()).filter(Boolean);
      view.unmount();
      return items;
    };

    const minimal = await menuOf(adapter());
    const full = await menuOf(adapter({ actions: [{ key: 'help', label: 'Get help', onClick: () => {} }], expandable: true }));

    expect(minimal).toContain('What Mira knows about you');
    expect(full).toContain('What Mira knows about you');
    expect(full).toContain('Get help');
    expect(minimal.filter((l) => l !== 'Get help')).toEqual(full.filter((l) => l !== 'Get help'));
  });

  it("draws a product's conversation-dependent menu item and its notice", async () => {
    const seen: Array<string | null> = [];
    mount(
      fakeFetcher(),
      adapter({
        actions: (panel) => {
          seen.push(panel.conversationId);
          return panel.conversationId ? [{ key: 'help', label: 'Get help', onClick: () => {} }] : [];
        },
        notice: 'A support ticket was created.',
      }),
    );
    await screen.findByText('Book the appointment soon.');

    expect(screen.getByText('A support ticket was created.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Open the menu/ }));
    expect(await screen.findByText('Get help')).toBeTruthy();
    expect(seen).toContain('c-1');
  });

  it('opens "What Mira knows about you" inside the panel and Back returns to the chat', async () => {
    mount(fakeFetcher(), adapter());
    await screen.findByText('Book the appointment soon.');

    fireEvent.click(screen.getByRole('button', { name: /Open the menu/ }));
    await act(async () => fireEvent.click(screen.getByText('What Mira knows about you')));

    expect(await screen.findByText('Amara')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to the chat' }));
    await waitFor(() => expect(screen.queryByText('Amara')).toBeNull());
  });

  it('votes on an answer by the service turn id, not the product message id', async () => {
    const fetcher = fakeFetcher();
    mount(fetcher, adapter());
    await screen.findByText('Book the appointment soon.');

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'This reply was helpful' })));

    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith('POST', 'conversations/c-1/turns/t-answer/feedback', { body: { sentiment: 'positive' } }),
    );
  });

  it('hands a failed delete to the product with the real reason', async () => {
    const reason = new Error('The assistant is not reachable right now. Try again in a moment.');
    const a = adapter();
    mount(fakeFetcher({ 'DELETE conversations/c-1': reason }), a);
    await screen.findByText('Book the appointment soon.');

    fireEvent.click(screen.getByRole('button', { name: /Open the menu/ }));
    await screen.findByText('Biometrics', { selector: '*' });
    const menu = await screen.findByRole('button', { name: /Actions for conversation: Biometrics/ });
    fireEvent.click(menu);
    fireEvent.click(await screen.findByText('Delete'));
    const confirm = screen.queryAllByRole('button', { name: /^Delete/ }).at(-1);
    if (confirm) await act(async () => fireEvent.click(confirm));

    await waitFor(() => expect(a.onError).toHaveBeenCalledWith(reason));
  });
});
