import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ActionConfirm } from '../src/messages/ActionConfirm';
import { DataTable } from '../src/messages/blocks';

/**
 * The behaviour promoted out of Porter in P18g.
 *
 * ⚠ THESE ARE THE CASES THE THIN SHARED CARD GOT WRONG. A failure that ate the
 * card, an action that hands off rather than finishes, and a table that reported
 * "unreachable" as "nothing found". Each one shipped correctly in Porter for
 * months and in no other product.
 */
describe('ActionConfirm', () => {
  const base = {
    title: 'Send 3 options to Maria Garcia',
    confirmLabel: 'Send them',
  };

  it('reports what actually happened, in the product words', async () => {
    render(
      <ActionConfirm
        {...base}
        onConfirm={async () => ({ summary: 'Sent 3 options to Maria Garcia.' })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Send them' }));

    await waitFor(() =>
      expect(screen.getByText('Sent 3 options to Maria Garcia.')).toBeTruthy(),
    );
  });

  it('offers the way on when an action hands off rather than finishes', async () => {
    const onNavigate = vi.fn();
    render(
      <ActionConfirm
        {...base}
        onNavigate={onNavigate}
        onConfirm={async () => ({
          summary: 'Draft case ready for review.',
          handoff: { url: '/consultant/cases/42/review', label: 'Review the case' },
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Send them' }));

    await waitFor(() => screen.getByRole('button', { name: 'Review the case' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review the case' }));

    expect(onNavigate).toHaveBeenCalledWith('/consultant/cases/42/review');
  });

  it('keeps the card after a failure, so the reader can try again', async () => {
    const onConfirm = vi
      .fn()
      .mockRejectedValueOnce(new Error('The client has no email on file.'))
      .mockResolvedValueOnce({ summary: 'Sent.' });

    render(<ActionConfirm {...base} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole('button', { name: 'Send them' }));
    await waitFor(() => screen.getByText('The client has no email on file.'));

    // The control that would fix it is still there.
    fireEvent.click(screen.getByRole('button', { name: 'Send them' }));
    await waitFor(() => screen.getByText('Sent.'));
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });

  it('never says Done about something the reader refused', () => {
    const { container } = render(
      <ActionConfirm {...base} settled="cancelled" onConfirm={vi.fn()} />,
    );

    expect(container.textContent).toContain('Cancelled');
    expect(container.textContent).not.toContain('Done.');
  });

  it('re-mounts settled, rather than offering to do it again', () => {
    render(<ActionConfirm {...base} settled="done" onConfirm={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Send them' })).toBeNull();
  });

  it('fetches an explanation only when it is asked for', async () => {
    const onExplain = vi.fn().mockResolvedValue('It will email the three options.');
    render(
      <ActionConfirm {...base} canExplain onExplain={onExplain} onConfirm={vi.fn()} />,
    );

    expect(onExplain).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Explain this' }));
    await waitFor(() => screen.getByText('It will email the three options.'));
  });

  it('hides refine and explain when the service did not offer them', () => {
    render(
      <ActionConfirm {...base} onConfirm={vi.fn()} onExplain={vi.fn()} onRefine={vi.fn()} />,
    );

    expect(screen.queryByRole('button', { name: 'Explain this' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Change something' })).toBeNull();
  });
});

describe('DataTable', () => {
  const columns = [
    { key: 'name', label: 'Client' },
    { key: 'days', label: 'Days', numeric: true },
  ];

  it('says it could not read, rather than showing an empty table', () => {
    const { container } = render(
      <DataTable
        table={{
          entity: 'cases',
          status: 'unavailable',
          columns: [],
          rows: [],
          notes: ['The case service did not answer.'],
        }}
      />,
    );

    expect(container.textContent).toContain('could not read your cases');
    expect(container.textContent).toContain('The case service did not answer.');
    expect(container.querySelector('table')).toBeNull();
  });

  it('caps the rows but never hides the real total', () => {
    const rows = Array.from({ length: 24 }, (_, i) => ({ name: `Client ${i}`, days: i }));
    const { container } = render(
      <DataTable table={{ columns, rows, total: 46 }} previewRows={10} />,
    );

    expect(container.querySelectorAll('tbody tr')).toHaveLength(10);
    expect(container.textContent).toContain('Showing 10 of 46');
  });

  it('expands the rows it actually has', () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ name: `Client ${i}`, days: i }));
    const { container, getByRole } = render(
      <DataTable table={{ columns, rows }} previewRows={10} />,
    );

    fireEvent.click(getByRole('button', { name: 'Show all 12' }));
    expect(container.querySelectorAll('tbody tr')).toHaveLength(12);
  });
});
