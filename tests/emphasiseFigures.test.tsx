import { render } from '@testing-library/react';
import ReactMarkdown from 'react-markdown';
import { describe, expect, it } from 'vitest';
import { emphasiseFiguresInText } from '../src/emphasiseFigures';
import { assistantRemarkPlugins } from '../src/markdown';

/** Owner, 2026-11-02: answers kept arriving with every important figure in plain text. */
describe('emphasiseFigures', () => {
  it('bolds money, counts, dates, durations and percentages', () => {
    expect(emphasiseFiguresInText('4 completed payments never posted, totalling 14,597.48 CAD.')).toBe(
      '**4** completed payments never posted, totalling **14,597.48 CAD**.',
    );
    expect(emphasiseFiguresInText('Paid on Mon, Nov 2, 2026 at 10:33 PM WAT, 240 days late, 12.5% over.')).toBe(
      'Paid on **Mon, Nov 2, 2026 at 10:33 PM WAT**, **240 days** late, **12.5%** over.',
    );
    expect(emphasiseFiguresInText('Five checkouts at CAD 19.99 and one at $262.50.')).toBe(
      'Five checkouts at **CAD 19.99** and one at **$262.50**.',
    );
  });

  it('never touches identifiers, versions or a bare year', () => {
    const text = 'Case MKT-C1D7F472, form IMM5476, release v1.27.0, id 01a05567, in 2026.';
    expect(emphasiseFiguresInText(text)).toBe(text);
  });

  it('leaves what the model already bolded, links and code alone in rendered Markdown', () => {
    const { container } = render(
      <ReactMarkdown remarkPlugins={assistantRemarkPlugins}>
        {'**9** letters; see [case 12](https://x.test/12) and `3 items`; 18 payment records have no case.'}
      </ReactMarkdown>,
    );
    const strong = Array.from(container.querySelectorAll('strong')).map((s) => s.textContent);
    expect(strong).toEqual(['9', '18']);
    expect(container.querySelector('a')?.textContent).toBe('case 12');
    expect(container.querySelector('code')?.textContent).toBe('3 items');
  });
});
