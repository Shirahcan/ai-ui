/**
 * The panel's data through the person's assistant SPACE (1.43, Portify plan assistant-spaces-2026-11-08
 * S3a). One client for every route the kit's `AssistantRoutes::mount()` serves, so no product writes
 * `listThreads`, `getMemory`, `vote`... again.
 *
 * ⚠ AUTH STAYS THE PRODUCT'S. `fetcher` is the product's own authenticated request function (Portify's
 * axios proxy, MployNow's api client); the stream uses `base` + `headers()` because it is read with
 * `fetch`. The space itself is resolved by the server from the session: no call here names one.
 *
 * ⚠ ERRORS KEEP THEIR REASON. A failure rejects with the server's `message` (the kit passes ai-service's
 * own sentence through), so the product's error surface shows the real reason.
 */
import type { AssistantThreadRow, AssistantThreadsApi } from '../useAssistantThreads';
import type { AssistantConversationOptions } from '../useAssistantConversation';

export type SpaceMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * The product's authenticated request: resolve with the parsed JSON body, reject on a non-2xx with an
 * Error whose message is the server's `message`.
 */
export type AssistantSpaceFetcher = (
  method: SpaceMethod,
  path: string,
  options?: { query?: Record<string, string | number | boolean | undefined>; body?: unknown },
) => Promise<unknown>;

export interface AssistantSpaceClientOptions {
  /** The browser URL of the mounted routes, e.g. `/api/proxy/assistant/space`. No trailing slash. */
  base: string;
  /** Paths are relative to `base` ("threads", "memory/pref.tone"). */
  fetcher: AssistantSpaceFetcher;
  /** Headers for the streamed turn (a bearer, a CSRF token). */
  headers?: () => Record<string, string>;
}

/** One remembered fact, as the person reads and corrects it. */
export interface AssistantMemoryFact {
  key: string;
  label: string;
  value: string;
  source: 'explicit' | 'inferred' | string;
  updated_at: string | null;
}

export type AssistantVote =
  | { sentiment: 'positive' }
  | {
      sentiment: 'negative';
      reason_code?: 'wrong_topic' | 'outdated_info' | 'didnt_understand' | 'missing_detail' | 'unhelpful_other';
      reason_text?: string;
    };

export interface AssistantSpaceClient {
  /** Plug straight into `useAssistantThreads`. */
  threads: AssistantThreadsApi;
  /** A thread with its messages, in the product's message shape (the kit's `SpaceMessages`). */
  loadConversation: (id: string) => Promise<{ id: string; messages: unknown[] }>;
  eraseConversation: (id: string) => Promise<void>;
  /** The conversation to reopen, or null. */
  restore: () => Promise<string | null>;
  /** The up-arrow ring: the person's own questions, newest first, once each. */
  inputHistory: () => Promise<string[]>;
  /** Suggested questions for the screen at `route`, from the product's knowledge for the person's role. */
  prompts: (route?: string) => Promise<string[]>;
  memory: {
    list: () => Promise<AssistantMemoryFact[]>;
    correct: (key: string, value: string, label?: string) => Promise<AssistantMemoryFact>;
    forget: (key: string) => Promise<void>;
    forgetAll: () => Promise<number>;
  };
  /** A thumbs up or down on one answer, by the service's ids. */
  vote: (conversationId: string, turnId: string, vote: AssistantVote) => Promise<void>;
  /** What became of a confirm card, so a reload shows the same outcome. */
  cardState: (conversationId: string, turnId: string, state: Record<string, unknown> | null) => Promise<void>;
  /** The transport half of `useAssistantConversation`'s options (the product adds `toPanelMessage`). */
  conversation: Pick<AssistantConversationOptions, 'sendUrl' | 'streamUrl' | 'cancelUrl' | 'headers' | 'restore' | 'loadConversation'>;
}

interface Envelope<T> {
  success?: boolean;
  message?: string;
  data?: T;
}

export function createAssistantSpaceClient({ base, fetcher, headers }: AssistantSpaceClientOptions): AssistantSpaceClient {
  const root = base.replace(/\/+$/, '');
  const call = async <T>(method: SpaceMethod, path: string, options?: Parameters<AssistantSpaceFetcher>[2]): Promise<T> => {
    const body = (await fetcher(method, path, options)) as Envelope<T> | undefined;
    return (body?.data ?? ({} as T)) as T;
  };
  const id = (value: string) => encodeURIComponent(value);

  const loadConversation = async (conversationId: string) => {
    const data = await call<{ conversation: AssistantThreadRow; messages: unknown[] }>('GET', `conversations/${id(conversationId)}`);
    return { id: data.conversation?.id ?? conversationId, messages: data.messages ?? [] };
  };
  const restore = async () => (await call<{ conversation_id: string | null }>('GET', 'active-conversation')).conversation_id ?? null;

  return {
    threads: {
      // ⚠ Always arrays: an empty or partial answer must read as "no threads", never crash the list.
      list: async (before) => {
        const page = await call<{ items?: AssistantThreadRow[]; next_before?: string | null; pinned?: AssistantThreadRow[] }>(
          'GET',
          'threads',
          { query: before ? { before } : undefined },
        );
        return { items: page.items ?? [], next_before: page.next_before ?? null, pinned: page.pinned ?? [] };
      },
      search: async (q) => {
        const found = await call<{ results?: AssistantThreadRow[]; capped?: boolean }>('GET', 'threads/search', { query: { q } });
        return { results: found.results ?? [], capped: found.capped ?? false };
      },
      update: (threadId, changes) => call('PATCH', `threads/${id(threadId)}`, { body: changes }),
    },
    loadConversation,
    eraseConversation: async (conversationId) => {
      await call('DELETE', `conversations/${id(conversationId)}`);
    },
    restore,
    inputHistory: async () => (await call<{ history: string[] }>('GET', 'input-history')).history ?? [],
    prompts: async (route) => (await call<{ prompts?: string[] }>('GET', 'prompts', { query: route ? { route } : undefined })).prompts ?? [],
    memory: {
      list: async () => (await call<{ memory: AssistantMemoryFact[] }>('GET', 'memory')).memory ?? [],
      correct: async (key, value, label) =>
        (await call<{ fact: AssistantMemoryFact }>('PUT', `memory/${id(key)}`, { body: label ? { value, label } : { value } })).fact,
      forget: async (key) => {
        await call('DELETE', `memory/${id(key)}`);
      },
      forgetAll: async () => (await call<{ forgotten: number }>('DELETE', 'memory')).forgotten ?? 0,
    },
    vote: async (conversationId, turnId, vote) => {
      await call('POST', `conversations/${id(conversationId)}/turns/${id(turnId)}/feedback`, { body: vote });
    },
    cardState: async (conversationId, turnId, state) => {
      await call('PATCH', `conversations/${id(conversationId)}/turns/${id(turnId)}/card-state`, { body: { state } });
    },
    conversation: {
      // The kit serves the streamed turn only; it is always on while the space routes are.
      sendUrl: `${root}/chat/stream`,
      streamUrl: `${root}/chat/stream`,
      cancelUrl: (turnId: string) => `${root}/chat/stream/${id(turnId)}`,
      headers,
      restore,
      loadConversation,
    },
  };
}
