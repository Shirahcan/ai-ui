import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
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

  /** Disables the box AND the button: the surface itself is not usable. */
  disabled?: boolean;

  /**
   * Refuses Send while leaving the box typable.
   *
   * ⚠ THE TWO ARE NOT THE SAME THING, and conflating them loses a question.
   * Porter's panel opens before its thread has loaded, and somebody who starts
   * typing immediately must keep what they typed: disabling the box would have
   * swallowed it, which is why `disabled` alone was not enough to adopt this.
   */
  sendDisabled?: boolean;

  /**
   * Lets a question be sent while a turn is already running.
   *
   * ⚠ IT EXISTS BECAUSE BLOCKING IT BROKE A DOCUMENTED CAPABILITY, which is the
   * most useful kind of reason. Porter supersedes: send "actually, LMIA only"
   * mid-answer and the backend takes both messages as one question, so a reader
   * who spots their own mistake does not have to wait for an answer they no
   * longer want. Porter's own knowledge base promises it in three bullets. The
   * default here refuses it - a second turn painting into one message list is a
   * real defect for a panel with no supersede path - so the product that HAS one
   * says so.
   *
   * Enter is the way in. The button is Stop while busy, deliberately: two live
   * buttons during a turn invite exactly the double-send this guards against.
   */
  sendWhileBusy?: boolean;

  /**
   * Longest question the box accepts.
   *
   * ⚠ IT IS AN ABUSE CONTROL ON A PUBLIC SURFACE, not a tidiness one. Porter's
   * signed-out panel caps questions at 1,000 characters because anybody on the
   * internet can reach it and every turn costs a provider call. Omitted, there is
   * no cap, which is right for a panel behind a login.
   */
  maxLength?: number;

  /**
   * Previously sent messages, NEWEST FIRST, recalled with the arrow keys.
   *
   * ⚠ IT IS SHELL BEHAVIOUR, AND ONLY ONE PRODUCT IN THE ESTATE HAD IT. Up
   * walks toward older entries, Down walks back to the draft you were writing,
   * and the draft is stashed rather than lost. It fires only with the caret at
   * the very start or the very end of the box, so a multi-line question keeps
   * ordinary line navigation - without that guard, editing the second line of a
   * question silently replaces the whole thing with an older one.
   */
  history?: string[];

  className?: string;
  textareaClassName?: string;
  buttonClassName?: string;
  /** Stop's own styling. Falls back to `buttonClassName`. */
  stopClassName?: string;
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
  sendDisabled = false,
  sendWhileBusy = false,
  maxLength,
  history = [],
  className,
  textareaClassName,
  buttonClassName,
  stopClassName,
}: ComposerProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  /*
   * ⚠ -1 MEANS "THE LIVE DRAFT", not "the newest entry", and `draftRef` is what
   * makes walking back non-destructive: a half-written question is stashed on
   * the way out and restored on the way home. A recall ring that cannot return
   * to the draft eats the thing somebody was actually typing.
   */
  const [recallIndex, setRecallIndex] = useState(-1);
  const draftRef = useRef('');

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

  const canSend =
    !disabled && !sendDisabled && (sendWhileBusy || !busy) && value.trim() !== '';

  const recallOlder = () => {
    const next = Math.min(recallIndex + 1, history.length - 1);
    const entry = history[next];
    if (entry === undefined) return;

    if (recallIndex === -1) draftRef.current = value;
    setRecallIndex(next);
    onChange(entry);
  };

  const recallNewer = () => {
    const next = recallIndex - 1;

    if (next === -1) {
      setRecallIndex(-1);
      onChange(draftRef.current);
      return;
    }

    const entry = history[next];
    if (entry === undefined) return;

    setRecallIndex(next);
    onChange(entry);
  };

  const send = () => {
    setRecallIndex(-1);
    onSend();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const el = event.currentTarget;

    if (event.key === 'Enter' && !event.shiftKey) {
      // Choosing an IME candidate, not sending a message.
      if (event.nativeEvent.isComposing) return;

      event.preventDefault();
      if (canSend) send();
      return;
    }

    /*
     * ⚠ THE GUARDS ARE WHAT MAKE THIS SAFE TO SHIP TO EVERY PRODUCT. No
     * history, or a caret that is not at the very edge, and the key does what a
     * textarea's arrow key is supposed to do. `preventDefault` is called only
     * where a recall actually happens.
     */
    if (history.length === 0) return;

    if (event.key === 'ArrowUp' && el.selectionStart === 0 && el.selectionEnd === 0) {
      event.preventDefault();
      recallOlder();
      return;
    }

    if (
      event.key === 'ArrowDown'
      && recallIndex !== -1
      && el.selectionStart === el.value.length
      && el.selectionEnd === el.value.length
    ) {
      event.preventDefault();
      recallNewer();
    }
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
        maxLength={maxLength}
        value={value}
        /*
         * ⚠ TYPING LEAVES THE RECALL RING, and this is the only place that can
         * tell typing apart from a recall: a recall writes through `onChange`
         * directly and never reaches this handler.
         */
        onChange={(event) => {
          setRecallIndex(-1);
          onChange(event.target.value);
        }}
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
            stopClassName ??
            buttonClassName ??
            'shrink-0 rounded-full px-3 py-2 text-sm font-medium outline-none'
          }
        />
      ) : (
        <button
          type="button"
          onClick={send}
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
