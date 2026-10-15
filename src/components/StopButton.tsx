import type { ReactNode } from 'react';

/**
 * The control that ends a turn.
 *
 * ⚠ IT IS THE PANEL'S ONLY WAY OUT OF A SLOW PROVIDER, so it is never a
 * disabled-looking afterthought. A waterfall rung can run around 27 seconds
 * before it gives up and the next rung starts, which is long enough that a user
 * with no visible way to abandon the turn reloads the page instead - losing the
 * conversation, and leaving the provider generating and billing anyway.
 *
 * ⚠ AND IT REPLACES SEND, it does not sit beside it. Two live buttons during
 * a turn invite a second question into a panel that is still answering the
 * first, which is how two streams end up painting one message list.
 * `AssistantPanel` swaps them for that reason.
 */
export interface StopButtonProps {
  onStop: () => void;

  /** The visible verb. "Stop" is the right word; this is not a cancel dialog. */
  label?: string;

  className?: string;
  children?: ReactNode;
}

export function StopButton({ onStop, label = 'Stop', className, children }: StopButtonProps) {
  return (
    <button
      type="button"
      onClick={onStop}
      className={className ?? 'rounded-full px-3 py-1.5 text-sm font-medium outline-none'}
      /*
       * ⚠ The accessible name is stated even when a product passes an icon
       * as `children`, or the one escape from a slow turn is an unlabelled
       * square to anybody using a screen reader.
       */
      aria-label={label}
      title={label}
    >
      {children ?? label}
    </button>
  );
}
