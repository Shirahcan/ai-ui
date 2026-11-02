import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiConsoleProvider, AiConsoleSection, AiPromptTemplates, AiVoiceEditor, diffLines } from '../src/console';
import { TemplateEditor } from '../src/console/TemplateEditor';

const theme = { surface: '#fff', fg: '#111', muted: '#666', border: '#ddd', accent: '#4361EE', accentFg: '#fff' };

const caps = (admin: boolean) => ({
  product: 'portify',
  is_admin: admin,
  can: { pause_self: true, edit_templates: true, edit_voice: true, edit_shared_templates: admin, estate: admin, act_for_products: admin, assist: true, revert_templates: true },
});

const products = {
  products: [
    { key: 'portify', label: 'Portify', own: true },
    { key: 'mploynow', label: 'MployNow', own: false },
  ],
};

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
}

/** Answers by `METHOD path`, and by `METHOD path@product` when the call names a product. */
function server(routes: Record<string, (url: URL, init: RequestInit) => Promise<Response>>) {
  const calls: Array<{ url: URL; init: RequestInit }> = [];
  const fetcher = vi.fn((raw: string, init: RequestInit) => {
    const url = new URL(raw, 'http://x');
    calls.push({ url, init });
    const path = url.pathname.replace('/console/', '');
    const as = url.searchParams.get('as_product');
    const hit = routes[`${init.method} ${path}${as ? `@${as}` : ''}`] ?? routes[`${init.method} ${path}`];
    return hit ? hit(url, init) : json({ message: `no route ${init.method} ${path}` }, 404);
  });
  return { fetcher, calls };
}

const task = (key: string, source = 'sync') => ({ key, version: 1, mode: 'text', route_key: null, sensitive: false, checksum: 'x', source, updated_by: 'sync', updated_at: null });

describe('AI console product picker', () => {
  beforeEach(() => window.sessionStorage.clear());

  it('draws no picker for a console without the admin key, and never asks for products', async () => {
    const { fetcher, calls } = server({ 'GET capabilities': () => json(caps(false)), 'GET tasks': () => json({ tasks: [task('a.task')], shared: [] }) });
    render(
      <AiConsoleProvider baseUrl="/console" theme={theme} fetcher={fetcher}>
        <AiConsoleSection tab="prompts" />
      </AiConsoleProvider>,
    );
    await screen.findByText('a.task');
    expect(screen.queryByLabelText('Product')).toBeNull();
    expect(calls.some((c) => c.url.pathname.endsWith('/products'))).toBe(false);
    expect(calls.every((c) => !c.url.searchParams.has('as_product'))).toBe(true);
  });

  it('sends as_product for the product picked, and only on that product\'s rows', async () => {
    const { fetcher, calls } = server({
      'GET capabilities': () => json(caps(true)),
      'GET products': () => json(products),
      'GET tasks': () => json({ tasks: [task('portify.task')], shared: [] }),
      'GET tasks@mploynow': () => json({ tasks: [task('mploynow.task')], shared: [] }),
    });
    render(
      <AiConsoleProvider baseUrl="/console" theme={theme} fetcher={fetcher}>
        <AiConsoleSection tab="prompts" />
      </AiConsoleProvider>,
    );
    await screen.findByText('portify.task');
    fireEvent.change(await screen.findByLabelText('Product'), { target: { value: 'mploynow' } });
    await screen.findByText('mploynow.task');
    expect(screen.getByText(/Changes you make here apply to/)).toBeTruthy();
    expect(calls.some((c) => c.url.pathname.endsWith('/tasks') && c.url.searchParams.get('as_product') === 'mploynow')).toBe(true);
    // Capabilities and the products list are never scoped.
    expect(calls.filter((c) => /capabilities|products$/.test(c.url.pathname)).every((c) => !c.url.searchParams.has('as_product'))).toBe(true);
    expect(window.sessionStorage.getItem('ai-console.product')).toBe('mploynow');
  });

  it('All products merges every product\'s list read-only, with a Product column', async () => {
    window.sessionStorage.setItem('ai-console.product', '*');
    const { fetcher } = server({
      'GET capabilities': () => json(caps(true)),
      'GET products': () => json(products),
      'GET personas': () => json({ personas: [{ id: 1, key: 'assistant', audience: null, label: 'Porter voice', voice: 'Warm.', version: 1, is_active: true, updated_by: 'a', created_at: null }] }),
      'GET personas@mploynow': () => json({ personas: [{ id: 9, key: 'assistant', audience: null, label: 'Reeve voice', voice: 'Brisk.', version: 2, is_active: true, updated_by: 'b', created_at: null }] }),
    });
    render(
      <AiConsoleProvider baseUrl="/console" theme={theme} fetcher={fetcher}>
        <AiVoiceEditor />
      </AiConsoleProvider>,
    );
    await screen.findByText('Porter voice');
    expect(screen.getByText('Reeve voice')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Product' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add a voice' })).toBeNull();
    expect(screen.getByText(/read-only/)).toBeTruthy();
  });

  it('a prompt list in All products falls back to one product when that product is picked from a row', async () => {
    window.sessionStorage.setItem('ai-console.product', '*');
    const { fetcher } = server({
      'GET capabilities': () => json(caps(true)),
      'GET products': () => json(products),
      'GET tasks': () => json({ tasks: [task('portify.task')], shared: [task('shared.x')] }),
      'GET tasks@mploynow': () => json({ tasks: [task('mploynow.task')], shared: [task('shared.x')] }),
      'GET tasks/mploynow.task@mploynow': () => json({ key: 'mploynow.task', shared: false, live: { version: 1, is_active: true, source: 'sync', updated_by: 'sync', created_at: null, mode: 'text', task: 'x', route_key: null, sensitive: false, system: 'S', prompt: 'P {{text}}', variables: ['text'] }, versions: [], editable: ['system', 'prompt'] }),
    });
    render(
      <AiConsoleProvider baseUrl="/console" theme={theme} fetcher={fetcher}>
        <AiPromptTemplates />
      </AiConsoleProvider>,
    );
    await screen.findByText('mploynow.task');
    // The shared prompt is listed once, not once per product.
    expect(screen.getAllByText('shared.x')).toHaveLength(1);
    fireEvent.click(screen.getByText('mploynow.task'));
    await waitFor(() => expect(window.sessionStorage.getItem('ai-console.product')).toBe('mploynow'));
  });
});

describe('Ask the assistant and back to the code', () => {
  const detail = (source: string) => ({
    key: 'a.task',
    shared: false,
    live: { version: 2, is_active: true, source, updated_by: 'ops', created_at: null, mode: 'text', task: 'a.task', route_key: null, sensitive: false, system: 'You help.', prompt: 'Summarise {{text}}.', variables: ['text'] },
    versions: [],
    editable: ['system', 'prompt'],
  });

  it('suggests a rewrite as a diff and only fills the field when used', async () => {
    const { fetcher, calls } = server({
      'GET capabilities': () => json(caps(false)),
      'GET tasks/a.task': () => json(detail('sync')),
      'POST assist': () => json({ suggestion: 'Summarise {{text}} in two lines.', dropped: [] }),
    });
    render(
      <AiConsoleProvider baseUrl="/console" theme={theme} fetcher={fetcher}>
        <TemplateEditor templateKey="a.task" shared={false} editable onClose={() => {}} onSaved={() => {}} />
      </AiConsoleProvider>,
    );
    const asks = await screen.findAllByRole('button', { name: 'Ask the assistant' });
    fireEvent.click(asks[1] as HTMLElement);
    fireEvent.change(screen.getByLabelText('What should change?'), { target: { value: 'two lines please' } });
    fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));
    await screen.findByText('+ Summarise {{text}} in two lines.');
    expect(JSON.parse(String(calls.find((c) => c.url.pathname.endsWith('/assist'))?.init.body))).toEqual({ field: 'prompt', text: 'Summarise {{text}}.', instruction: 'two lines please' });

    fireEvent.click(screen.getByRole('button', { name: 'Use this' }));
    expect((screen.getByLabelText('Prompt') as HTMLTextAreaElement).value).toBe('Summarise {{text}} in two lines.');
    // Nothing saved by itself.
    expect(calls.some((c) => c.init.method === 'PATCH')).toBe(false);
  });

  it('a console-edited template can go back to the code\'s words', async () => {
    const { fetcher, calls } = server({
      'GET capabilities': () => json(caps(false)),
      'GET tasks/a.task': () => json(detail('console')),
      'POST tasks/a.task/revert': () => json({ changed: true, live: detail('sync').live }),
    });
    render(
      <AiConsoleProvider baseUrl="/console" theme={theme} fetcher={fetcher}>
        <TemplateEditor templateKey="a.task" shared={false} editable onClose={() => {}} onSaved={() => {}} />
      </AiConsoleProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: "Back to the code's words" }));
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    await waitFor(() => expect(calls.some((c) => c.url.pathname.endsWith('/tasks/a.task/revert'))).toBe(true));
  });

  it('diffLines keeps the common lines and marks the rest', () => {
    expect(diffLines(['a', 'b', 'c'], ['a', 'x', 'c'])).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'del', text: 'b' },
      { kind: 'add', text: 'x' },
      { kind: 'same', text: 'c' },
    ]);
  });
});
