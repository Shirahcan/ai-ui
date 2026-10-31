import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AssistantMessageBody } from '../src/components/AssistantMessageBody';
import type { PanelMessage } from '../src/types';

/**
 * `operation_confirm`: a previewed change that runs only on an explicit yes WITH a reason.
 */
const message = {
  id: 'm1',
  role: 'assistant',
  text: 'Here is the change. Pick a reason and confirm.',
  kind: 'operation_confirm',
  meta: {
    operation: 'update_fields',
    params: { entity: 'case', id: 'c1', changes: { case_name: 'Study Permit 2027' } },
    preview: {
      title: 'Change case name',
      target: { label: 'Study Permit', link: '/admin/cases/c1' },
      changes: [{ label: 'Case name', before: 'Study Permit', after: 'Study Permit 2027' }],
      notes: [],
      consequential: false,
      undoable: true,
    },
    reason_options: ['The consultant asked for it'],
    verb: 'Change case name',
  },
} as unknown as PanelMessage;

describe('OperationConfirm', () => {
  it('shows before and after, and will not run without a reason', () => {
    const onRunOperation = vi.fn();
    render(<AssistantMessageBody message={message} handlers={{ onRunOperation }} />);

    expect(screen.getByText('Study Permit 2027')).toBeTruthy();
    const button = screen.getByRole('button', { name: 'Change case name' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onRunOperation).not.toHaveBeenCalled();
  });

  it('runs with the chosen reason and reports the product words', async () => {
    const onRunOperation = vi.fn(async () => ({ summary: 'Changed case name for Study Permit.' }));
    render(<AssistantMessageBody message={message} handlers={{ onRunOperation }} />);

    fireEvent.click(screen.getByLabelText('The consultant asked for it'));
    fireEvent.click(screen.getByRole('button', { name: 'Change case name' }));

    await waitFor(() => expect(screen.getByText('Changed case name for Study Permit.')).toBeTruthy());
    expect(onRunOperation).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'update_fields', reason: 'The consultant asked for it' }),
    );
  });

  it('keeps the card on a refusal so the reader can retry', async () => {
    const onRunOperation = vi.fn(async () => {
      throw new Error('You need the "cases.edit" permission for this.');
    });
    render(<AssistantMessageBody message={message} handlers={{ onRunOperation }} />);

    fireEvent.click(screen.getByLabelText('Other'));
    fireEvent.change(screen.getByLabelText('Your reason'), { target: { value: 'Requested by phone' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change case name' }));

    await waitFor(() => expect(screen.getByText('You need the "cases.edit" permission for this.')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Change case name' })).toBeTruthy();
  });

  it('degrades to the prose when no handler is wired', () => {
    render(<AssistantMessageBody message={message} handlers={{}} />);

    expect(screen.getByText('Here is the change. Pick a reason and confirm.')).toBeTruthy();
    expect(screen.queryByText('Why are you making this change?')).toBeNull();
  });
});

describe('OperationConfirm in the background', () => {
  it('says it started, then follows the run to its result', async () => {
    const onRunOperation = vi.fn(async () => ({ summary: 'Started in the background.', background: true }));
    let finished = false;
    const onCheckOperation = vi.fn(async () => (finished ? { done: true, summary: 'Recorded 6 payments.' } : { done: false }));
    render(<AssistantMessageBody message={message} handlers={{ onRunOperation, onCheckOperation }} />);

    fireEvent.click(screen.getByLabelText('The consultant asked for it'));
    fireEvent.click(screen.getByRole('button', { name: 'Change case name' }));

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Started in the background.'));
    finished = true;
    await waitFor(() => expect(screen.getByText('Recorded 6 payments.')).toBeTruthy(), { timeout: 4000 });
  });

  it('never re-offers a started run after a re-mount', () => {
    render(
      <AssistantMessageBody
        message={message}
        handlers={{ onRunOperation: vi.fn(), actionState: () => 'started' }}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Change case name' })).toBeNull();
    expect(screen.getByRole('status')).toBeTruthy();
  });
});
