import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AssistantSpacePanel,
  createAssistantSpaceClient,
  type AssistantSpaceAdapter,
  type AssistantSpaceFetcher,
  type PanelMessage,
} from '../src';
import { withPage } from '../src/components/AssistantSpacePanel';

/**
 * 1.52 (2026-11-09). The panel read the page for its suggested questions and never put it on a turn, so
 * only a product that added it by hand (Porter) was answered for its page. Mira's engine was told every
 * page was "/", and she told an admin new candidates "appear on your dashboard at /.".
 */
const theme = { surface: '#fff', fg: '#111', muted: '#666', border: '#ddd', accent: '#6f6df3', accentFg: '#fff' };

const fetcher = vi.fn<AssistantSpaceFetcher>(async () => ({ data: {} }));

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

function sse(body: string): Response {
  const encoder = new TextEncoder();

  return {
    ok: true,
    status: 200,
    body: new ReadableStream<Uint8Array>({ start(c) { c.enqueue(encoder.encode(body)); c.close(); } }),
    json: async () => ({}),
  } as unknown as Response;
}

async function sendFrom(route: string | undefined, a: AssistantSpaceAdapter): Promise<Record<string, unknown>> {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
    sse('event: message\ndata: {"conversation_id":"c-1","message":{"id":"a1","role":"assistant","content":"Done."}}\n\n'));
  vi.stubGlobal('fetch', fetchMock);

  const client = createAssistantSpaceClient({ base: '/api/assistant/space', fetcher });
  render(<AssistantSpacePanel client={client} accountKey="u-1" assistantName="Mira" theme={theme} adapter={a} onClose={() => {}} route={route} />);

  // The panel holds its loading state for a moment (MIN_LOADING_MS), then shows the welcome.
  await screen.findByText('Ask me anything.', undefined, { timeout: 3000 });
  const box = screen.getByPlaceholderText('Ask a question...');
  fireEvent.change(box, { target: { value: 'How many roles do I have?' } });
  fireEvent.keyDown(box, { key: 'Enter' });

  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('chat/stream'))).toBe(true), { timeout: 3000 });
  const call = fetchMock.mock.calls.find(([url]) => String(url).includes('chat/stream'));

  return JSON.parse(String((call as unknown as [string, RequestInit])[1].body));
}

describe('the shared panel sends the page with every turn', () => {
  beforeEach(() => {
    Object.defineProperty(Element.prototype, 'scrollTo', { value: vi.fn(), configurable: true });
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('a product that adds nothing still says which page the person is on', async () => {
    const body = await sendFrom('/admin/dashboard', adapter());

    expect(body.page_context).toEqual({ route: '/admin/dashboard' });
  });

  it("keeps a product's own page detail and adds the route only when it left it out", async () => {
    const body = await sendFrom('/consultant/cases/9', adapter({ turnBody: () => ({ page_context: { entity_type: 'case', entity_id: '9' } }) }));

    expect(body.page_context).toEqual({ entity_type: 'case', entity_id: '9', route: '/consultant/cases/9' });
  });

  it("never overwrites a route the product chose", () => {
    expect(withPage({ page_context: { route: '/portal/x' } }, '/other')).toEqual({ page_context: { route: '/portal/x' } });
    expect(withPage({ client_timezone: 'Africa/Lagos' }, '/a')).toEqual({ client_timezone: 'Africa/Lagos', page_context: { route: '/a' } });
  });
});
