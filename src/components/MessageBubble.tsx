import type { ReactNode } from 'react';
import { AssistantMessage } from './AssistantMessage';
import { aiVar } from '../theme';
import type { MarkdownTheme } from '../markdown';
import type { PanelMessage } from '../types';

/**
 * One row of a conversation: who said it, what they said, and what the reader
 * needs to know about it before acting on it.
 *
 * ⚠ IT IS NO LONGER "A DEFAULT A MATURE PRODUCT WILL REPLACE". That is what
 * this file said until P18b, and the opposite turned out to be true. Three
 * products adopted `AssistantPanel` and every one of them handed back its own
 * bubble through `renderBubble`, so the thing a reader actually LOOKS at was
 * still three separate implementations - and they had already drifted on the one
 * thing that is not decoration. Porter labelled an ungrounded answer
 * "Best-effort"; Mira, whose API returns the same two fields, rendered neither,
 * so the same unsourced answer arrived flagged in one product and unflagged in
 * the other. A product still overrides this wholesale if it wants to; what
 * changed is that both mature products now USE it, and the generic half lives
 * here once.
 *
 * ⚠ WHAT IS GENERIC IS THE FRAME AND THE CAVEAT. The row and its alignment, the
 * user's words never passing through Markdown, the assistant's words always
 * passing through the shared map, the streaming cursor, the error row and the
 * ungrounded label. What stays the product's is everything it puts in `content`
 * (Porter's action cards, data tables and consent cards) and everything it puts
 * in `footer` (its feedback control, its call-to-action links).
 *
 * ⚠ `footer` IS A PROP, NOT A FIELD ON THE MESSAGE, and that is deliberate.
 * Porter learned in P16 that putting rendered nodes on the message makes the
 * message list recompute on every keystroke, because the action handlers the
 * nodes close over are new on each render. The messages stay pure data and the
 * nodes are built in `renderBubble`, which runs during render anyway.
 *
 * ⚠ NO AVATAR AND NO ICON SET LIVE HERE. An icon import would make this
 * package depend on a product's icon library, and the three products use three
 * different ones.
 */
export interface MessageBubbleProps {
  message: PanelMessage;

  /** Overrides for the Markdown map inside an assistant bubble. */
  markdownTheme?: MarkdownTheme;

  /**
   * The product's own controls, inside the bubble and after the caveat.
   *
   * ⚠ AFTER THE CAVEAT, NOT BEFORE IT. An ungrounded answer's label has to be
   * readable before the button that acts on it, or the reader commits first and
   * learns it was a guess second.
   */
  footer?: ReactNode;

  /** The row. */
  className?: string;

  /**
   * The wrapper around the assistant's rendered Markdown.
   *
   * ⚠ IT EXISTS FOR `break-words`, WHICH IS LOAD-BEARING IN A NARROW PANEL. An
   * answer can contain a long URL, and an unbroken one in a ~330px bubble pushes
   * the whole conversation sideways. Porter has carried `break-words
   * [&_a]:break-words` since its own panel shipped, and adopting this bubble
   * without somewhere to put it would have cost that. Not applied to a user's
   * own row, which keeps `whitespace-pre-wrap` and nothing else.
   */
  contentClassName?: string;

  /**
   * The bubble itself, per speaker.
   *
   * ⚠ PASSING ONE REPLACES THE PACKAGE'S OWN COLOURS FOR THAT SPEAKER, inline
   * style included - otherwise the cascade would lose, since an inline
   * `background` beats any class a product writes. Same contract as the chips in
   * `AssistantFeedback`.
   */
  bubbleClassName?: string;
  userBubbleClassName?: string;

  confidenceClassName?: string;
}

/**
 * Is there an honest caveat to show on this row?
 *
 * ⚠ `grounded === false`, NEVER `!grounded`. Most products do not report
 * grounding at all, and `undefined` from one of those must mean "no claim made",
 * not "this was a guess" - a loose check would stamp BEST-EFFORT on every answer
 * in every product that never set the field.
 *
 * ⚠ AND THE LABEL IS COERCED TO A NON-EMPTY STRING. Porter's transcript read
 * path handed back the number `0` for a day, so `confidence && <span>` printed a
 * bare "0" into the bubble and dropped the caveat. Typing it `string` does not
 * stop an API from sending something else; this does.
 */
function confidenceLabel(message: PanelMessage): string | null {
  if (message.role === 'user' || message.grounded !== false) return null;

  const raw = message.confidence;
  if (typeof raw !== 'string') return null;

  const label = raw.trim();

  return label === '' ? null : label;
}

export function MessageBubble({
  message,
  markdownTheme,
  footer,
  className,
  contentClassName,
  bubbleClassName,
  userBubbleClassName,
  confidenceClassName,
}: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const ownClass = isUser ? userBubbleClassName : bubbleClassName;
  const caveat = confidenceLabel(message);

  return (
    <div
      className={
        className ?? `flex w-full ${isUser ? 'justify-end' : 'justify-start'} px-1 py-1.5`
      }
      /*
       * ⚠ `data-role` IS PART OF THE CONTRACT, not debug residue. It is how
       * a product styles the two speakers from its own stylesheet without
       * passing a className through the slot, and how a test asserts which
       * speaker a row belongs to without depending on this layout.
       */
      data-role={message.role}
    >
      <div
        className={ownClass ?? 'max-w-[85%] px-3 py-2 text-sm leading-relaxed'}
        style={
          ownClass
            ? undefined
            : {
                borderRadius: aiVar('--ai-radius'),
                background: isUser
                  ? aiVar('--ai-bubble-user-bg')
                  : aiVar('--ai-bubble-assistant-bg'),
                color: isUser
                  ? aiVar('--ai-bubble-user-fg')
                  : aiVar('--ai-bubble-assistant-fg'),
              }
        }
      >
        {message.content ?? (
          isUser ? (
            /*
             * ⚠ A USER'S OWN WORDS ARE NEVER RENDERED AS MARKDOWN. Somebody
             * typing `**` or a stray underscore means those characters, and a
             * question pasted from a document would otherwise come back with
             * its formatting silently re-interpreted - and, worse, with any
             * HTML in it handed to a renderer. `whitespace-pre-wrap` keeps
             * their line breaks, which is all they asked for.
             */
            <p className="whitespace-pre-wrap">{message.text}</p>
          ) : (
            <AssistantMessage
              text={message.text}
              streaming={message.streaming}
              theme={markdownTheme}
              className={contentClassName}
            />
          )
        )}

        {/*
          ⚠ THE CAVEAT IS THE WHOLE REASON THIS MOVED. An answer the assistant
          composed without retrieving anything is a different kind of object from
          one it read off a record, and a reader who cannot tell them apart will
          act on both the same way. Porter has said so since August; every other
          product in the estate said nothing.
        */}
        {caveat ? (
          <span
            className={
              confidenceClassName ??
              'mt-1.5 block text-[11px] font-bold uppercase tracking-wider'
            }
            style={confidenceClassName ? undefined : { color: aiVar('--ai-muted') }}
          >
            Best-effort · {caveat} confidence
          </span>
        ) : null}

        {footer}

        {message.error ? (
          <p className="mt-1.5 text-xs" style={{ color: aiVar('--ai-danger') }} role="alert">
            {message.error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
