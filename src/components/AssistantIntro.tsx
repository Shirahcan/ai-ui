import type { ReactNode } from 'react';
import { aiVar } from '../theme';

/**
 * What an assistant panel says before anybody has asked it anything.
 *
 * ⚠ AN EMPTY BOX TEACHES NOBODY WHAT AN ASSISTANT IS FOR, which is why all
 * three products wrote this screen and why it is worth having once. The shape is
 * the same everywhere: who this is, what it can do for you, and a few questions
 * you can ask without having to invent one.
 *
 * ⚠ THE COPY IS THE PRODUCT'S AND THE STRUCTURE IS THIS COMPONENT'S. The
 * greeting, the body prose and the prompts are all passed in; nothing in here
 * knows an assistant's name. Portify stacks its prompts full-width and MployNow
 * wraps them as chips, which is a class on the container rather than a mode -
 * `promptsClassName` and `promptClassName` express both without a branch.
 *
 * ⚠ AND THE PROMPT IS A `type="button"`, WHICH IS NOT A DETAIL. MployNow's
 * copy omitted it, and one of these panels renders inside a `<form>` whose
 * submit sends the composer: a starter prompt there submits the form instead of
 * asking its own question. The bug had not fired yet because of where the intro
 * happened to sit, which is the kind of latency that makes a shared component
 * worth more than a tidy one.
 */
export interface AssistantIntroProps {
  /** Who is speaking. Rendered first, in its own weight. */
  greeting?: ReactNode;

  /** The prose: what this assistant is for, in the product's own words. */
  children?: ReactNode;

  /**
   * Questions a reader can send with one click.
   *
   * ⚠ EVERY ONE MUST BE ANSWERABLE. Portify sources these from an endpoint that
   * only returns prompts backed by a registered handler, precisely so the first
   * thing a new user clicks cannot be the thing the assistant cannot do. A
   * hard-coded list is allowed and is a worse starting point.
   */
  prompts?: string[];
  onPrompt?: (prompt: string) => void;

  /** A label above the prompts ("Try asking"). Omitted, there is none. */
  promptsLabel?: ReactNode;

  className?: string;
  greetingClassName?: string;
  promptsLabelClassName?: string;
  /** The container the prompts sit in: a stack, or a wrapping row of chips. */
  promptsClassName?: string;
  promptClassName?: string;
}

export function AssistantIntro({
  greeting,
  children,
  prompts = [],
  onPrompt,
  promptsLabel,
  className,
  greetingClassName,
  promptsLabelClassName,
  promptsClassName,
  promptClassName,
}: AssistantIntroProps) {
  return (
    <div className={className ?? 'space-y-3'}>
      {greeting ? (
        <p
          className={greetingClassName ?? 'text-sm font-semibold'}
          style={greetingClassName ? undefined : { color: aiVar('--ai-fg') }}
        >
          {greeting}
        </p>
      ) : null}

      {children}

      {prompts.length > 0 && onPrompt ? (
        <div className="space-y-1.5 pt-1">
          {promptsLabel ? (
            <p
              className={
                promptsLabelClassName ?? 'text-xs font-medium uppercase tracking-wide'
              }
              style={promptsLabelClassName ? undefined : { color: aiVar('--ai-muted') }}
            >
              {promptsLabel}
            </p>
          ) : null}

          <div className={promptsClassName ?? 'space-y-1.5'}>
            {prompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => onPrompt(prompt)}
                className={
                  promptClassName ?? 'block w-full px-3 py-2 text-left text-sm outline-none'
                }
                style={
                  promptClassName
                    ? undefined
                    : { border: `1px solid ${aiVar('--ai-border')}`, color: aiVar('--ai-fg') }
                }
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
