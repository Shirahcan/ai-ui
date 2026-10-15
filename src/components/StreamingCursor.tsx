/**
 * The mark that says the assistant has not finished.
 *
 * ⚠ IT IS NOT DECORATION. Streamed prose routinely pauses for a second or
 * more mid-sentence while a provider thinks, and without a visible "still
 * writing" mark a reader takes the pause for the end and acts on half an answer.
 * A truncated sentence reads as a complete one often enough to matter. This is
 * the same failure as reporting a stream that ended without a terminal event as
 * a success - it just arrives through the eyes instead of through the code.
 *
 * ⚠ AND IT CARRIES THE SCREEN-READER HALF. `aria-hidden` on the bar plus
 * a `sr-only` sentence, because a pulsing rectangle announces nothing at all.
 */
export const STREAMING_CURSOR_CLASS =
  'ml-0.5 inline-block h-[1em] w-[2px] animate-pulse align-text-bottom bg-current';

export interface StreamingCursorProps {
  className?: string;
  /** What a screen reader is told. Overridable for a localised product. */
  label?: string;
}

export function StreamingCursor({
  className = STREAMING_CURSOR_CLASS,
  label = 'The assistant is still writing.',
}: StreamingCursorProps) {
  return (
    <>
      <span className={className} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </>
  );
}
