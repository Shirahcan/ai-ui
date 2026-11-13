import { describe, expect, it, vi } from 'vitest';

import { createConsoleApi, type ConsoleFetcher } from '../src/terminal/consoleApi';

/**
 * The console's HTTP client for any product (shared console C4a): every call reaches the product's own routes
 * through the product's own fetcher, and nothing here names a product path.
 */
function fakeFetcher(answers: Record<string, unknown> = {}) {
  const calls: { method: string; url: string; body?: unknown; options?: unknown }[] = [];
  const answer = (url: string) => (answers[url] ?? {}) as never;
  const fetcher: ConsoleFetcher = {
    get: vi.fn(async (url, options) => (calls.push({ method: 'GET', url, options }), answer(url))),
    post: vi.fn(async (url, body, options) => (calls.push({ method: 'POST', url, body, options }), answer(url))),
    put: vi.fn(async (url, body, options) => (calls.push({ method: 'PUT', url, body, options }), answer(url))),
  };

  return { fetcher, calls };
}

const base = (kind: string, id: string) => `/product/console/${kind}/${id}`;
const checkpointUrl = (kind: string, id: string, checkpoint: string) => `/product/${kind}s/${id}/checkpoints/${checkpoint}`;

describe('createConsoleApi', () => {
  it('builds every route from the base the product hands in', async () => {
    const { fetcher, calls } = fakeFetcher({ '/product/console/page/p1/sessions': { sessions: [] }, '/product/console/page/p1/commands': { commands: [] } });
    const api = createConsoleApi({ base, checkpointUrl, fetcher });

    await api.open('page', 'p1');
    await api.start('page', 'p1', 'Hero work');
    await api.sessions('page', 'p1');
    await api.openSession('page', 'p1', 's1');
    await api.compact('page', 'p1', 's1', { focus: 'pricing' });
    await api.rewind('page', 'p1', 's1', 't9');
    await api.commands('page', 'p1');

    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'GET /product/console/page/p1',
      'POST /product/console/page/p1/sessions',
      'GET /product/console/page/p1/sessions',
      'GET /product/console/page/p1/sessions/s1',
      'POST /product/console/page/p1/sessions/s1/compact',
      'POST /product/console/page/p1/sessions/s1/rewind',
      'GET /product/console/page/p1/commands',
    ]);
    expect(calls[1]?.body).toEqual({ title: 'Hero work' });
    expect(calls[5]?.body).toEqual({ turn: 't9' });
  });

  it('keeps the recap and the cost quiet on a vanished session or a throttle', async () => {
    const { fetcher, calls } = fakeFetcher({ '/product/console/page/p1/sessions/s1/usage': { usage: null } });
    const api = createConsoleApi({ base, checkpointUrl, fetcher });

    await api.recap('page', 'p1', 's1', 45);
    await api.recap('page', 'p1', 's1', null);
    expect(await api.usage('page', 'p1', 's1')).toBeNull();

    expect(calls[0]?.body).toEqual({ away_minutes: 45 });
    expect(calls[1]?.body).toEqual({});
    expect(calls.map((c) => c.options)).toEqual([{ quietStatuses: [404, 429] }, { quietStatuses: [404, 429] }, { quietStatuses: [404, 429] }]);
  });

  it('brings a new guide\'s templates back with the guide, and none when the answer has none', async () => {
    const withTemplates = fakeFetcher({
      '/product/console/page/p1/specialization': {
        choice: { key: 'blog_post', by: 'u1', at: null },
        specialization: { key: 'blog_post' },
        specializations: [{ key: 'blog_post' }],
        template: null,
        templates: [{ key: 'story' }],
      },
    });
    const out = await createConsoleApi({ base, checkpointUrl, fetcher: withTemplates.fetcher }).saveSpecialization('page', 'p1', 'blog_post');

    expect(withTemplates.calls[0]).toMatchObject({ method: 'PUT', body: { key: 'blog_post' } });
    expect(out.specialization_choice).toEqual({ key: 'blog_post', by: 'u1', at: null });
    expect(out.templates).toEqual([{ key: 'story' }]);
    expect(out.template_choice).toBeNull();

    const without = fakeFetcher({ '/product/console/page/p1/specialization': { choice: null, specialization: null, specializations: [] } });
    const bare = await createConsoleApi({ base, checkpointUrl, fetcher: without.fetcher }).saveSpecialization('page', 'p1', 'none');

    expect('templates' in bare).toBe(false);
  });

  it('reads a rewind point from the subject\'s own route', async () => {
    const { fetcher, calls } = fakeFetcher({ '/product/pages/p1/checkpoints/c1': { checkpoint: { id: 'c1', design: [{ uid: 'a' }], created_at: null } } });
    const point = await createConsoleApi<'page', { uid: string }[]>({ base, checkpointUrl, fetcher }).checkpoint('page', 'p1', 'c1');

    expect(calls[0]?.url).toBe('/product/pages/p1/checkpoints/c1');
    expect(point.design[0]?.uid).toBe('a');
  });
});
