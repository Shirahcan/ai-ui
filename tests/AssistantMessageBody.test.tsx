import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AssistantMessageBody } from '../src/components/AssistantMessageBody';
import type { AssistantMessageHandlers } from '../src/components/AssistantMessageBody';
import type { PanelMessage } from '../src/types';

/**
 * Every kind ai-service can send, drawn once for the estate.
 *
 * ⚠ THE PROSE-ALWAYS-FIRST ASSERTION IS THE LOAD-BEARING ONE. The service sends
 * the sentence AND the structure, and the sentence is what makes the card make
 * sense. A branch that replaced the text instead of preceding it is how a
 * confirm card ends up asking about something the reader was never told.
 */
function body(
  message: Partial<PanelMessage> & { id: string },
  handlers: AssistantMessageHandlers = {},
) {
  return render(
    <AssistantMessageBody
      message={{ role: 'assistant', text: '', ...message } as PanelMessage}
      handlers={handlers}
    />,
  );
}

describe('AssistantMessageBody', () => {
  it('renders an unknown kind as its prose rather than as nothing', () => {
    const { container } = body({
      id: 'm',
      text: 'Something new.',
      kind: 'a_kind_shipped_after_this_build',
    });

    expect(container.textContent).toContain('Something new.');
  });

  it('draws the sentence above the structure, never instead of it', () => {
    const { container } = body(
      {
        id: 'm',
        text: 'I can send these three options to Maria. Shall I?',
        kind: 'action_confirm',
        meta: { action_id: 'a1', module_id: 'send_message', confirm_label: 'Send them' },
      },
      { onConfirmAction: vi.fn() },
    );

    expect(container.textContent).toContain('Shall I?');
    expect(container.textContent).toContain('Send them');
  });

  it('hides a control whose handler a product has not wired', () => {
    const unwired = body({
      id: 'm',
      text: 'Ready.',
      kind: 'action_confirm',
      meta: { action_id: 'a1', confirm_label: 'Send them' },
    });

    expect(unwired.container.textContent).not.toContain('Send them');
  });

  it('offers refine and explain only when the service said it could', () => {
    const handlers = { onConfirmAction: vi.fn(), onRefineAction: vi.fn(), onExplainAction: vi.fn() };

    const without = body(
      { id: 'a', text: 'x', kind: 'action_confirm', meta: { action_id: '1' } },
      handlers,
    );
    expect(without.container.textContent).not.toContain('Explain this');

    const with_ = body(
      {
        id: 'b',
        text: 'x',
        kind: 'action_confirm',
        meta: { action_id: '1', can_refine: true, can_explain: true },
      },
      handlers,
    );
    expect(with_.container.textContent).toContain('Change something');
    expect(with_.container.textContent).toContain('Explain this');
  });

  it('hands a launch back with the presentation the service chose', () => {
    const onLaunchAction = vi.fn();
    const { getByRole } = body(
      {
        id: 'm',
        text: 'Open the form?',
        kind: 'action_launch',
        meta: { module_id: 'add_note', presentation: 'page', launch_label: 'Add a note' },
      },
      { onLaunchAction },
    );

    fireEvent.click(getByRole('button', { name: 'Add a note' }));

    expect(onLaunchAction).toHaveBeenCalledWith({
      messageId: 'm',
      moduleId: 'add_note',
      presentation: 'page',
      draftBody: undefined,
    });
  });

  it('says Done rather than re-offering an action already run', () => {
    const { container, queryByRole } = body(
      {
        id: 'm',
        text: 'x',
        kind: 'action_launch',
        meta: { module_id: 'add_note', launch_label: 'Add a note' },
      },
      { onLaunchAction: vi.fn(), actionState: () => 'done' },
    );

    expect(queryByRole('button', { name: 'Add a note' })).toBeNull();
    expect(container.textContent).toContain('Done.');
  });

  it('draws a table the same whether the service sent one or a list', () => {
    const table = {
      title: 'Open cases',
      columns: [
        { key: 'name', label: 'Client' },
        { key: 'days', label: 'Days', numeric: true },
      ],
      rows: [{ name: 'Maria Garcia', days: 12 }],
    };

    const single = body({ id: 'a', text: '', kind: 'data_table', meta: { result: table } });
    const plural = body({ id: 'b', text: '', kind: 'data_tables', meta: { result: [table] } });

    expect(single.container.textContent).toContain('Maria Garcia');
    expect(plural.container.textContent).toContain('Maria Garcia');
    expect(single.container.querySelectorAll('td')).toHaveLength(2);
  });

  it("reads the service's targets shape without the product mapping it", () => {
    const { container } = body({
      id: 'm',
      text: '',
      kind: 'data_table',
      meta: {
        result: {
          targets: [
            {
              entity: 'cases',
              status: 'ok',
              columns: [
                { key: 'name', label: 'Client', type: 'text' },
                { key: 'fee', label: 'Fee', type: 'currency' },
              ],
              rows: [{ name: 'Maria Garcia', fee: '1,200' }],
            },
          ],
        },
      },
    });

    expect(container.textContent).toContain('Maria Garcia');
    // The currency column is right-aligned without the product saying so.
    const cells = [...container.querySelectorAll('td')];
    expect(cells[1]?.className).toContain('text-right');
  });

  it('holds a narrated table back, because the prose already answered', () => {
    const { container, getByRole } = body({
      id: 'm',
      text: 'You have one open case.',
      kind: 'data_table',
      meta: {
        narrated: true,
        result: { columns: [{ key: 'name', label: 'Client' }], rows: [{ name: 'Maria' }] },
      },
    });

    expect(container.querySelector('table')).toBeNull();
    fireEvent.click(getByRole('button', { name: 'Show the data' }));
    expect(container.querySelector('table')).toBeTruthy();
  });

  it('survives a meta bag that is missing what its kind promised', () => {
    expect(() =>
      body({ id: 'm', text: 'Here.', kind: 'data_table', meta: { result: 'not a table' } }),
    ).not.toThrow();
  });

  it('shows a research answer with what it read', () => {
    const { container } = body({
      id: 'm',
      text: 'Here is what I found.',
      kind: 'research',
      meta: { sources: [{ title: 'IRCC program delivery', publisher: 'IRCC' }] },
    });

    expect(container.textContent).toContain('Sources');
    expect(container.textContent).toContain('IRCC program delivery');
  });

  it('asks for consent with a refusal as real as the agreement', () => {
    const onConsent = vi.fn();
    const onDeclineConsent = vi.fn();
    const { getByRole } = body(
      { id: 'm', text: 'I may need to see the screen.', kind: 'it_snapshot_request', meta: {} },
      { onConsent, onDeclineConsent },
    );

    expect(getByRole('button', { name: 'Not now' })).toBeTruthy();
    fireEvent.click(getByRole('button', { name: 'Look at my screen' }));
    expect(onConsent).toHaveBeenCalled();
  });

  it('draws a guide s linked action on any kind, not only on a launch', () => {
    const onLaunchAction = vi.fn();
    const { getByRole } = body(
      {
        id: 'm',
        text: 'Here is the guide.',
        kind: 'text',
        meta: { module_launch: { module_id: 'invite_client', label: 'Invite them' } },
      },
      { onLaunchAction },
    );

    fireEvent.click(getByRole('button', { name: 'Invite them' }));
    expect(onLaunchAction).toHaveBeenCalled();
  });

  it('puts a product s own form fields inside a card this package draws', () => {
    const { container } = body(
      {
        id: 'm',
        text: 'Fill this in.',
        kind: 'action_module',
        meta: { module_id: 'add_note', launch_label: 'Add a note' },
      },
      { renderActionFields: ({ moduleId }) => <input aria-label={moduleId} /> },
    );

    expect(container.querySelector('input[aria-label="add_note"]')).toBeTruthy();
    expect(container.textContent).toContain('Add a note');
  });

  it('draws a grounded answer: caveats, labelled sections and the lines it leaned on', () => {
    const { container } = body({
      id: 'm',
      text: '',
      kind: 'grounded_answer',
      meta: {
        grounded: {
          caveats: ['The October bank feed is not imported.'],
          sections: [
            { label: 'What the books say', body: 'Revenue is **$12,000**.' },
            { label: 'What the rule says', body: '', note: 'Not a verdict.' },
          ],
          citations: ['4000 Revenue: 12,000.00', null],
          citations_label: 'The lines this answer leaned on',
          attribution: 'Written by gemini from the facts above.',
        },
      },
    });

    const text = container.textContent ?? '';
    expect(text).toContain('The October bank feed is not imported.');
    expect(text).toContain('What the books say');
    expect(container.querySelector('strong')?.textContent).toBe('$12,000');
    // An empty section is not drawn as a heading with nothing under it.
    expect(text).not.toContain('What the rule says');
    expect(text).toContain('The lines this answer leaned on (1)');
    expect(text).toContain('Written by gemini');
  });

  it('draws a grounded refusal INSTEAD of its sections', () => {
    const { container } = body({
      id: 'm',
      text: '',
      kind: 'grounded_answer',
      meta: {
        grounded: {
          sections: [{ label: 'What the books say', body: 'An estimate.' }],
          refusal: 'The books do not contain this.',
        },
      },
    });

    expect(container.textContent).toContain('The books do not contain this.');
    expect(container.textContent).not.toContain('An estimate.');
  });

  it('draws a grounded_answer with no grounded meta as its prose alone', () => {
    const { container } = body({ id: 'm', text: 'Just words.', kind: 'grounded_answer' });

    expect(container.textContent).toBe('Just words.');
  });
});

