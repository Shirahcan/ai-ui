import { useLayoutEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import { StopButton } from './StopButton';
import {
  AttachButton,
  PendingAttachmentChips,
  useComposerAttachments,
  type ComposerAttachmentsConfig,
} from './ComposerAttachments';
import type { AttachmentChip } from '../types';
import { aiVar } from '../theme';
import { useDictation } from '../dictation/useDictation';
import { DictationButton, DictationStatus } from '../dictation/DictationButton';
import { insertPhrase } from '../dictation/text';
import type { DictationConfig } from '../dictation/session';
import { useHandsFree, type HandsFreeState } from '../dictation/useHandsFree';
import type { AssistantInputKind } from '../useAssistantConversation';
import { HeadsetIcon, StopSquareIcon } from '../icons';
import { ASSISTANT_GEOMETRY } from '../geometry';
import {
  ComposerPickerList,
  useComposerPicker,
  type ComposerMentionsConfig,
  type ComposerSlashCommand,
} from './ComposerPicker';

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
  /** The files ready on the message, when `attachments` is on (empty otherwise). */
  /**
   * `input` (1.36.0) says how this draft was made: typed, dictated, sent hands-free, an attachment,
   * a "/" prompt or an "@" mention. A product records it so its assistant can say how people ask.
   */
  onSend: (attachments: AttachmentChip[], input?: AssistantInputKind) => void;

  /**
   * Files on the message: a paperclip, drag-and-drop and paste. Omit it and there is no paperclip.
   * Send waits while a file is still uploading, and a message may be files with no words.
   */
  attachments?: ComposerAttachmentsConfig;

  /**
   * Speak instead of typing (1.32.0). A microphone beside the paperclip; each phrase lands at the
   * caret a moment after the person pauses. Omit it and there is no microphone. `transcribe` is the
   * product's own route: this package never calls ai-service.
   */
  dictation?: DictationConfig;

  /**
   * Hands-free conversation (1.34.0), with `dictation`: a headset button; on, the message sends itself
   * when the person stops talking and the microphone reopens after the answer. See useHandsFree.
   */
  handsFree?: HandsFreeState & { onToggle: () => void };

  /**
   * A surface's own controls in the tools row (1.38.0), after the microphone and hands-free and
   * before Send: a switch such as a page builder's "Plan first", or a chip naming what the message is
   * about. Keep it small (an icon or a short pill): the row also holds the dictation status line.
   *
   * ⚠ A SLOT, NOT A FORK. A product that needs one more control here adds it through this prop; a
   * copy of the composer inside a product loses every fix made to this one (IME Enter, the recall
   * ring, dictation order), and the estate has paid for each of those once already.
   */
  tools?: ReactNode;

  /** "@" opens the product's search and writes the pick into the message (1.34.0). */
  mentions?: ComposerMentionsConfig;

  /** "/" at the start of the box lists these; picking one fills the box (1.34.0). */
  slashCommands?: ComposerSlashCommand[];

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
   * While busy, Send stays and Stop sits beside it as an icon (1.50.0, owner 2026-11-09), so the
   * correction this exists for can be sent with the button as well as Enter.
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
  attachments,
  dictation: dictationConfig,
  handsFree,
  tools,
  mentions,
  slashCommands,
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

    /*
     * ⚠ NOT RENDERED MEANS NOTHING TO MEASURE. A panel kept mounted but `hidden`
     * (Reeve keeps its conversation that way) reports a scrollHeight of 0, and
     * locking to it pinned the box at its padding - 26px, with the placeholder
     * cut in half - until somebody typed. Left at `auto`, `rows={1}` sizes it.
     */
    if (el.getClientRects().length === 0) return;

    const border = el.offsetHeight - el.clientHeight;
    el.style.height = `${Math.min(el.scrollHeight + border, MAX_HEIGHT)}px`;
  }, [value]);

  const files = useComposerAttachments(attachments);

  /*
   * ⚠ THE VALUE IS READ FROM A REF, not from the render's `value`. Two phrases can come back in the
   * same tick; the second must land after the first, and the render that carries the first has not
   * happened yet.
   */
  const valueRef = useRef(value);
  useLayoutEffect(() => {
    valueRef.current = value;
  }, [value]);

  /*
   * ⚠ AND THE CARET IS READ FROM A REF UNTIL THE BROWSER HAS MOVED IT. Two phrases can land in the
   * same tick (the last one on Stop, right behind the one before); the second read the DOM caret,
   * which still sat before the first insert, and went in AHEAD of it (measured 2026-11-05).
   */
  const caretRef = useRef<number | null>(null);

  // How the current draft was made; cleared when it is sent. Dictation wins over typing in one draft.
  const originRef = useRef<AssistantInputKind | null>(null);

  const dictation = useDictation(dictationConfig, (phrase) => {
    originRef.current = 'dictated';
    const el = ref.current;
    const current = valueRef.current;
    const start = caretRef.current ?? (el ? el.selectionStart : current.length);
    const end = caretRef.current ?? (el ? el.selectionEnd : current.length);
    const next = insertPhrase(current, start, end, phrase);
    valueRef.current = next.value;
    caretRef.current = next.caret;
    onChange(next.value);
    requestAnimationFrame(() => {
      // A controlled value change throws the caret to the end; put it after the words just added.
      ref.current?.setSelectionRange(next.caret, next.caret);
      caretRef.current = null;
    });
  });
  const showDictationLine = Boolean(dictationConfig) && (dictation.preview !== '' || dictation.message !== null);

  // Where the caret is, for "@" (read on every change, key and click in the box).
  const [caret, setCaret] = useState(0);
  const readCaret = () => setCaret(ref.current?.selectionStart ?? value.length);
  const picker = useComposerPicker(value, caret, (next, at) => {
    if (originRef.current !== 'dictated') originRef.current = value.startsWith('/') ? 'slash' : 'mention';
    onChange(next);
    const to = at ?? next.length;
    setCaret(to);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(to, to);
    });
  }, mentions, slashCommands);

  const canSend =
    !disabled && !sendDisabled && (sendWhileBusy || !busy) && !files.uploading
    && (value.trim() !== '' || files.ready.length > 0);

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

  const send = (handsFreeSend = false) => {
    setRecallIndex(-1);
    const origin = handsFreeSend ? 'hands_free' : originRef.current;
    const input: AssistantInputKind = origin ?? (files.ready.length > 0 ? 'attachment' : 'typed');
    originRef.current = null;
    onSend(files.ready, input);
    files.clear();
  };

  useHandsFree(handsFree && dictationConfig ? handsFree : undefined, dictation, busy, value, () => {
    if (canSend) send(true);
  });

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    if (!attachments) return;
    const pasted = Array.from(event.clipboardData.files);
    if (pasted.length === 0) return;
    event.preventDefault();
    files.add(pasted);
  };

  const [dragging, setDragging] = useState(false);
  const dropHandlers = attachments && !disabled
    ? {
        onDragOver: (event: DragEvent<HTMLDivElement>) => {
          if (!event.dataTransfer.types.includes('Files')) return;
          event.preventDefault();
          setDragging(true);
        },
        onDragLeave: () => setDragging(false),
        onDrop: (event: DragEvent<HTMLDivElement>) => {
          event.preventDefault();
          setDragging(false);
          files.add(Array.from(event.dataTransfer.files));
        },
      }
    : {};

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const el = event.currentTarget;

    // An open "@" or "/" list takes the arrows, Enter, Tab and Escape.
    if (picker.onKeyDown(event)) return;

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

  /*
   * ⚠ ONE BOX, THE WORDS ON TOP AND THE TOOLS UNDERNEATH (1.33.0). The paperclip, the microphone
   * and Send used to share a row with the text box, so every new tool took width from the words:
   * on a 400px panel the box was down to half its width with two icons. Every chat surface people
   * know (Claude, ChatGPT, Gemini, Slack) puts the box full width and the tools in a row below it,
   * inside the same border, so that is the shape here. Tools sit left, Send right, and the
   * dictation status line takes the space between them.
   */
  const hasTools = Boolean(attachments) || Boolean(dictationConfig) || Boolean(handsFree) || Boolean(tools);

  return (
    <div
      className={className ?? 'p-2'}
      style={{
        borderTop: `1px solid ${aiVar('--ai-border')}`,
        ...(dragging ? { outline: `2px dashed ${aiVar('--ai-accent')}`, outlineOffset: '-4px' } : {}),
      }}
      {...dropHandlers}
    >
      <div
        data-ai-composer-box=""
        className="flex flex-col rounded-2xl border transition-colors focus-within:border-[var(--ai-accent)]"
        style={{ borderColor: aiVar('--ai-border'), background: aiVar('--ai-surface') }}
      >
        {attachments && files.items.length > 0 ? (
          <div className="px-2 pt-2">
            <PendingAttachmentChips items={files.items} onRemove={files.remove} />
          </div>
        ) : null}

        <ComposerPickerList picker={picker} listId={`${id}-picker`} />

        <textarea
          onPaste={onPaste}
          onSelect={readCaret}
          aria-expanded={picker.open}
          aria-controls={picker.open ? `${id}-picker` : undefined}
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
            setCaret(event.target.selectionStart ?? event.target.value.length);
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          aria-label={placeholder}
          className={
            textareaClassName ??
            'w-full resize-none overflow-y-auto bg-transparent px-3 pt-2.5 pb-1 text-sm leading-6 outline-none'
          }
          style={{ color: aiVar('--ai-fg') }}
        />

        <div data-ai-composer-tools="" className="flex items-center gap-1 px-1.5 pb-1.5">
          {attachments ? (
            <AttachButton config={attachments} onFiles={files.add} disabled={disabled} />
          ) : null}

          {dictationConfig ? <DictationButton dictation={dictation} disabled={disabled} /> : null}

          {dictationConfig && handsFree && dictation.supported ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                // Opened inside the tap: iOS starts audio only from a gesture.
                if (!handsFree.active && !dictation.listening) dictation.start();
                handsFree.onToggle();
              }}
              aria-pressed={handsFree.active}
              aria-label={handsFree.active ? 'Turn hands-free off' : 'Hands-free: talk, and hear the answer'}
              title={handsFree.active ? 'Hands-free is on' : 'Hands-free'}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full outline-none transition-colors"
              style={{
                color: handsFree.active ? aiVar('--ai-accent-fg') : aiVar('--ai-muted'),
                background: handsFree.active ? aiVar('--ai-accent') : 'transparent',
              }}
            >
              <HeadsetIcon />
            </button>
          ) : null}

          {tools}

          <div className={`min-w-0 flex-1 ${hasTools ? 'px-1' : ''}`}>
            {showDictationLine ? <DictationStatus dictation={dictation} className="truncate text-xs" /> : null}
          </div>

          {/*
           * ⚠ ON A PANEL THAT TAKES A CORRECTION MID-ANSWER, STOP SITS BESIDE SEND AS AN ICON (1.50.0;
           * owner 2026-11-09: "The 'send' button shouldn't be replaced by the 'stop'! the infra supports
           * interruptions/clarifications"). Swapping them hid the one way to send the correction the
           * panel supports. A panel with no supersede path keeps the swap below, for the double-send reason.
           */}
          {busy && onStop && sendWhileBusy ? (
            <StopButton onStop={onStop} label={stopLabel} className={ASSISTANT_GEOMETRY.composerStopIcon}>
              <StopSquareIcon />
            </StopButton>
          ) : null}
          {busy && onStop && !sendWhileBusy ? (
            <StopButton
              onStop={onStop}
              label={stopLabel}
              className={
                stopClassName ??
                buttonClassName ??
                'shrink-0 rounded-full px-3 py-1.5 text-sm font-medium outline-none'
              }
            />
          ) : (
            <button
              type="button"
              onClick={() => send()}
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
                'shrink-0 rounded-full px-3 py-1.5 text-sm font-medium outline-none disabled:opacity-40'
              }
              style={{ background: aiVar('--ai-accent'), color: aiVar('--ai-accent-fg') }}
            >
              {sendLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
