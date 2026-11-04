import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AiConsoleProvider, AiGapInbox } from '../src/console';

const theme = { surface: '#fff', fg: '#111', muted: '#666', border: '#ddd', accent: '#4361EE', accentFg: '#fff' };

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
}

const gap = {
  id: 'g1', audience: 'admin', category: 'tool_refused', reason: 'entity_unknown', tool: 'run_data_query', source: 'tool_outcome',
  question: 'Which task links expired?', status: 'open', note: null, occurrences: 7, last_conversation_id: null,
  first_seen_at: '2026-11-01T10:00:00Z', last_seen_at: '2026-11-04T10:00:00Z',
};

describe('AiGapInbox', () => {
  it('ranks what the assistant could not do, filters it, and marks a gap fixed', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetcher = vi.fn((url: string, init: RequestInit) => {
      calls.push({ url, init });
      const path = url.replace('/console/', '').split('?')[0];
      if (init.method === 'GET' && path === 'gaps/stats') return json({ data: { open: 1, planned: 0, opened_30d: 1, fixed_30d: 0, occurrences_30d: 7 } });
      if (init.method === 'GET' && path === 'gaps') return json({ data: [gap], meta: { page: 1, last_page: 1, total: 1 } });
      if (init.method === 'PATCH' && path === 'gaps/g1') return json({ data: { ...gap, status: 'fixed' } });
      if (path === 'capabilities') return json({ product: 'portify', is_admin: false, can: {} });
      return json({ message: `no route ${path}` }, 404);
    });

    render(
      <AiConsoleProvider baseUrl="/console" theme={theme} fetcher={fetcher}>
        <AiGapInbox />
      </AiConsoleProvider>,
    );

    expect(await screen.findByText('Which task links expired?')).toBeTruthy();
    expect(screen.getAllByText('A tool said no').length).toBe(2); // the filter and the row
    expect(screen.getByText('run_data_query: entity_unknown')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Kind of gap'), { target: { value: 'tool_refused' } });
    await waitFor(() => expect(calls.some((c) => c.url.includes('category=tool_refused'))).toBe(true));

    fireEvent.click(screen.getByLabelText('Gap actions'));
    fireEvent.click(await screen.findByText('Mark fixed'));
    await waitFor(() => {
      const patch = calls.find((c) => c.init.method === 'PATCH');
      expect(patch?.url).toContain('gaps/g1');
      expect(JSON.parse(String(patch?.init.body))).toMatchObject({ status: 'fixed' });
    });
  });
});
