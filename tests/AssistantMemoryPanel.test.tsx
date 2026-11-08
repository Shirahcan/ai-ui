import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AssistantMemoryPanel, type AssistantMemoryFact, type AssistantSpaceClient } from '../src';

/**
 * "What {assistant} knows about you" in the shared package (1.43, plan S3b): named by the assistant,
 * grouped by category, edit and forget with a confirm, forget-all with a confirm, the real reason on a
 * failure, and an empty state that names the assistant.
 */
function memory(facts: AssistantMemoryFact[]): AssistantSpaceClient['memory'] {
  return {
    list: vi.fn(async () => facts),
    correct: vi.fn(async (key: string, value: string) => ({ ...facts.find((f) => f.key === key)!, value, source: 'explicit' })),
    forget: vi.fn(async () => undefined),
    forgetAll: vi.fn(async () => facts.length),
  };
}

const FACTS: AssistantMemoryFact[] = [
  { key: 'identity.name', label: 'Name', value: 'Amara', source: 'explicit', updated_at: null },
  { key: 'commitment.followup', label: 'Follow-up', value: 'Send the checklist', source: 'inferred', updated_at: null },
  { key: 'misc.colour', label: 'Colour', value: 'Blue', source: 'inferred', updated_at: null },
];

describe('AssistantMemoryPanel', () => {
  it('is named by the assistant and groups facts by category, unknown ones under Other', async () => {
    render(<AssistantMemoryPanel memory={memory(FACTS)} assistantName="Mira" onClose={() => {}} />);

    expect(screen.getByRole('heading', { name: 'What Mira knows about you' })).toBeTruthy();
    await screen.findByText('Amara');
    expect(screen.getByText('About you')).toBeTruthy();
    expect(screen.getByText('What Mira has done')).toBeTruthy();
    expect(screen.getByText('Other')).toBeTruthy();
    expect(screen.getByText('You told Mira')).toBeTruthy();
    expect(screen.getAllByText('Mira guessed')).toHaveLength(2);
  });

  it('files a plural key under its category, and work under its own heading', async () => {
    render(
      <AssistantMemoryPanel
        memory={memory([
          { key: 'preferences.answer_style', label: 'Answer style', value: 'Short', source: 'explicit', updated_at: null },
          { key: 'work.working_hours', label: 'Working hours', value: '9 to 5', source: 'explicit', updated_at: null },
        ])}
        assistantName="Porter"
        onClose={() => {}}
      />,
    );
    await screen.findByText('Short');
    expect(screen.getByText('Your preferences')).toBeTruthy();
    expect(screen.getByText('Your work')).toBeTruthy();
    expect(screen.queryByText('Other')).toBeNull();
  });

  it('corrects a fact, and refuses a blank one inline without calling the server', async () => {
    const m = memory(FACTS);
    const notice = vi.fn();
    render(<AssistantMemoryPanel memory={m} assistantName="Porter" onClose={() => {}} onNotice={notice} />);
    await screen.findByText('Amara');

    fireEvent.click(screen.getByRole('button', { name: 'Edit Name' }));
    const input = screen.getByLabelText('Name');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText(/can't be blank/)).toBeTruthy();
    expect(m.correct).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: 'Amara O.' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })));
    expect(m.correct).toHaveBeenCalledWith('identity.name', 'Amara O.', 'Name');
    expect(await screen.findByText('Amara O.')).toBeTruthy();
    expect(notice).toHaveBeenCalledWith('Updated what Porter remembers.');
  });

  it('forgets one fact only after confirming, naming it', async () => {
    const m = memory(FACTS);
    render(<AssistantMemoryPanel memory={m} assistantName="Porter" onClose={() => {}} />);
    await screen.findByText('Amara');

    fireEvent.click(screen.getByRole('button', { name: 'Forget Name' }));
    expect(m.forget).not.toHaveBeenCalled();
    expect(screen.getByText(/no longer remember "Name"/)).toBeTruthy();

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Forget' })));
    expect(m.forget).toHaveBeenCalledWith('identity.name');
    await waitFor(() => expect(screen.queryByText('Amara')).toBeNull());
  });

  it('forgets everything only after confirming, then shows the empty state', async () => {
    const m = memory(FACTS);
    render(<AssistantMemoryPanel memory={m} assistantName="Porter" onClose={() => {}} />);
    await screen.findByText('Amara');

    fireEvent.click(screen.getByRole('button', { name: 'Forget everything' }));
    expect(m.forgetAll).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getAllByRole('button', { name: 'Forget everything' })[0]!));

    expect(m.forgetAll).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Porter hasn't noted anything about you yet.")).toBeTruthy();
  });

  it('hands a failure to the product with the real reason, and Back returns to the chat', async () => {
    const m = memory(FACTS);
    m.forget = vi.fn(async () => {
      throw new Error('The assistant is not reachable right now. Try again in a moment.');
    });
    const onError = vi.fn();
    const onClose = vi.fn();
    render(<AssistantMemoryPanel memory={m} assistantName="Porter" onClose={onClose} onError={onError} />);
    await screen.findByText('Amara');

    fireEvent.click(screen.getByRole('button', { name: 'Forget Name' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Forget' })));
    expect((onError.mock.calls[0]![0] as Error).message).toBe('The assistant is not reachable right now. Try again in a moment.');
    expect(screen.getByText('Amara')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Back to the chat' }));
    expect(onClose).toHaveBeenCalled();
  });
});
