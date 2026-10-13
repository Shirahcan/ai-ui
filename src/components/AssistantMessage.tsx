import ReactMarkdown from 'react-markdown';
import { assistantMarkdownComponents, assistantRemarkPlugins, type MarkdownTheme } from '../markdown';

/**
 * One assistant message, rendered.
 *
 * ⚠ IT IS THE MARKDOWN MAP PLUS A CURSOR, AND NOTHING ELSE. The bubble, the
 * avatar, the timestamp and the feedback controls stay in the product: those are
 * where an assistant's surface differs most between products, and a shared
 * component that owned them would be forked within a month. What is genuinely
 * shared is how the WORDS are rendered - which is the part that was broken in
 * two places for want of one owner.
 */
export interface AssistantMessageProps {
  /** The text so far. Markdown. */
  text: string;

  /**
   * True while tokens are still arriving.
   *
   * ⚠ IT DRAWS A CURSOR, AND THE CURSOR IS NOT DECORATION. Streamed prose
   * routinely pauses for a second mid-sentence, and without a visible "still
   * writing" mark a reader takes the pause for the end and acts on half an
   * answer. That is the same failure as reporting a truncated stream as
   * success, arriving through the eyes instead of through the code.
   */
  streaming?: boolean;

  theme?: MarkdownTheme;
  className?: string;
  cursorClassName?: string;
}

export function AssistantMessage({
  text,
  streaming = false,
  theme,
  className,
  cursorClassName = 'ml-0.5 inline-block h-[1em] w-[2px] animate-pulse align-text-bottom bg-current',
}: AssistantMessageProps) {
  /*
   * ⚠ THE EMPTY-WHILE-STREAMING CASE IS NOT NOTHING. Between "open" and the
   * first token there is no text, and rendering an empty element makes the
   * panel look as though the turn finished instantly with no answer. The cursor
   * alone is the honest thing to show.
   */
  if (text === '' && streaming) {
    return (
      <div className={className}>
        <span className={cursorClassName} aria-hidden="true" />
        <span className="sr-only">The assistant is writing.</span>
      </div>
    );
  }

  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={assistantRemarkPlugins}
        components={assistantMarkdownComponents(theme)}
      >
        {text}
      </ReactMarkdown>

      {streaming ? (
        <>
          <span className={cursorClassName} aria-hidden="true" />
          <span className="sr-only">The assistant is still writing.</span>
        </>
      ) : null}
    </div>
  );
}
