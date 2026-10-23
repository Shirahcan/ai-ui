import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OnDemandAsk } from '../src/components/OnDemandAsk';

/**
 * The on-demand ask, and the one rule that earns it.
 *
 * ⚠ THE ASSERTION THAT MATTERS IS `role="alert"` ON A REFUSAL, OR RATHER ITS ABSENCE.
 * Every other property here is layout. That one is the behaviour four surfaces across two
 * products disagreed about: "the spend cap is reached" is a successful answer that leaves the
 * screen working, and rendering it as an alarm reads as a broken product. MployNow's
 * person-ask did exactly that, in red, beside a form that still worked.
 */
describe('OnDemandAsk', () => {
  const base = { askLabel: 'Ask Reeve', busyLabel: 'Writing…', onAsk: () => {} };

  it('never asks by itself', () => {
    const onAsk = vi.fn();

    render(<OnDemandAsk {...base} onAsk={onAsk} />);

    /*
     * ⚠ THE WHOLE ON-DEMAND RULE, AS A TEST. A component that could fire on mount is one
     * that will eventually be mounted somewhere nobody is reading - which is how 96% of one
     * month's AI bill went on work nobody asked for.
     */
    expect(onAsk).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Ask Reeve' }));

    expect(onAsk).toHaveBeenCalledTimes(1);
  });

  it('renders a refusal as guidance, with no alert', () => {
    render(<OnDemandAsk {...base} refusal="The spend cap for this month is reached." />);

    expect(screen.getByText('The spend cap for this month is reached.')).toBeTruthy();
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
  });

  it('renders a failure as an alarm, because it is one', () => {
    render(<OnDemandAsk {...base} error="The request did not reach the server." />);

    const alerts = screen.queryAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.textContent).toBe('The request did not reach the server.');
  });

  /**
   * ⚠ BOTH AT ONCE IS NOT A CONTRADICTION TO SMOOTH OVER. A product can hold a stale refusal
   * from a previous ask and a fresh failure from this one, and the reader needs the one that
   * is true now. The failure is an alarm either way; the refusal is not.
   */
  it('keeps the two apart when both are set', () => {
    render(<OnDemandAsk {...base} refusal="Not configured here." error="Network unreachable." />);

    expect(screen.queryAllByRole('alert')).toHaveLength(1);
    expect(screen.getByText('Not configured here.')).toBeTruthy();
  });

  it('shows the cost before the click, and only when a product says one', () => {
    const { rerender } = render(<OnDemandAsk {...base} />);
    expect(screen.queryByText(/costs a model call/)).toBeNull();

    rerender(<OnDemandAsk {...base} costNote="Optional, and it costs a model call." />);
    expect(screen.getByText('Optional, and it costs a model call.')).toBeTruthy();
  });

  it('says it is working, on the control and to a screen reader', () => {
    const { container } = render(<OnDemandAsk {...base} busy />);

    const button = screen.getByRole('button');
    expect(button.textContent).toBe('Writing…');
    expect(button).toHaveProperty('disabled', true);
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
  });

  /**
   * ⚠ THE ANSWER WINS OVER BOTH MESSAGES. Once there is prose on screen, a refusal or error
   * left over from an earlier ask is stale, and showing it beside a real answer is how a
   * reader comes to distrust the answer.
   */
  it('hides a stale refusal once an answer is present', () => {
    render(
      <OnDemandAsk {...base} refusal="Not configured here." attribution="Written by groq.">
        Three things are in the way of closing.
      </OnDemandAsk>,
    );

    expect(screen.getByText('Three things are in the way of closing.')).toBeTruthy();
    expect(screen.queryByText('Not configured here.')).toBeNull();
    expect(screen.getByText('Written by groq.')).toBeTruthy();
  });

  /** Attribution without an answer is attribution of nothing. */
  it('does not attribute an answer that is not there', () => {
    render(<OnDemandAsk {...base} attribution="Written by groq." />);

    expect(screen.queryByText('Written by groq.')).toBeNull();
  });

  it('lets the surface disable the ask without a busy state', () => {
    render(<OnDemandAsk {...base} disabled />);

    const button = screen.getByRole('button', { name: 'Ask Reeve' });
    expect(button).toHaveProperty('disabled', true);
  });
});
