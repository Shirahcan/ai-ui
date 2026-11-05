import { aiVar } from '../theme';
import { MicIcon, StopSquareIcon } from '../icons';
import { DEFAULT_DICTATION_LABELS, type DictationLabels } from './session';
import type { Dictation } from './useDictation';

/**
 * The microphone button. Sized and coloured like the composer's paperclip so the two sit together;
 * while listening it fills with the accent, a ring grows with the voice, and it becomes Stop.
 *
 * Colours come from the theme's CSS variables, not from class props: every product's composer gets
 * the same button, not a licensed variant of it.
 */
export interface DictationButtonProps {
  dictation: Dictation;
  disabled?: boolean;
  labels?: Partial<Pick<DictationLabels, 'start' | 'stop'>>;
}

export function DictationButton({ dictation, disabled = false, labels }: DictationButtonProps) {
  if (!dictation.supported) return null;

  const busy = dictation.state === 'finishing';
  const on = dictation.listening;
  const label = on ? labels?.stop ?? DEFAULT_DICTATION_LABELS.stop : labels?.start ?? DEFAULT_DICTATION_LABELS.start;
  // The ring: 0 to 6px of accent around the button, following the voice.
  const ring = on ? Math.round(2 + dictation.level * 6) : 0;

  return (
    <button
      type="button"
      onClick={dictation.toggle}
      disabled={disabled || busy}
      aria-pressed={on}
      aria-label={label}
      title={label}
      className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full outline-none transition-[box-shadow,background-color] duration-100 hover:bg-[var(--ai-accent-soft)] focus-visible:ring-2 focus-visible:ring-[var(--ai-accent)] disabled:opacity-40"
      style={{
        color: on ? aiVar('--ai-accent-fg') : aiVar('--ai-muted'),
        backgroundColor: on ? aiVar('--ai-accent') : undefined,
        boxShadow: on ? `0 0 0 ${ring}px ${aiVar('--ai-accent-soft')}` : undefined,
      }}
    >
      {on ? <StopSquareIcon /> : <MicIcon />}
    </button>
  );
}

/**
 * The line under the box: grey words while speaking (where the device can recognise them), else
 * "Listening..." or a plain-words error. Announced politely to screen readers.
 */
export function DictationStatus({ dictation, className }: { dictation: Dictation; className?: string }) {
  const text = dictation.preview || dictation.message;
  const isError = dictation.state === 'error';

  return (
    <div aria-live="polite" className={className ?? 'px-3 text-xs'} style={{ color: isError ? aiVar('--ai-danger') : aiVar('--ai-muted') }}>
      {text ? <span className={dictation.preview ? 'italic' : undefined}>{text}</span> : null}
    </div>
  );
}
