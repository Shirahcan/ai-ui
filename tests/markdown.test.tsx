import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AssistantMessage } from '../src/components/AssistantMessage';

describe('the assistant markdown map', () => {
  /**
   * ⚠ THE DEFECT THIS PACKAGE EXISTS FOR. `react-markdown` does NOT parse GFM
   * tables without `remark-gfm`, so a knowledge entry containing a table
   * arrived in production as `| | what it is for | |---|---| | **Portify** |` -
   * a wall of punctuation in the middle of an otherwise clean answer. It is the
   * single easiest plugin to leave out, because everything else works without
   * it.
   */
  it('renders a GFM table as a real table', () => {
    const markdown = ['| product | what it is for |', '|---|---|', '| Portify | immigration |'].join('\n');

    const { container } = render(<AssistantMessage text={markdown} />);

    expect(container.querySelector('table')).not.toBeNull();
    expect(container.querySelectorAll('th')).toHaveLength(2);
    expect(container.textContent).toContain('immigration');
    // And none of the raw pipes survive as text.
    expect(container.textContent).not.toContain('|---|');
  });

  /**
   * ⚠ A SECOND `h1` ON A PAGE IS A REAL ACCESSIBILITY DEFECT. A chat panel sits
   * inside a page that already has its own title, and knowledge entries are
   * written as documents - so an unmapped `#` heading announces the page as
   * having two titles.
   */
  it('never emits an h1 or h2 from an assistant answer', () => {
    const { container } = render(<AssistantMessage text={'# Big\n\n## Smaller\n\nbody'} />);

    expect(container.querySelector('h1')).toBeNull();
    expect(container.querySelector('h2')).toBeNull();
    expect(container.querySelectorAll('h3').length).toBeGreaterThan(0);
    expect(container.textContent).toContain('Big');
  });

  /**
   * ⚠ AN EXTERNAL LINK IN AN ASSISTANT'S ANSWER CAN COME FROM THE OPEN WEB (a
   * research citation), and `target=_blank` without `noopener` hands that page a
   * handle on this one.
   */
  it('opens external links safely and leaves internal ones alone', () => {
    const { container } = render(
      <AssistantMessage text={'[out](https://canada.ca) and [in](/admin/cases)'} />,
    );

    const [external, internal] = Array.from(container.querySelectorAll('a'));

    expect(external?.getAttribute('target')).toBe('_blank');
    expect(external?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(internal?.getAttribute('target')).toBeNull();
  });

  /**
   * ⚠ IMAGES ARE DROPPED DELIBERATELY. A Markdown image whose URL came from the
   * open web makes the viewer's browser fetch a third-party resource, leaking
   * that they read this answer to whoever wrote the page it was found on. The
   * alt text survives so nothing silently disappears.
   */
  it('does not fetch an image from an answer', () => {
    const { container } = render(<AssistantMessage text={'![a passport](https://elsewhere.test/x.png)'} />);

    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('a passport');
  });

  it('takes the product palette rather than imposing one', () => {
    const { container } = render(
      <AssistantMessage text={'[x](https://canada.ca)'} theme={{ link: 'product-link-class' }} />,
    );

    expect(container.querySelector('a')?.className).toBe('product-link-class');
  });

  /**
   * ⚠ BETWEEN "OPEN" AND THE FIRST TOKEN THERE IS NO TEXT, and rendering
   * nothing makes the panel look as though the turn finished instantly with no
   * answer.
   */
  it('shows a cursor while there is nothing to show yet', () => {
    const { container } = render(<AssistantMessage text="" streaming />);

    expect(container.textContent).toContain('writing');
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('drops the cursor once the answer is finished', () => {
    const { container } = render(<AssistantMessage text="Done." />);

    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it('distinguishes inline code from a fenced block', () => {
    const { container } = render(
      <AssistantMessage
        text={'Use `artisan` to run it.\n\n```php\necho 1;\n```'}
        theme={{ code: 'inline-code', codeBlock: 'block-code' }}
      />,
    );

    const classes = Array.from(container.querySelectorAll('code')).map((c) => c.className);

    expect(classes).toContain('inline-code');
    expect(classes.some((c) => c === 'block-code')).toBe(true);
  });
});
