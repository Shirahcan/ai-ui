import { useLayoutEffect, useRef, type KeyboardEvent } from 'react';
import { StopButton } from './StopButton';
import { aiVar } from '../theme';

/** Tallest the input grows before it scrolls internally (px) - about 6 lines. */
const MAX_HEIGHT = 160;

/**
 * The default typing area: one line that grows, Enter to send, Stop in place of
 * Send while a turn is running.
 *
 * ⚠ ENTER SENDS AND SHIFT+ENTER BREAKS THE LINE, in that order, because
 * every chat surface a user has ever used behaves that way and a panel that
 * does the opposite loses half-written questions. The one exception is an IME
 * composition: pressing Enter to CHOOSE a candidate character must not send the
 * message, which is why `isComposing` is checked. Without it this panel is
 * unusable in Japanese, Chinese or Korean, and nobody testing in English would
 * ever see it.
 */
export interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;

  /** While true, Send is replaced by Stop and the textarea stays editable. */
  busy?: boolean;
  onStop?: () => void;

  /**
   * The field's `id` and `name`.
   *
   * ⚠ A FIELD WITH NEITHER IS A REAL DEFECT, not a lint preference, and Chrome's
   * issues panel says so on every page this panel renders on: "a form field
   * element should have an id or name attribute". Two consequences, both real.
   * Without a `name` the browser cannot restore the field on a session restore
   * or a back-navigation, so a half-typed question is lost by a mis-click.
   * Without an `id` a PRODUCT cannot associate its own visible `<label>` with
   * it - which is exactly what finance-suite needed in P14c, where the only
   * accessible name was coming from the PLACEHOLDER and therefore vanished the
   * moment anybody typed.
   *
   * `aria-label` is still set from the placeholder as a floor, so a product that
   * passes neither is named rather than anonymous.
   */
  id?: string;
  name?: string;

  placeholder?: string;
  sendLabel?: string;
  stopLabel?: string;
  disabled?: boolean;

  className?: string;
  textareaClassName?: string;
  buttonClassName?: string;
}

export function Composer({
  value,
  onChange,
  onSend,
  busy = false,
  onStop,
  id = 'ai-composer',
  name = 'message',
  placeholder = 'Ask a question',
  sendLabel = 'Send',
  stopLabel = 'Stop',
  disabled = false,
  className,
  textareaClassName,
  buttonClassName,
}: ComposerProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  /*
   * Collapse to `auto` to measure the true content height, then lock to it.
   * `box-sizing: border-box` means `scrollHeight` EXCLUDES the border, so the
   * border is added back or the last line is clipped by two pixels. Runs before
   * paint, so the resize is never visible as a flash.
   */
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.style.height = 'auto';
    const border = el.offsetHeight - el.clientHeight;
    el.style.height = `${Math.min(el.scrollHeight + border, MAX_HEIGHT)}px`;
  }, [value]);

  const canSend = !disabled && !busy && value.trim() !== '';

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return;

    // Choosing an IME candidate, not sending a message.
    if (event.nativeEvent.isComposing) return;

    event.preventDefault();
    if (canSend) onSend();
  };

  return (
    <div
      className={className ?? 'flex items-end gap-2 p-2'}
      style={{ borderTop: `1px solid ${aiVar('--ai-border')}` }}
    >
      <textarea
        ref={ref}
        id={id}
        name={name}
        rows={1}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={placeholder}
        className={
          textareaClassName ??
          'flex-1 resize-none overflow-y-auto bg-transparent px-3 py-2 text-sm outline-none'
        }
        style={{ color: aiVar('--ai-fg') }}
      />

      {busy && onStop ? (
        <StopButton
          onStop={onStop}
          label={stopLabel}
          className={
            buttonClassName ??
            'shrink-0 rounded-full px-3 py-2 text-sm font-medium outline-none'
          }
        />
      ) : (
        <button
          type="button"
          onClick={onSend}
          /*
           * ⚠ DISABLED ON AN EMPTY BOX, NOT ON `busy` ALONE. A product that
           * only disables while busy ships a Send that fires an empty turn,
           * and an empty turn still costs a provider call and still writes a
           * blank message into the history.
           */
          disabled={!canSend}
          aria-label={sendLabel}
          className={
            buttonClassName ??
            'shrink-0 rounded-full px-3 py-2 text-sm font-medium outline-none disabled:opacity-40'
          }
          style={{ background: aiVar('--ai-accent'), color: aiVar('--ai-accent-fg') }}
        >
          {sendLabel}
        </button>
      )}
    </div>
  );
}
