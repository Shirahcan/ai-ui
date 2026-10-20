import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GroundedAnswer } from '../src/components/GroundedAnswer';

/**
 * ⚠ THE ACCEPTANCE TEST FOR THIS COMPONENT IS ORDER AND SEPARATION, NOT
 * CONTENT. Every assertion below that checks "is it there" would pass while the
 * defect it exists for is live, so the ones that matter check WHERE it is and
 * whether two things are still two things.
 */
describe('a grounded answer', () => {
  /**
   * ⚠ THE DEFECT THIS COMPONENT EXISTS FOR. A caveat printed under a figure is
   * read after the figure has already been believed. `ReeveAnswer`'s own
   * docblock says so, and the estate has shipped the inverted version twice: a
   * brief that reported a scan cap as a count, and a trust reconciliation that
   * passed over 890.92 of client money the date range had excluded.
   */
  it('puts the caveats BEFORE the answer, by position and not merely on the page', () => {
    const { container } = render(
      <GroundedAnswer
        caveats={['Two bank feeds stop on the 28th.']}
        sections={[{ label: 'What the books say', body: 'HST collected is 6,499.83.' }]}
      />,
    );

    const text = container.textContent ?? '';
    const caveat = text.indexOf('Two bank feeds');
    const figure = text.indexOf('6,499.83');

    expect(caveat).toBeGreaterThanOrEqual(0);
    expect(figure).toBeGreaterThanOrEqual(0);
    expect(caveat).toBeLessThan(figure);
  });

  /**
   * ⚠ AND ABOVE A REFUSAL TOO. A refusal plus the reason it could not be
   * answered is the most useful thing this component renders; printing the
   * caveats afterwards would make them read as an excuse rather than as the
   * explanation.
   */
  it('puts the caveats above a refusal as well', () => {
    const { container } = render(
      <GroundedAnswer
        caveats={['The October feed has not been imported.']}
        refusal="There is nothing in the books within your scope for that period."
      />,
    );

    const text = container.textContent ?? '';

    expect(text.indexOf('October feed')).toBeLessThan(text.indexOf('nothing in the books'));
  });

  /**
   * ⚠ TWO PARTS STAY TWO ELEMENTS. The whole reason `what_the_books_say` and
   * `what_the_rule_says` are separate fields is that a prompt asking a model to
   * keep a ledger figure and a regulation apart is a request, not a control. A
   * component that joined them would put the control back in the prompt.
   */
  it('keeps two sections distinguishable, each under its own label', () => {
    const { container } = render(
      <GroundedAnswer
        sections={[
          { label: 'What the books say', body: 'The trust bank holds 12,400.00.' },
          {
            label: 'What the rule says',
            body: 'Section 32 requires client money to be held separately.',
            note: 'What the regulation requires. Not a verdict on this file.',
          },
        ]}
      />,
    );

    const text = container.textContent ?? '';

    expect(text).toContain('What the books say');
    expect(text).toContain('What the rule says');
    expect(text).toContain('Not a verdict on this file');

    // The books figure comes first, and the two labels are not one paragraph.
    expect(text.indexOf('12,400.00')).toBeLessThan(text.indexOf('Section 32'));
    expect(container.querySelectorAll('p').length).toBeGreaterThanOrEqual(3);
  });

  /**
   * ⚠ A REFUSAL IS AN ANSWER AND MUST NOT CARRY AN ALERT ROLE. "The spend cap
   * is reached" and "no provider has been cleared to read this ledger" arrive
   * as successful responses. An alert role makes a deliberate, correct silence
   * read as a broken screen, and the reader's next move is to report a bug.
   */
  it('renders a refusal instead of the sections, and never as an alert', () => {
    const { container } = render(
      <GroundedAnswer
        refusal="Reeve is switched off because no AI provider has been cleared to read the ledger."
        sections={[{ label: 'What the books say', body: 'should not be rendered' }]}
      />,
    );

    expect(container.textContent).toContain('no AI provider has been cleared');
    expect(container.textContent).not.toContain('should not be rendered');
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  /**
   * ⚠ A BLANK PART IS NOT A MISSING PART. A structured answer returns '' or
   * null for a part that did not apply; a label with nothing under it reads as
   * an answer that lost half of itself.
   */
  it('drops a section whose body is blank rather than labelling an empty box', () => {
    const { container } = render(
      <GroundedAnswer
        sections={[
          { label: 'What the books say', body: 'Revenue for September is 18,220.14.' },
          { label: 'What the rule says', body: '   ' },
          { label: 'What the policy says', body: null },
        ]}
      />,
    );

    const text = container.textContent ?? '';

    expect(text).toContain('What the books say');
    expect(text).not.toContain('What the rule says');
    expect(text).not.toContain('What the policy says');
  });

  /**
   * ⚠ NOTHING TO SHOW IS A VISIBLE STATE, NOT AN EMPTY DIV. "Unset must fail
   * loudly, never silently": a blank card reads as a button that did not work,
   * so the reader presses it again and pays for the same silence.
   */
  it('says so when there is neither a refusal nor a usable section', () => {
    const { container } = render(<GroundedAnswer sections={[{ label: 'Answer', body: '' }]} />);

    expect((container.textContent ?? '').trim()).not.toBe('');
    expect(container.textContent).toContain('Nothing came back');
  });

  /**
   * The citations are for checking the answer, so they are in the document for
   * everybody and open for nobody.
   */
  it('attaches the citations in a closed details element', () => {
    const { container } = render(
      <GroundedAnswer
        sections={[{ label: 'Answer', body: 'HST collected is 6,499.83.' }]}
        citations={['HST collected Jul-Sep 2026: 6,499.83', 'HST paid Jul-Sep 2026: 1,118.07']}
      />,
    );

    const details = container.querySelector('details');

    expect(details).not.toBeNull();
    expect(details?.hasAttribute('open')).toBe(false);
    expect(container.querySelectorAll('details li')).toHaveLength(2);
    // The count travels, so a reader knows how much is behind the summary.
    expect(container.querySelector('summary')?.textContent).toContain('(2)');
  });

  /**
   * A section body is markdown, through the SAME map the chat panel uses - so a
   * grounded answer containing a table does not arrive as a wall of pipes, the
   * defect that put `remark-gfm` in this package in the first place.
   */
  it('renders a section body through the shared markdown map', () => {
    const table = ['| account | balance |', '|---|---|', '| Trust bank | 12,400.00 |'].join('\n');

    const { container } = render(
      <GroundedAnswer sections={[{ label: 'What the books say', body: table }]} />,
    );

    expect(container.querySelector('table')).not.toBeNull();
    expect(container.textContent).not.toContain('|---|');
  });

  /** Attribution is last, because it is about the answer rather than part of it. */
  it('renders the attribution after the answer', () => {
    const { container } = render(
      <GroundedAnswer
        sections={[{ label: 'Answer', body: 'Revenue is 18,220.14.' }]}
        attribution="Written by groq. Whether to close is yours."
      />,
    );

    const text = container.textContent ?? '';

    expect(text.indexOf('18,220.14')).toBeLessThan(text.indexOf('Written by groq'));
  });
});
