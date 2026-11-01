import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AiConsole, AiConsoleProvider, AiStatusCard, AiUsageOverview } from '../src/console';
import { TemplateEditor } from '../src/console/TemplateEditor';

const theme = { surface: '#fff', fg: '#111', muted: '#666', border: '#ddd', accent: '#4361EE', accentFg: '#fff' };

const caps = (estate: boolean, pause = true) => ({
  product: 'mploynow',
  is_admin: estate,
  can: { pause_self: pause, edit_templates: true, edit_voice: true, edit_shared_templates: estate, estate },
});

const state = {
  product: 'mploynow',
  switch: { stopped: false, detail: null, global_stopped: false, refusing: false },
  budget: { product: 'mploynow', armed: true, period: 'month', soft_micros: 1_000_000, hard_micros: 10_000_000, notify_to: 'a@b.c', spend_micros: 2_500_000, refusing: false, state: 'within budget' },
};

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
}

/** A fetcher answering by path; records every call. */
function server(routes: Record<string, () => Promise<Response>>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetcher = vi.fn((url: string, init: RequestInit) => {
    calls.push({ url, init });
    const path = url.replace('/console/', '').split('?')[0] as string;
    const key = `${init.method} ${path}`;
    const hit = routes[key];
    return hit ? hit() : json({ message: `no route ${key}` }, 404);
  });
  return { fetcher, calls };
}

describe('AI console', () => {
  it('loads capabilities once and hides the estate tab from a product without the admin key', async () => {
    const { fetcher, calls } = server({ 'GET capabilities': () => json(caps(false)), 'GET state': () => json(state), 'GET usage': () => json({ totals: { calls: 0, spend_micros: 0, tokens_total: 0 }, latency: { samples: 0 }, daily: [], by_task: [], by_provider: [], by_product: [] }) });
    render(
      <AiConsoleProvider baseUrl="/console" theme={theme} fetcher={fetcher}>
        <AiConsole />
      </AiConsoleProvider>,
    );

    await screen.findAllByRole('button', { name: 'Prompts' });
    expect(screen.queryAllByRole('button', { name: 'All products' })).toHaveLength(0);
    expect(screen.queryAllByRole('button', { name: 'Provider keys' })).toHaveLength(0);
    expect(calls.filter((c) => c.url.includes('capabilities'))).toHaveLength(1);
  });

  it('shows the estate tab to the admin key', async () => {
    const { fetcher } = server({ 'GET capabilities': () => json(caps(true)), 'GET state': () => json(state), 'GET usage': () => json({ totals: { calls: 0 }, latency: { samples: 0 }, daily: [] }) });
    render(
      <AiConsoleProvider baseUrl="/console" theme={theme} fetcher={fetcher}>
        <AiConsole />
      </AiConsoleProvider>,
    );
    expect((await screen.findAllByRole('button', { name: 'All products' })).length).toBeGreaterThan(0);
    // The vault's parts are listed for the admin key only.
    expect(screen.getAllByRole('button', { name: 'Provider keys' }).length).toBeGreaterThan(0);
  });

  it('offers pause only when the product may pause itself, and asks why', async () => {
    const { fetcher, calls } = server({ 'GET capabilities': () => json(caps(false)), 'GET state': () => json(state), 'POST pause': () => json({ ...state, switch: { ...state.switch, stopped: true, refusing: true } }) });
    render(
      <AiConsoleProvider baseUrl="/console" theme={theme} fetcher={fetcher}>
        <AiStatusCard />
      </AiConsoleProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Pause AI' }));
    const confirm = screen.getAllByRole('button', { name: 'Pause AI' }).at(-1) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Why are you pausing it?'), { target: { value: 'runaway job' } });
    fireEvent.click(confirm);

    await screen.findByText('Paused');
    const sent = calls.find((c) => c.url.endsWith('/pause'));
    expect(JSON.parse(String(sent?.init.body))).toEqual({ reason: 'runaway job' });
  });

  it('hides pause from a product that may not pause itself', async () => {
    const { fetcher } = server({ 'GET capabilities': () => json(caps(false, false)), 'GET state': () => json(state) });
    render(
      <AiConsoleProvider baseUrl="/console" theme={theme} fetcher={fetcher}>
        <AiStatusCard />
      </AiConsoleProvider>,
    );
    await screen.findByText('On');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Pause AI' })).toBeNull());
  });

  it('says a failed usage read failed, never shows it as zero, and tells the product', async () => {
    const onError = vi.fn();
    const { fetcher } = server({ 'GET capabilities': () => json(caps(false)), 'GET usage': () => json({ message: 'The AI service did not answer. Try again in a minute.' }, 503) });
    render(
      <AiConsoleProvider baseUrl="/console" theme={theme} fetcher={fetcher} onError={onError}>
        <AiUsageOverview />
      </AiConsoleProvider>,
    );

    expect((await screen.findByRole('alert')).textContent).toContain('did not answer');
    expect(screen.queryByText('$0.00')).toBeNull();
    expect(onError).toHaveBeenCalled();
  });

  it('puts a template lint error beside its field, not on the error surface', async () => {
    const onError = vi.fn();
    const live = { version: 1, is_active: true, source: 'sync', updated_by: 'sync', created_at: null, mode: 'text', task: 't', route_key: null, sensitive: false, system: 'S', prompt: 'P {{text}}', variables: ['text'] };
    const { fetcher } = server({
      'GET capabilities': () => json(caps(false)),
      'GET tasks/summarize.note': () => json({ key: 'summarize.note', shared: false, live, versions: [live], editable: ['system', 'prompt'] }),
      'PATCH tasks/summarize.note': () => json({ error: 'unknown_variable', field: 'prompt', message: 'The product does not send: {{tone}}.' }, 422),
    });
    render(
      <AiConsoleProvider baseUrl="/console" theme={theme} fetcher={fetcher} onError={onError}>
        <TemplateEditor templateKey="summarize.note" shared={false} editable onClose={() => {}} onSaved={() => {}} />
      </AiConsoleProvider>,
    );

    fireEvent.change(await screen.findByLabelText('Prompt'), { target: { value: 'P {{tone}}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save as new version' }));

    expect(await screen.findByText('The product does not send: {{tone}}.')).toBeTruthy();
    expect(onError).not.toHaveBeenCalled();
  });
});
