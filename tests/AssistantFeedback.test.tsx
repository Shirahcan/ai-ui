import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  ASSISTANT_FEEDBACK_REASONS,
  AssistantFeedback,
} from '../src/components/AssistantFeedback';

/**
 * The one feedback control, and the drift it ends.
 *
 * ⚠ THE ASSERTION THAT EARNS THIS FILE IS THE REASON VOCABULARY. Two products posted the
 * SAME five codes to the same kind of analytics while asking the user in different words -
 * four of five labels differed - so a backlog grouped by code was grouping answers to five
 * differently worded questions. The codes are a contract with two backends; pinning them
 * here is what stops a future edit changing one and not the other.
 */
describe('AssistantFeedback', () => {
  it('pins the reason codes, because two backends already accept exactly these', () => {
    expect(ASSISTANT_FEEDBACK_REASONS.map((r) => r.code)).toEqual([
      'wrong_topic',
      'outdated_info',
      'didnt_understand',
      'missing_detail',
      'unhelpful_other',
    ]);

    // Every code carries copy, because a chip with no label is a chip nobody can choose.
    for (const reason of ASSISTANT_FEEDBACK_REASONS) {
      expect(reason.label.trim().length).toBeGreaterThan(0);
    }
  });

  it('sends a thumbs-up immediately, with no reason asked for', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<AssistantFeedback onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'This reply was helpful' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ sentiment: 'positive' }));

    // ⚠ Settled, and it says so: asking again is noise.
    await waitFor(() => expect(screen.getByText('Thanks for the feedback')).toBeTruthy());
  });

  /**
   * ⚠ THE REASONS REVEAL INLINE, which is the mechanism that makes this portable. Portify's
   * own version used a Radix popover, and a shared component that pulls in a positioning
   * library makes itself unadoptable by any product that does not already have one.
   */
  it('reveals the reasons on thumbs-down rather than sending anything', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<AssistantFeedback onSubmit={onSubmit} />);

    expect(screen.queryByText('Off topic')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'This reply was not helpful' }));

    expect(screen.getByText('Off topic')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('sends the chosen reason and the note together', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<AssistantFeedback onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'This reply was not helpful' }));
    fireEvent.click(screen.getByText('Out of date'));
    fireEvent.change(screen.getByLabelText('Add detail about what was wrong'), {
      target: { value: '  the fee changed in April  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        sentiment: 'negative',
        reasonCode: 'outdated_info',
        reasonText: 'the fee changed in April',
      }),
    );
  });

  it('sends a bare thumbs-down when nothing else was said', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<AssistantFeedback onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'This reply was not helpful' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ sentiment: 'negative' }));
  });

  it('lets a chip be unchosen', () => {
    render(<AssistantFeedback onSubmit={vi.fn().mockResolvedValue(undefined)} />);
    fireEvent.click(screen.getByRole('button', { name: 'This reply was not helpful' }));

    const chip = screen.getByText('Missing detail');
    fireEvent.click(chip);
    expect(chip.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(chip);
    expect(chip.getAttribute('aria-pressed')).toBe('false');
  });

  it('caps the note rather than letting it grow unbounded', () => {
    render(<AssistantFeedback onSubmit={vi.fn().mockResolvedValue(undefined)} maxTextLength={10} />);
    fireEvent.click(screen.getByRole('button', { name: 'This reply was not helpful' }));

    const box = screen.getByLabelText('Add detail about what was wrong') as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'far longer than ten' } });

    expect(box.value).toBe('far longer');
    expect(screen.getByText('10/10')).toBeTruthy();
  });

  /**
   * ⚠ A FAILED SEND IS AN ALARM AND MUST NOT LOOK SETTLED. The reader's click did not land,
   * so a "Thanks" pill here would be a lie, and the control has to stay usable.
   */
  it('reports a failed send without pretending it worked', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('The network refused that.'));

    render(<AssistantFeedback onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'This reply was helpful' }));

    await waitFor(() => {
      const alerts = screen.queryAllByRole('alert');
      expect(alerts).toHaveLength(1);
      expect(alerts[0]?.textContent).toBe('The network refused that.');
    });

    expect(screen.queryByText('Thanks for the feedback')).toBeNull();
    expect(screen.getByRole('button', { name: 'This reply was helpful' })).toBeTruthy();
  });
});
