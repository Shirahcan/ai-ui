import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProposalHtml, sanitizeProposalHtml } from '../src/terminal/ProposalHtml';

/**
 * A rich-text proposal field (1.61.0, owner 2026-11-14): Porter's proposed email is drawn as a document the way the
 * editor shows it, never as one run-on paragraph, and never with anything the model wrote that could run or style.
 */
describe('ProposalHtml', () => {
  it('keeps the editor\'s blocks: paragraphs, bold, links, note cards and fine print', () => {
    const html = '<p>Hi {{customer_name}},</p><p>We tried <strong>{{case_display_name}}</strong>.</p><aside><p>Reply with questions.</p></aside><p><small>Sent by Portify.</small></p><p><a href="{{retry_url}}">Retry</a></p>';

    const clean = sanitizeProposalHtml(html)!;

    expect(clean).toContain('<p>Hi {{customer_name}},</p>');
    expect(clean).toContain('<strong>{{case_display_name}}</strong>');
    expect(clean).toContain('<aside><p>Reply with questions.</p></aside>');
    expect(clean).toContain('<small>Sent by Portify.</small>');
    expect(clean).toContain('href="{{retry_url}}"');
  });

  it('drops what could run or restyle, and unwraps what it does not know', () => {
    const html = '<p onclick="steal()" style="color:red" class="x">Hi</p><script>steal()</script><a href="javascript:steal()">bad</a><div><span>kept words</span></div><img src="javascript:x"><iframe src="https://x"></iframe>';

    const clean = sanitizeProposalHtml(html)!;

    expect(clean).not.toMatch(/onclick|style=|class=|script|javascript|iframe|<div|<span|<img/);
    expect(clean).toContain('<p>Hi</p>');
    expect(clean).toContain('kept words');
    expect(clean).toContain('<a target="_blank" rel="noopener noreferrer">bad</a>');
  });

  it('keeps a real cell span and drops the editor\'s 1s', () => {
    const clean = sanitizeProposalHtml('<table><tbody><tr><td colspan="1" rowspan="1">a</td><td colspan="2">b</td></tr></tbody></table>')!;

    expect(clean).toContain('<td>a</td>');
    expect(clean).toContain('<td colspan="2">b</td>');
  });

  it('draws the field as a labelled document', () => {
    render(<ProposalHtml html="<h2>Your payment did not go through</h2><p>Try again.</p>" label="The email" />);

    const doc = screen.getByRole('document', { name: 'The email' });

    expect(doc.querySelector('h2')?.textContent).toBe('Your payment did not go through');
    expect(doc.querySelectorAll('p')).toHaveLength(1);
  });
});
