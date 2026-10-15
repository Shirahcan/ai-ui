import { AssistantMessage } from './AssistantMessage';
import { aiVar } from '../theme';
import type { MarkdownTheme } from '../markdown';
import type { PanelMessage } from '../types';

/**
 * The default bubble, so a product that overrides nothing still gets a
 * conversation it can read.
 *
 * ⚠ IT IS A DEFAULT, NOT A MANDATE. `AssistantPanel`'s `renderBubble` slot
 * replaces this wholesale, and a mature product will replace it: a real bubble
 * carries an avatar, a feedback control and the product's own action cards.
 * What is shared is the thing underneath - the role alignment, the streaming
 * cursor, the error row and the Markdown map. The chrome is the product's and
 * always was.
 *
 * ⚠ NO AVATAR AND NO ICON SET LIVE HERE. An icon import would make this
 * package depend on a product's icon library, and the three products use three
 * different ones.
 */
export interface MessageBubbleProps {
  message: PanelMessage;

  /** Overrides for the Markdown map inside an assistant bubble. */
  markdownTheme?: MarkdownTheme;

  className?: string;
}

export function MessageBubble({ message, markdownTheme, className }: MessageBubbleProps) {
  const isUser = message.role === 'user';

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
        className="max-w-[85%] px-3 py-2 text-sm leading-relaxed"
        style={{
          borderRadius: aiVar('--ai-radius'),
          background: isUser ? aiVar('--ai-bubble-user-bg') : aiVar('--ai-bubble-assistant-bg'),
          color: isUser ? aiVar('--ai-bubble-user-fg') : aiVar('--ai-bubble-assistant-fg'),
        }}
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
            />
          )
        )}

        {message.error ? (
          <p className="mt-1.5 text-xs" style={{ color: aiVar('--ai-danger') }} role="alert">
            {message.error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
