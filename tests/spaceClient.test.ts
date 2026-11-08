import { describe, expect, it, vi } from 'vitest';
import { createAssistantSpaceClient, type AssistantSpaceFetcher } from '../src';

/**
 * The space client (1.43, plan S3a): every call hits the kit's AssistantRoutes path and method, the
 * envelope's `data` is unwrapped, a failure keeps the server's reason, and no call names a space.
 */
function setup(reply: unknown = { success: true, data: {} }) {
  const fetcher = vi.fn<AssistantSpaceFetcher>(async () => reply);
  const client = createAssistantSpaceClient({ base: '/api/proxy/assistant/space/', fetcher, headers: () => ({ Authorization: 'Bearer t' }) });
  return { fetcher, client };
}

describe('createAssistantSpaceClient', () => {
  it('lists, searches and renames threads on the kit paths, ready for useAssistantThreads', async () => {
    const { fetcher, client } = setup({ success: true, data: { items: [{ id: 'a' }], next_before: null, pinned: [] } });

    expect(await client.threads.list(null)).toEqual({ items: [{ id: 'a' }], next_before: null, pinned: [] });
    await client.threads.list('cursor-1');
    await client.threads.search('spouse');
    await client.threads.update('t 1', { pinned: true });

    expect(fetcher.mock.calls).toEqual([
      ['GET', 'threads', { query: undefined }],
      ['GET', 'threads', { query: { before: 'cursor-1' } }],
      ['GET', 'threads/search', { query: { q: 'spouse' } }],
      ['PATCH', 'threads/t%201', { body: { pinned: true } }],
    ]);
  });

  it('reads a thread, the conversation to reopen and the up-arrow ring', async () => {
    const fetcher = vi.fn<AssistantSpaceFetcher>(async (_m, path) => {
      if (path === 'active-conversation') return { data: { conversation_id: 'c-9' } };
      if (path === 'input-history') return { data: { history: ['Newest', 'Older'] } };
      return { data: { conversation: { id: 'c-1' }, messages: [{ id: 'm-1' }] } };
    });
    const client = createAssistantSpaceClient({ base: '/x', fetcher });

    expect(await client.loadConversation('c-1')).toEqual({ id: 'c-1', messages: [{ id: 'm-1' }] });
    expect(await client.restore()).toBe('c-9');
    expect(await client.inputHistory()).toEqual(['Newest', 'Older']);
  });

  it('reads, corrects and forgets memory', async () => {
    const { fetcher, client } = setup({ data: { fact: { key: 'pref.tone', value: 'brief' }, forgotten: 3 } });

    await client.memory.correct('pref.tone', 'brief', 'Tone');
    await client.memory.forget('pref.tone');
    expect(await client.memory.forgetAll()).toBe(3);

    expect(fetcher.mock.calls.map((c) => [c[0], c[1], c[2]?.body])).toEqual([
      ['PUT', 'memory/pref.tone', { value: 'brief', label: 'Tone' }],
      ['DELETE', 'memory/pref.tone', undefined],
      ['DELETE', 'memory', undefined],
    ]);
  });

  it('votes and keeps a card outcome by the service ids', async () => {
    const { fetcher, client } = setup();

    await client.vote('c-1', 't-1', { sentiment: 'negative', reason_code: 'outdated_info' });
    await client.cardState('c-1', 't-1', { status: 'done' });

    expect(fetcher.mock.calls).toEqual([
      ['POST', 'conversations/c-1/turns/t-1/feedback', { body: { sentiment: 'negative', reason_code: 'outdated_info' } }],
      ['PATCH', 'conversations/c-1/turns/t-1/card-state', { body: { state: { status: 'done' } } }],
    ]);
  });

  it('hands useAssistantConversation the kit stream, Stop and restore', async () => {
    const { client } = setup({ data: { conversation_id: null } });

    expect(client.conversation.sendUrl).toBe('/api/proxy/assistant/space/chat/stream');
    expect(client.conversation.streamUrl).toBe('/api/proxy/assistant/space/chat/stream');
    expect(client.conversation.cancelUrl?.('turn-1')).toBe('/api/proxy/assistant/space/chat/stream/turn-1');
    expect(client.conversation.headers?.()).toEqual({ Authorization: 'Bearer t' });
    expect(await client.conversation.restore?.()).toBeNull();
  });

  it('a failure keeps the server reason for the product to show', async () => {
    const fetcher = vi.fn<AssistantSpaceFetcher>(async () => {
      throw new Error('You can pin up to 10 conversations. Unpin one first.');
    });
    const client = createAssistantSpaceClient({ base: '/x', fetcher });

    await expect(client.threads.update('t', { pinned: true })).rejects.toThrow('You can pin up to 10 conversations.');
  });

  it('never names a space: the server resolves it from the session', async () => {
    const { fetcher, client } = setup();
    await client.threads.list(null);
    await client.memory.list();
    expect(JSON.stringify(fetcher.mock.calls)).not.toMatch(/space_id|owner_ref/);
  });
});
