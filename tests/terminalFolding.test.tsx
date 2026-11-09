import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { AssistantTerminal, type AssistantTerminalProps } from '../src/terminal/AssistantTerminal';
import { foldText } from '../src/terminal/TerminalLines';
import { levelPhrase, nextLevel, recapLines, toLines } from '../src/terminal/transcript';
import type { TerminalLevel, TerminalMode, TerminalTurn } from '../src/terminal/types';

/**
 * The console, 1.45.0 (owner 2026-11-09): fold, never truncate; level and effort; questions with choices;
 * findings; brainstorm; a recap after a break.
 */

const ask = (id: string, body: string, structured: TerminalTurn['structured'] = null, rewound = false): TerminalTurn => ({ id, role: 'user', body, structured, rewound, at: null });
const answer = (id: string, structured: TerminalTurn['structured'], body: string | null = 'Done.', rewound = false): TerminalTurn => ({ id, role: 'assistant', body, structured, rewound, at: null });

describe('folding', () => {
  it('keeps thinking open while it streams and folds it the moment anything follows', () => {
    const think = { kind: 'think', text: 'Thinking', detail: 'They want a Q&A.' };
    const streaming = toLines([], { live: { startedAt: 1, ask: { text: 'Add a Q&A' }, steps: [{ kind: 'read', text: 'Reading the page' }, think], verb: null, queued: null } });
    const followed = toLines([], { live: { startedAt: 1, ask: { text: 'Add a Q&A' }, steps: [think, { kind: 'write', text: 'Writing the FAQ' }], verb: null, queued: null } });

    expect(streaming.at(-1)).toMatchObject({ kind: 'thinking', live: true, open: true });
    expect(followed.find((l) => l.kind === 'thinking')).toMatchObject({ live: false, open: false });
    expect(toLines([], { expanded: true, live: { startedAt: 1, ask: null, steps: [think, { kind: 'write', text: 'x' }], verb: null, queued: null } }).find((l) => l.kind === 'thinking')).toMatchObject({ open: true });
  });

  it('shows the first lines of a long text and says how many are folded', () => {
    const text = Array.from({ length: 12 }, (_, i) => `Line ${i + 1}`).join('\n');
    const fold = foldText(text, 8);

    expect(fold.head.split('\n')).toHaveLength(8);
    expect(fold.hidden).toBe(4);
    expect(foldText('Short.', 8)).toEqual({ head: 'Short.', hidden: 0 });
    expect(foldText('word '.repeat(400), 3).head.endsWith('…')).toBe(true);
  });
});

describe('levels', () => {
  it('names the level that answered, never the model', () => {
    expect(levelPhrase('expert', 'expert')).toBe('by Expert');
    expect(levelPhrase('expert', 'pro')).toBe('Expert unavailable, Pro answered');
    expect(levelPhrase('pro', 'normal')).toBe('Pro unavailable, Normal answered');
    expect(levelPhrase('normal', 'normal')).toBeNull();
    expect(levelPhrase(null, null)).toBeNull();
  });

  it('offers the next level only on the last failed answer', () => {
    const failed = (level: TerminalLevel | null) => [ask('a1', 'Rebuild the page'), answer('b1', { level, outcome: { changed: false, reason: 'The page check failed twice.' } }, null)];

    expect(toLines(failed(null)).at(-1)).toMatchObject({ kind: 'outcome', retry: 'pro' });
    expect(toLines(failed('pro')).at(-1)).toMatchObject({ retry: 'expert' });
    expect(toLines(failed('expert')).at(-1)).toMatchObject({ retry: null });
    expect(toLines([...failed(null), ask('a2', 'Something else'), answer('b2', { outcome: { changed: true } })]).find((l) => l.kind === 'outcome')).toMatchObject({ retry: null });
    expect(nextLevel('expert')).toBeNull();
  });
});

describe('findings, questions and ideas', () => {
  it('lists findings under the reply and makes only suggestions actionable', () => {
    const lines = toLines([ask('a1', 'Add a FAQ'), answer('b1', { outcome: { changed: true }, findings: [{ kind: 'gap', text: 'No contact link.' }, { kind: 'suggestion', text: 'Add a contact button.' }] })]);

    expect(lines.filter((l) => l.kind === 'finding').map((l) => (l as { findingKind: string }).findingKind)).toEqual(['gap', 'suggestion']);
    expect(lines.map((l) => l.kind)).toEqual(['ask', 'reply', 'finding', 'finding', 'outcome']);
  });

  it('draws a question instead of an outcome, answerable only while it is the last thing said', () => {
    const q = answer('b1', { questions: [{ text: 'Which tone?', options: [{ label: 'Warm' }, { label: 'Formal' }] }] }, 'One question first.');

    expect(toLines([ask('a1', 'Write the about page'), q]).at(-1)).toMatchObject({ kind: 'question', answerable: true, answers: [] });
    const answered = toLines([ask('a1', 'x'), q, ask('a2', 'Answers', { answers: [{ question: 'Which tone?', answer: 'Warm' }] })]);
    expect(answered.find((l) => l.kind === 'question')).toMatchObject({ answerable: false, answers: [{ question: 'Which tone?', answer: 'Warm' }] });
  });

  it('draws a brainstorm as ideas and a recommendation, with no outcome', () => {
    const lines = toLines([ask('a1', 'How should the pricing page work?', { mode: 'brainstorm' }), answer('b1', { mode: 'brainstorm', ideas: [{ title: 'Three tiers', why: 'Easy to compare.' }], recommendation: 'Three tiers with a comparison table.' })]);

    expect(lines[0]).toMatchObject({ chips: ['brainstorm'] });
    expect(lines.at(-1)).toMatchObject({ kind: 'ideas', open: true, recommendation: 'Three tiers with a comparison table.' });
    const atPro = toLines([ask('a1', 'x', { mode: 'brainstorm' }), answer('b1', { mode: 'brainstorm', level: 'pro', served_level: 'pro', ideas: [{ title: 'One' }] })]);
    expect(atPro.at(-1)).toMatchObject({ kind: 'ideas', level: 'by Pro' });
    expect(lines.some((l) => l.kind === 'outcome')).toBe(false);
  });
});

describe('recap', () => {
  it('says where the session stands, from the turns alone', () => {
    const turns = [
      ask('a1', 'Add a FAQ'), answer('b1', { outcome: { changed: true } }),
      ask('a2', 'Rebuild the whole page from vanhack.com'), answer('b2', { outcome: { changed: false, reason: 'The site refused the visit.' } }, null),
    ];
    const lines = recapLines(turns, { assistant: 'Porter', subject: 'page' });

    expect(lines[0]).toBe('2 asks in this session: 1 changed the page, 1 could not finish.');
    expect(lines[1]).toContain('could not finish: The site refused the visit.');
    expect(lines[2]).toMatch(/try again at a higher level/i);
    expect(recapLines([], { assistant: 'Porter', subject: 'page' })).toEqual([]);
    // The assistant's name keeps its capital mid-sentence.
    const ideas = recapLines([ask('a1', 'Ideas?', { mode: 'brainstorm' }), answer('b1', { ideas: [{ title: 'One' }], recommendation: 'Do one.' })], { assistant: 'Porter', subject: 'page' });
    expect(ideas[1]).toContain(', Porter offered ideas.');
  });
});

function Harness(overrides: Partial<AssistantTerminalProps> = {}) {
  const [value, setValue] = useState('');
  const [mode, setMode] = useState<TerminalMode>('build');
  const [level, setLevel] = useState<TerminalLevel>('normal');

  return (
    <AssistantTerminal
      open
      onClose={() => {}}
      assistantName="Porter"
      subjectLabel="Home page"
      session={{ id: 's1', title: 'x', started_at: null, last_at: null, turns: 2, summary: null }}
      turns={[]}
      mode={mode}
      onModeChange={setMode}
      modes={['build', 'plan', 'brainstorm']}
      level={level}
      onLevelChange={setLevel}
      effort="low"
      onEffortChange={() => {}}
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

describe('AssistantTerminal 1.45', () => {
  it('sets the level with /level and shows it in the status line', () => {
    render(<Harness />);

    fireEvent.change(input(), { target: { value: '/level expert' } });
    fireEvent.keyDown(input(), { key: 'Enter' });

    expect(screen.getByRole('button', { name: /expert · low effort/i })).toBeTruthy();
  });

  it('cycles build, plan first and brainstorm with Alt+M', () => {
    render(<Harness />);

    fireEvent.keyDown(input(), { key: 'm', altKey: true });
    fireEvent.keyDown(input(), { key: 'm', altKey: true });

    expect(screen.getByText('◇ brainstorm')).toBeTruthy();
  });

  const oneQuestion = () => [ask('a1', 'Write the about page'), answer('b1', { questions: [{ text: 'Which tone?', options: [{ label: 'Warm', description: 'Friendly' }, { label: 'Formal' }] }] }, 'One question first.')];

  it('asks over the composer, and one pick to one question sends it (Claude Code)', () => {
    const onAnswer = vi.fn();

    render(<Harness turns={oneQuestion()} onAnswer={onAnswer} />);

    // The questions take the composer's place; the transcript only says where to answer.
    expect(screen.queryByRole('textbox', { name: /describe what you want/i })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'A question to answer' })).toBeTruthy();
    expect(screen.getByText('⎿ Waiting for your answer below.')).toBeTruthy();
    // It takes the focus too, so the keys work at once.
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: /warm/i }));

    fireEvent.click(screen.getByRole('radio', { name: /warm/i }));
    expect(onAnswer).toHaveBeenCalledWith('b1', [{ question: 'Which tone?', answer: 'Warm' }]);
  });

  it('picks by number, moves with the arrows, and takes a typed answer', () => {
    const onAnswer = vi.fn();

    render(<Harness turns={oneQuestion()} onAnswer={onAnswer} />);

    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: /formal/i }));
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowDown' });
    const typed = screen.getByRole('textbox', { name: 'Type something else' });
    expect(document.activeElement).toBe(typed);

    // A digit typed in the box is text, not a pick.
    fireEvent.keyDown(typed, { key: '2' });
    expect(onAnswer).not.toHaveBeenCalled();
    fireEvent.change(typed, { target: { value: 'Plain and direct' } });
    fireEvent.keyDown(typed, { key: 'Enter' });
    expect(onAnswer).toHaveBeenCalledWith('b1', [{ question: 'Which tone?', answer: 'Plain and direct' }]);

    onAnswer.mockClear();
    fireEvent.keyDown(screen.getByRole('radio', { name: /warm/i }), { key: '2' });
    expect(onAnswer).toHaveBeenCalledWith('b1', [{ question: 'Which tone?', answer: 'Formal' }]);
  });

  it('"Chat about this" brings the composer back with the draft, and the transcript offers the way back', () => {
    const onAnswer = vi.fn();

    render(<Harness turns={oneQuestion()} onAnswer={onAnswer} value="half a thought" onChange={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /chat about this/i }));

    expect(screen.queryByRole('dialog', { name: 'A question to answer' })).toBeNull();
    expect(input().value).toBe('half a thought');
    expect(screen.getByText(/set aside to chat about it/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Answer it now' }));
    expect(screen.getByRole('dialog', { name: 'A question to answer' })).toBeTruthy();
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('Esc sets the questions aside, and never reaches the console (no stop, no rewind)', () => {
    const onStop = vi.fn();

    render(<Harness turns={oneQuestion()} onAnswer={vi.fn()} onStop={onStop} />);

    fireEvent.keyDown(screen.getByRole('radio', { name: /warm/i }), { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'A question to answer' })).toBeNull();
    expect(input()).toBeTruthy();
    expect(onStop).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: /rewind/i })).toBeNull();
  });

  it('a question arriving never pulls the cursor out of the page', () => {
    const outside = document.createElement('input');
    document.body.appendChild(outside);

    const { rerender } = render(<Harness turns={[ask('a1', 'Write it')]} onAnswer={vi.fn()} />);
    outside.focus();
    rerender(<Harness turns={oneQuestion()} onAnswer={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: 'A question to answer' })).toBeTruthy();
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it('gives the composer back once answered, and while a run is going', () => {
    const answered = [...oneQuestion(), ask('a2', 'Answers', { answers: [{ question: 'Which tone?', answer: 'Warm' }] })];
    const { rerender } = render(<Harness turns={answered} onAnswer={vi.fn()} />);

    expect(screen.queryByRole('dialog', { name: 'A question to answer' })).toBeNull();
    expect(screen.getAllByText('Warm').length).toBeGreaterThan(0);
    expect(input()).toBeTruthy();

    rerender(<Harness turns={oneQuestion()} onAnswer={vi.fn()} live={{ startedAt: 1, ask: { text: 'x' }, steps: [], verb: 'Thinking', queued: null }} />);
    expect(screen.queryByRole('dialog', { name: 'A question to answer' })).toBeNull();
  });

  it('lets several choices be picked when a question allows it', () => {
    const onAnswer = vi.fn();
    const turns = [ask('a1', 'x'), answer('b1', { questions: [{ text: 'Which sections?', multi: true, options: [{ label: 'FAQ' }, { label: 'Team' }, { label: 'Pricing' }] }] }, 'One.')];

    render(<Harness turns={turns} onAnswer={onAnswer} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'FAQ' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Pricing' }));
    expect(onAnswer).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onAnswer).toHaveBeenCalledWith('b1', [{ question: 'Which sections?', answer: 'FAQ, Pricing' }]);
  });

  it('shows the recommended choice, from the flag or a "(Recommended)" label', () => {
    const turns = [ask('a1', 'Write it'), answer('b1', { questions: [{ text: 'Which tone?', options: [{ label: 'Warm (Recommended)' }, { label: 'Formal', recommended: false }] }] }, 'One question.')];

    render(<Harness turns={turns} onAnswer={vi.fn()} />);

    // The number and the circle are hidden from screen readers: the name is the label and the badge.
    expect(screen.getByRole('radio', { name: /^Warm\s*Recommended$/ })).toBeTruthy();
    expect(screen.queryByText('Warm (Recommended)')).toBeNull();
  });

  it('draws several questions as tabs with a summary tab last, and sends them all from it', () => {
    const onAnswer = vi.fn();
    const turns = [
      ask('a1', 'Write the about page'),
      answer('b1', {
        questions: [
          { text: 'Which tone?', header: 'Tone', options: [{ label: 'Warm', recommended: true }, { label: 'Formal' }] },
          { text: 'Who reads it?', header: 'Audience', options: [{ label: 'Employers' }, { label: 'Clients' }] },
        ],
      }, 'Two questions first.'),
    ];

    render(<Harness turns={turns} onAnswer={onAnswer} />);

    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['○ Tone', '○ Audience', '· Submit']);
    fireEvent.click(screen.getByRole('radio', { name: /warm/i }));
    // A pick moves on to the next tab.
    expect(screen.getByRole('tab', { name: /audience/i }).getAttribute('aria-selected')).toBe('true');
    // Focus follows into the new tab, so the keys keep working: 1 picks the first choice there.
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: /employers/i }));
    fireEvent.keyDown(document.activeElement as Element, { key: '1' });
    expect(screen.getByText('Review your answers')).toBeTruthy();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['✓ Tone', '✓ Audience', '✔ Submit']);

    fireEvent.click(screen.getByRole('button', { name: 'Send answers' }));
    expect(onAnswer).toHaveBeenCalledWith('b1', [{ question: 'Which tone?', answer: 'Warm' }, { question: 'Who reads it?', answer: 'Employers' }]);
  });

  it('keeps Send on the summary tab until every question has an answer', () => {
    const turns = [ask('a1', 'x'), answer('b1', { questions: [{ text: 'One?', options: [{ label: 'A' }] }, { text: 'Two?', options: [{ label: 'B' }] }] }, 'Two.')];

    render(<Harness turns={turns} onAnswer={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: /submit/i }));

    expect((screen.getByRole('button', { name: 'Send answers' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText('Not answered yet: answer it')).toHaveLength(2);
  });

  it('offers to try a failed ask again one level up', () => {
    const onRetry = vi.fn();
    const turns = [ask('a1', 'Rebuild it'), answer('b1', { outcome: { changed: false, reason: 'The check failed.' } }, null)];

    render(<Harness turns={turns} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again at Pro' }));

    expect(onRetry).toHaveBeenCalledWith('a1', 'pro');
  });

  it('shows a recap on /recap', () => {
    const turns = [ask('a1', 'Add a FAQ'), answer('b1', { outcome: { changed: true } })];

    render(<Harness turns={turns} />);
    fireEvent.change(input(), { target: { value: '/recap' } });
    fireEvent.keyDown(input(), { key: 'Enter' });

    expect(screen.getByRole('note', { name: 'Recap' }).textContent).toContain('1 ask in this session: 1 changed the page.');
  });

  it('stops drawing a recap once the session moves on (a rewind, a new answer)', () => {
    const turns = [ask('a1', 'Add a FAQ'), answer('b1', { outcome: { changed: true } })];
    const { rerender } = render(<Harness turns={turns} />);

    fireEvent.change(input(), { target: { value: '/recap' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(screen.getByRole('note', { name: 'Recap' })).toBeTruthy();

    rerender(<Harness turns={turns.map((t) => ({ ...t, rewound: true }))} />);
    expect(screen.queryByRole('note', { name: 'Recap' })).toBeNull();
  });
});
