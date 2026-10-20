import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import { assistantMarkdownComponents, assistantRemarkPlugins, type MarkdownTheme } from '../markdown';
import { aiVar } from '../theme';

/**
 * AN ANSWER THAT HAS TO STAY CHECKABLE: caveats first, parts kept apart,
 * sources attached, and a refusal that is an answer rather than an error.
 *
 * ⚠ THIS IS THE PACKAGE'S SECOND SHARED SURFACE, and it exists because the
 * first one could not express the shape without destroying it. `AssistantPanel`
 * renders a stream of markdown, which is right for a conversation. It is wrong
 * for an answer whose SAFETY lives in its structure.
 *
 * The case that forced it (P14a, finance-suite's Reeve, measured 2026-10-20):
 * `ReeveAnswer` carries `what_the_books_say` and `what_the_rule_says` as
 * SEPARATE fields on purpose. Its own docblock says why - a system prompt
 * asking a model to keep a ledger figure and a regulation apart "works most of
 * the time, and most of the time is not a control". That product has already
 * shipped one hard-coded "not a breach" over 64 per cent of a client trust
 * account. Streaming the two into one bubble would have put them back in the
 * same paragraph and called it an adoption.
 *
 * ⚠ CAVEATS RENDER ABOVE THE ANSWER, AND THAT IS THE WHOLE POINT. A caveat
 * printed under a figure is read once the figure has already been believed. The
 * order is asserted by index in the tests rather than by presence, because
 * presence passes while the defect is live.
 *
 * ⚠ A REFUSAL IS NOT AN ERROR, AND CARRIES NO `role="alert"`. "The books do not
 * contain that", "the spend cap is reached", "no provider has been cleared to
 * read this" are all ANSWERS, and they arrive as successful responses. An alert
 * role makes a deliberate silence read as a broken screen - which is exactly
 * how a surface ends up reporting an assistant's correct refusal as a fault.
 *
 * ⚠ IT NAMES NO PRODUCT NOUN. There is no `books` prop and no `rule` prop: the
 * labels are the product's words, so a second consumer does not need a fork or
 * a rename. What is shared is the ORDER, the separation, and the three things
 * every grounded answer in this estate has got wrong at least once.
 */
export interface GroundedAnswerSection {
  /** The part's name, in the PRODUCT's words. Rendered as its own element. */
  label: string;

  /** Markdown. A blank body drops the whole section - see the class note. */
  body?: string | null;

  /**
   * One line under the label saying what this part is NOT.
   *
   * ⚠ IT BELONGS TO THE SECTION, not to the answer. "What the regulation
   * requires, not a verdict on this file" is only true of one of the two parts,
   * and a note floating at the bottom of the card would read as covering both.
   */
  note?: string;
}

export interface GroundedAnswerProps {
  /**
   * What could not be verified. ⚠ Rendered ABOVE everything else, including a
   * refusal: a refusal plus its caveats is the most informative answer this
   * component renders.
   */
  caveats?: string[];
  caveatsLabel?: string;

  /** The answer, in parts that must stay distinguishable. */
  sections?: GroundedAnswerSection[];

  /**
   * The exact source lines the answer leaned on, for a reader who wants to
   * check it.
   *
   * ⚠ IN A `details` ELEMENT: closed for everyone by default and present for
   * everyone. A citation list long enough to be useful is long enough to bury
   * the answer, and one behind a JavaScript toggle is one a screen reader may
   * never reach.
   */
  citations?: string[];
  citationsLabel?: string;

  /** Rendered INSTEAD of the sections. See the class note: not an error. */
  refusal?: string | null;

  /** Who wrote it, and the one line about what it is not. Rendered last. */
  attribution?: ReactNode;

  /**
   * Shown when there is neither a refusal nor a single non-blank section.
   *
   * ⚠ IT IS NEVER AN EMPTY DIV. An unset value is a visible "nothing came
   * back" state: a blank card reads as a button that did not work, and the
   * reader's next move is to press it again and pay for the same silence.
   */
  emptyLabel?: string;

  markdownTheme?: MarkdownTheme;

  className?: string;
  caveatsClassName?: string;
  sectionLabelClassName?: string;
  sectionBodyClassName?: string;
  citationsClassName?: string;
  refusalClassName?: string;
  attributionClassName?: string;
}

export function GroundedAnswer({
  caveats = [],
  caveatsLabel = 'What could not be verified',
  sections = [],
  citations = [],
  citationsLabel = 'What this answer leaned on',
  refusal = null,
  attribution,
  emptyLabel = 'Nothing came back for this. Nothing was changed.',
  markdownTheme,
  className = 'space-y-3 text-sm',
  caveatsClassName = 'rounded-xl border p-3 text-xs',
  sectionLabelClassName = 'text-xs font-semibold uppercase tracking-wide',
  sectionBodyClassName = 'mt-1',
  citationsClassName = 'text-xs',
  refusalClassName = 'border-l-2 pl-3',
  attributionClassName = 'text-xs',
}: GroundedAnswerProps) {
  /*
   * ⚠ A BLANK BODY IS DROPPED, NOT RENDERED AS AN EMPTY LABELLED BOX. A
   * structured model answer routinely returns '' for a part that did not apply,
   * and a heading with nothing under it reads as a part of the answer that went
   * missing rather than one that was never relevant.
   */
  const shown = sections.filter(
    (section) => typeof section.body === 'string' && section.body.trim() !== '',
  );

  const said = (refusal ?? '').trim();
  const hasAnswer = said !== '' || shown.length > 0;

  return (
    <div className={className} style={{ color: aiVar('--ai-fg') }}>
      {caveats.length > 0 ? (
        <div
          className={caveatsClassName}
          style={{ borderColor: aiVar('--ai-border'), color: aiVar('--ai-muted') }}
        >
          <p className="font-semibold">{caveatsLabel}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {caveats.map((caveat, index) => (
              <li key={`${index}:${caveat}`}>{caveat}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {said !== '' ? (
        /*
         * ⚠ NO `role="alert"`, DELIBERATELY. See the class note. It is a
         * paragraph a person reads, not an interruption.
         */
        <p className={refusalClassName} style={{ borderColor: aiVar('--ai-border') }}>
          {said}
        </p>
      ) : (
        shown.map((section) => (
          <div key={section.label}>
            <p className={sectionLabelClassName} style={{ color: aiVar('--ai-muted') }}>
              {section.label}
            </p>

            {section.note ? (
              <p className="text-xs" style={{ color: aiVar('--ai-muted') }}>
                {section.note}
              </p>
            ) : null}

            <div className={sectionBodyClassName}>
              <ReactMarkdown
                remarkPlugins={assistantRemarkPlugins}
                components={assistantMarkdownComponents(markdownTheme)}
              >
                {(section.body ?? '').trim()}
              </ReactMarkdown>
            </div>
          </div>
        ))
      )}

      {!hasAnswer ? <p style={{ color: aiVar('--ai-muted') }}>{emptyLabel}</p> : null}

      {citations.length > 0 ? (
        <details className={citationsClassName} style={{ color: aiVar('--ai-muted') }}>
          <summary className="cursor-pointer outline-none">
            {citationsLabel} ({citations.length})
          </summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {citations.map((line, index) => (
              <li key={`${index}:${line}`}>{line}</li>
            ))}
          </ul>
        </details>
      ) : null}

      {attribution ? (
        <p className={attributionClassName} style={{ color: aiVar('--ai-muted') }}>
          {attribution}
        </p>
      ) : null}
    </div>
  );
}
