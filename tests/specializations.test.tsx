import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { upsertGuide } from '../src/console/AiSpecializations';
import { blankSpecialization, keyFromName, mergeDraft, moveSection, saveBody } from '../src/console/specializationTypes';
import { AssistantTerminal, type AssistantTerminalProps } from '../src/terminal/AssistantTerminal';
import { specializationFromArg } from '../src/terminal/commands';
import { toLines, toMarkdown } from '../src/terminal/transcript';
import type { TerminalMode, TerminalTurn } from '../src/terminal/types';

/**
 * Specializations (1.55.0, owner 2026-11-11): named guides for one kind of output (blog posts, landing
 * pages). The console shows which guide applies and why, lets the person switch it per subject, and draws
 * the fields the assistant drafted for the page's record with Apply and Dismiss. The editor's helpers keep
 * a draft from overwriting the form's key and never send the server's own fields.
 */
const options = [
  { key: 'blog-post', name: 'Blog post', use_when: 'An article that answers one question.' },
  { key: 'landing-page', name: 'Landing page', use_when: 'One offer, one action.' },
];

const turns: TerminalTurn[] = [
  { id: 'a1', role: 'user', body: 'Write the post about study permits', structured: null, rewound: false, at: null },
  {
    id: 'b1',
    role: 'assistant',
    body: 'I wrote the post.',
    structured: {
      outcome: {
        changed: true,
        elements: 6,
        proposal: { title: 'Suggested for the blog post', fields: [{ key: 'answer', label: 'Answer', value: 'Most study permits take 8 to 12 weeks.' }] },
      },
    },
    rewound: false,
    at: null,
  },
];

function Harness(overrides: Partial<AssistantTerminalProps> = {}) {
  const [value, setValue] = useState('');
  const [mode, setMode] = useState<TerminalMode>('build');

  return (
    <AssistantTerminal
      open
      onClose={() => {}}
      assistantName="Porter"
      subjectLabel="Study permits"
      session={{ id: 's1', title: 'Post', started_at: null, last_at: null, turns: 2, summary: null }}
      turns={turns}
      mode={mode}
      onModeChange={setMode}
      value={value}
      onChange={setValue}
      onAsk={() => {}}
      onStop={() => {}}
      onCommand={() => {}}
      onRewind={() => {}}
      onSaveBrief={() => {}}
      theme="dark"
      onThemeChange={() => {}}
      {...overrides}
    />
  );
}

beforeAll(() => {
  Element.prototype.scrollTo = vi.fn() as unknown as typeof Element.prototype.scrollTo;
});

const input = () => screen.getByRole('textbox', { name: /describe what you want/i }) as HTMLTextAreaElement;
const send = (text: string) => {
  fireEvent.change(input(), { target: { value: text } });
  fireEvent.keyDown(input(), { key: 'Enter' });
};

describe('the editor helpers', () => {
  it('derives a key from the name and moves sections within bounds', () => {
    expect(keyFromName('Blog post')).toBe('blog-post');
    expect(keyFromName('2026 Case Study!')).toBe('case-study');
    expect(keyFromName('x')).toBe('');
    expect(moveSection(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveSection(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
  });

  it('lays a draft over the form without its key or status, and saves only the guide', () => {
    const form = { ...blankSpecialization(), key: 'blog-post', status: 'paused' as const, version: 3 };
    const merged = mergeDraft(form, { name: 'Blog post', sections: [{ key: 'answer', name: 'The answer', purpose: '', required: true, look_for: [] }] });
    expect(merged.key).toBe('blog-post');
    expect(merged.status).toBe('paused');
    expect(merged.sections).toHaveLength(1);

    const body = saveBody({ ...merged, sections: [...merged.sections, { key: '', name: '  ', purpose: '', required: false, look_for: [] }] });
    expect(body).not.toHaveProperty('version');
    expect(body).not.toHaveProperty('key');
    expect(body.sections).toHaveLength(1);
  });
});

describe('the list after a save', () => {
  it('draws the saved guide at once, replacing it by key and keeping name order', () => {
    const a = { ...blankSpecialization(), key: 'landing-page', name: 'Landing page' };
    const b = { ...blankSpecialization(), key: 'blog-post', name: 'Blog post', version: 1 };
    const listed = upsertGuide([a, b], { ...b, version: 2 });
    expect(listed.map((g) => [g.key, g.version])).toEqual([['blog-post', 2], ['landing-page', 0]]);
    expect(upsertGuide([a], { ...blankSpecialization(), key: 'case-study', name: 'Case study' }).map((g) => g.key)).toEqual(['case-study', 'landing-page']);
  });
});

describe('the console', () => {
  it('reads /specialize words as a choice', () => {
    expect(specializationFromArg('none', options)).toBe('none');
    expect(specializationFromArg('auto', options)).toBeNull();
    expect(specializationFromArg('Landing page', options)).toBe('landing-page');
    expect(specializationFromArg('blog-post', options)).toBe('blog-post');
    expect(specializationFromArg('podcast', options)).toBeUndefined();
  });

  it('draws the drafted fields under the outcome, with what the person did', () => {
    const open = toLines(turns).find((l) => l.kind === 'proposal');
    expect(open).toMatchObject({ kind: 'proposal', turnId: 'b1', state: 'open', actionable: true });
    const applied = toLines(turns, { proposalState: () => 'applied' }).find((l) => l.kind === 'proposal');
    expect(applied).toMatchObject({ state: 'applied' });
    expect(toMarkdown('Post', toLines(turns))).toContain('Answer: Most study permits take 8 to 12 weeks.');
  });

  it('shows the guide and why, switches it from the picker and from /specialize, and offers nothing without a handler', () => {
    const change = vi.fn();
    const { unmount } = render(
      <Harness specialization={{ key: 'blog-post', name: 'Blog post', source: 'page' }} specializations={options} onSpecializationChange={change} manageSpecializationsHref="/admin/ai/specializations" />,
    );

    const chip = screen.getByRole('button', { name: 'Blog post' });
    expect(chip.getAttribute('title')).toMatch(/own kind decides/);
    fireEvent.click(chip);
    expect(screen.getByRole('link', { name: 'Manage specializations' }).getAttribute('href')).toBe('/admin/ai/specializations');
    fireEvent.click(screen.getByRole('button', { name: /^Landing page/ }));
    expect(change).toHaveBeenLastCalledWith('landing-page');

    send('/specialize none');
    expect(change).toHaveBeenLastCalledWith('none');
    send('/specialize auto');
    expect(change).toHaveBeenLastCalledWith(null);
    unmount();

    render(<Harness />);
    expect(screen.queryByRole('button', { name: 'Blog post' })).toBeNull();
  });

  it('applies or dismisses the drafted fields through the host', () => {
    const onProposal = vi.fn();
    render(<Harness onProposal={onProposal} />);
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onProposal).toHaveBeenCalledWith('b1', 'apply');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onProposal).toHaveBeenCalledWith('b1', 'dismiss');
  });
});
