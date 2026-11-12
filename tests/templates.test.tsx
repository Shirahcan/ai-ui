import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { TemplatePicker } from '../src/console/TemplatePicker';
import { blankTemplate, normaliseTemplate, templateSaveBody, upsertTemplate } from '../src/console/templateTypes';
import { AssistantTerminal, type AssistantTerminalProps } from '../src/terminal/AssistantTerminal';
import { templateFromArg } from '../src/terminal/commands';
import type { TerminalMode, TerminalTurn } from '../src/terminal/types';

/**
 * Templates (1.56.0, owner 2026-11-12): formats inside a guide ("Story", "How-to guide" under "Blog post"). The
 * console shows which one applies beside the guide, `/template` switches it, a new page's composer starts from its
 * starter, and products mount the picker where a page is created.
 */
const templates = [
  { key: 'quick-answer', name: 'Quick answer', group: 'Answer and explain', use_when: 'One question.', example_titles: ['Can I work while my PGWP is processing?'], starter: 'Answer [the question].' },
  { key: 'story', name: 'Story', group: 'Tell a story', use_when: 'One journey, told in order.', example_titles: [], starter: 'Write the story of [who].' },
];

function Harness(overrides: Partial<AssistantTerminalProps> & { initialTurns?: TerminalTurn[] } = {}) {
  const [value, setValue] = useState('');
  const [mode, setMode] = useState<TerminalMode>('build');
  const { initialTurns = [], ...rest } = overrides;

  return (
    <AssistantTerminal
      open
      onClose={() => {}}
      assistantName="Porter"
      subjectLabel="A new post"
      session={null}
      turns={initialTurns}
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
      specialization={{ key: 'blog-post', name: 'Blog post', source: 'page' }}
      specializations={[{ key: 'blog-post', name: 'Blog post' }]}
      onSpecializationChange={() => {}}
      templates={templates}
      {...rest}
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

describe('the template helpers', () => {
  it('reads /template words as a choice', () => {
    expect(templateFromArg('story', templates)).toBe('story');
    expect(templateFromArg('Quick answer', templates)).toBe('quick-answer');
    expect(templateFromArg('none', templates)).toBe('none');
    expect(templateFromArg('auto', templates)).toBeNull();
    expect(templateFromArg('made up', templates)).toBeUndefined();
  });

  it('sends only what the template sets and keeps the guide for what it leaves out', () => {
    const form = {
      ...blankTemplate('blog-post'),
      name: ' Story ',
      example_titles: ['One', ' ', 'Two'],
      sections: [{ key: '', name: 'The moment', purpose: '', required: true, look_for: [' moment '], look: ' A scene. ' }, { key: '', name: ' ', purpose: '', required: false, look_for: [], look: '' }],
      checks: { min_words: 600 },
      field_rules: { title: ' A plain title. ', answer: '  ' },
      asks: [{ question: 'Whose story?', required: true, options: ['', 'A client'] }],
    };
    const body = templateSaveBody(form);
    expect(body.name).toBe('Story');
    expect(body.example_titles).toEqual(['One', 'Two']);
    expect(body.sections).toEqual([{ name: 'The moment', purpose: null, required: true, look: 'A scene.', look_for: ['moment'] }]);
    expect(body.checks).toEqual({ min_words: 600 });
    expect(body.field_rules).toEqual({ title: 'A plain title.' });
    expect(body.data).toBeNull();
    expect(body.asks).toEqual([{ question: 'Whose story?', required: true, options: ['A client'] }]);
  });

  it('normalises an older row and keeps the picker order on save', () => {
    const t = normaliseTemplate({ key: 'story', guide: 'blog-post', name: 'Story', checks: [] as unknown as Record<string, never>, position: 2 });
    expect(t.design).toEqual({ layout: '', signature: '', imagery: '' });
    expect(t.checks).toEqual({});
    const list = upsertTemplate([{ ...t }, { ...blankTemplate('blog-post'), key: 'how-to', name: 'How-to guide', position: 1 }], { ...t, name: 'Story v2' });
    expect(list.map((x) => x.key)).toEqual(['how-to', 'story']);
  });
});

describe('the console', () => {
  it('names the template beside the guide on the chip', () => {
    render(<Harness template={{ key: 'story', name: 'Story', source: 'person' }} templateChoice="story" onTemplateChange={() => {}} />);
    const chip = screen.getByRole('button', { name: 'Blog post · Story' });
    expect(chip.getAttribute('title')).toContain('You chose it for this page.');
  });

  it('shows no template words when the host offers none', () => {
    render(<Harness template={{ key: 'story', name: 'Story', source: 'person' }} />);
    expect(screen.getByRole('button', { name: 'Blog post' })).toBeTruthy();
    send('/template story');
    // Not offered: the command is not a command here, so nothing is chosen and no view opens.
    expect(screen.queryByText('Let Porter pick')).toBeNull();
  });

  it('switches with /template and opens the grouped picker bare', () => {
    const onTemplateChange = vi.fn();
    render(<Harness onTemplateChange={onTemplateChange} />);
    send('/template story');
    expect(onTemplateChange).toHaveBeenCalledWith('story');
    send('/template none');
    expect(onTemplateChange).toHaveBeenLastCalledWith('none');

    send('/template');
    expect(screen.getByText('Let Porter pick')).toBeTruthy();
    expect(screen.getByText('Answer and explain')).toBeTruthy();
    expect(screen.getByText('Tell a story')).toBeTruthy();
    fireEvent.click(screen.getByText('Quick answer'));
    expect(onTemplateChange).toHaveBeenLastCalledWith('quick-answer');
  });

  it('puts the starter in an empty composer on a new page, once', () => {
    render(<Harness onTemplateChange={() => {}} starter="Write the story of [who]." />);
    expect(input().value).toBe('Write the story of [who].');
    fireEvent.change(input(), { target: { value: '' } });
    expect(input().value).toBe('');
  });

  it('never puts the starter over a session that has turns', () => {
    const turns: TerminalTurn[] = [{ id: 'a1', role: 'user', body: 'Write it', structured: null, rewound: false, at: null }];
    render(<Harness onTemplateChange={() => {}} starter="Write the story of [who]." initialTurns={turns} />);
    expect(input().value).toBe('');
  });
});

describe('the picker', () => {
  function Picker() {
    const [value, setValue] = useState<string | null>(null);
    return <TemplatePicker options={templates} value={value} onChange={setValue} assistantName="Porter" subjectNoun="post" label="What kind of post?" />;
  }

  it('offers Porter deciding first, then the groups, and moves with the arrow keys', () => {
    render(<Picker />);
    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => r.textContent?.split('.')[0])).toEqual(expect.arrayContaining([expect.stringContaining('Let Porter decide')]));
    expect(radios[0]?.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('Answer and explain')).toBeTruthy();

    fireEvent.keyDown(screen.getByRole('radiogroup', { name: 'What kind of post?' }), { key: 'ArrowDown' });
    expect(screen.getAllByRole('radio')[1]?.getAttribute('aria-checked')).toBe('true');

    fireEvent.click(screen.getByText('Story'));
    expect(screen.getAllByRole('radio')[2]?.getAttribute('aria-checked')).toBe('true');
  });
});
