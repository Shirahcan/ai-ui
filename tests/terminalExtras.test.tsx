import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { PendingAttachmentChips, useComposerAttachments } from '../src/components/ComposerAttachments';
import { AssistantTerminal, type AssistantTerminalProps } from '../src/terminal/AssistantTerminal';
import { expandSavedCommand, savedNameProblem, type TerminalSavedCommand } from '../src/terminal/commands';
import type { TerminalMode, TerminalTurn } from '../src/terminal/types';

/**
 * The console's 1.53.0 additions (owner 2026-11-09: "proceed with ... your 5 improvements suggestions").
 *
 * ⚠ WHAT THIS GUARDS: "Changed N elements" opens into the elements and each one is a button the host
 * answers; a removed one is not; /cost reads the host and names levels; a saved command is listed, sent
 * as its ask with the words typed after it, never shadows a built-in, and /save opens the editor with the
 * last ask; Compare is offered only under a Build made from a picture and only when the host can run it;
 * a picture on the composer shows its own thumbnail and the URL is revoked when it leaves.
 */
const turns = (files: string[] = []): TerminalTurn[] => [
  { id: 'a1', role: 'user', body: 'Mirror this design', structured: files.length ? { files } : null, rewound: false, at: null },
  {
    id: 'b1',
    role: 'assistant',
    body: 'I mirrored it.',
    structured: {
      steps: [{ kind: 'write', text: 'Writing the hero' }],
      outcome: {
        changed: true,
        elements: 4,
        changes: [
          { uid: 'h1', label: 'heading “Pricing”', how: 'changed' },
          { uid: 'b9', label: 'button “Book a call”', how: 'added' },
          { uid: 'x1', label: 'logo row', how: 'removed' },
        ],
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
      subjectLabel="Home page"
      session={{ id: 's1', title: 'Mirror', started_at: null, last_at: null, turns: 2, summary: null }}
      turns={turns()}
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

describe('what changed', () => {
  it('folds the elements under the outcome and opens them on a click', () => {
    render(<Harness />);

    expect(screen.queryByRole('list', { name: 'What changed' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Changed 4 elements/ }));

    const list = screen.getByRole('list', { name: 'What changed' });

    expect(list.textContent).toContain('Changed the heading “Pricing”');
    expect(list.textContent).toContain('Added the button “Book a call”');
    expect(list.textContent).toContain('Removed the logo row');
    expect(list.textContent).toContain('and 1 more');
  });

  it('makes each element still there a button the host answers, and a removed one plain words', () => {
    const onElement = vi.fn();

    render(<Harness onElement={onElement} />);
    fireEvent.click(screen.getByRole('button', { name: /Changed 4 elements/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Added the button “Book a call”' }));

    expect(onElement).toHaveBeenCalledWith('b9');
    expect(screen.queryByRole('button', { name: 'Removed the logo row' })).toBeNull();
  });

  it('draws plain words when the host cannot show an element', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /Changed 4 elements/ }));

    expect(screen.queryByRole('button', { name: /Changed the heading/ })).toBeNull();
  });
});

describe('/cost', () => {
  it('is offered only when the host can read the cost, and names levels', async () => {
    const onUsage = vi.fn().mockResolvedValue({
      levels: [
        { level: 'normal', calls: 3, tokens_in: 12000, tokens_out: 900, cost_usd: 0 },
        { level: 'pro', calls: 1, tokens_in: 8000, tokens_out: 1200, cost_usd: 0.0421 },
      ],
      total: { calls: 4, tokens_in: 20000, tokens_out: 2100, cost_usd: 0.0421 },
    });

    render(<Harness onUsage={onUsage} />);
    send('/cost');

    await waitFor(() => expect(screen.getByRole('region', { name: 'Session cost' }).textContent).toContain('Pro'));
    const view = screen.getByRole('region', { name: 'Session cost' }).textContent ?? '';

    expect(view).toContain('Normal');
    expect(view).toContain('$0.04');
    expect(view).not.toMatch(/sonnet|opus|claude/i);
  });

  it('says so when the cost cannot be read', async () => {
    render(<Harness onUsage={() => Promise.resolve(null)} />);
    send('/cost');

    expect(await screen.findByText(/cannot be read right now/)).toBeTruthy();
  });

  it('is not a command without the host', () => {
    const onAsk = vi.fn();

    render(<Harness onAsk={onAsk} />);
    send('/cost');

    expect(screen.queryByRole('region', { name: 'Session cost' })).toBeNull();
  });
});

describe('saved asks', () => {
  const saved: TerminalSavedCommand[] = [{ name: 'seo-pass', ask: 'Check every heading for search.', description: 'Search pass' }];

  it('sends the saved ask, with the words typed after its name', () => {
    const onAsk = vi.fn();

    render(<Harness onAsk={onAsk} savedCommands={saved} onSavedCommandsChange={() => {}} />);
    send('/seo-pass on the blog posts');

    expect(onAsk).toHaveBeenCalledWith('Check every heading for search.\n\non the blog posts', [], 'typed');
  });

  it('never shadows a built-in, and names must be plain', () => {
    expect(expandSavedCommand('/clear', [{ name: 'clear', ask: 'x' }])).toBeNull();
    expect(savedNameProblem('clear', [])).toMatch(/already a command/);
    expect(savedNameProblem('SEO pass', [])).toMatch(/lower-case/);
    expect(savedNameProblem('seo-pass', saved)).toMatch(/already have/);
    expect(savedNameProblem('seo-pass', saved, 'seo-pass')).toBeNull();
  });

  it('/save opens the editor with the last ask under that name, and saving hands the host the list', () => {
    const onSavedCommandsChange = vi.fn();

    render(<Harness history={['Tighten every hero headline']} savedCommands={saved} onSavedCommandsChange={onSavedCommandsChange} />);
    send('/save hero-pass');

    expect((screen.getByLabelText('Name (typed after /)') as HTMLInputElement).value).toBe('hero-pass');
    expect((screen.getByLabelText('The ask it sends') as HTMLTextAreaElement).value).toBe('Tighten every hero headline');
    fireEvent.click(screen.getByRole('button', { name: 'Add command' }));

    expect(onSavedCommandsChange).toHaveBeenCalledWith([...saved, { name: 'hero-pass', ask: 'Tighten every hero headline', description: null }]);
  });

  it('deletes a command from the list', () => {
    const onSavedCommandsChange = vi.fn();

    render(<Harness savedCommands={saved} onSavedCommandsChange={onSavedCommandsChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Your commands' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete /seo-pass' }));

    expect(onSavedCommandsChange).toHaveBeenCalledWith([]);
  });
});

describe('compare with the picture', () => {
  it('is offered under a Build made from a picture, when the host can run it', () => {
    const onCompare = vi.fn();

    render(<Harness turns={turns(['design_linear.png'])} onCompare={onCompare} />);
    fireEvent.click(screen.getByRole('button', { name: 'Compare with the picture' }));

    expect(onCompare).toHaveBeenCalledTimes(1);
  });

  it('is not offered for a Build without a picture, nor without the host', () => {
    const { unmount } = render(<Harness turns={turns(['brief.pdf'])} onCompare={() => {}} />);

    expect(screen.queryByRole('button', { name: 'Compare with the picture' })).toBeNull();
    unmount();
    render(<Harness turns={turns(['design.png'])} />);
    expect(screen.queryByRole('button', { name: 'Compare with the picture' })).toBeNull();
  });
});

describe('a failed answer offers a higher level and more thought', () => {
  const failed = (effort: 'low' | 'medium' | 'high'): TerminalTurn[] => [
    { id: 'a1', role: 'user', body: 'Mirror this', structured: null, rewound: false, at: null },
    { id: 'b1', role: 'assistant', body: null, structured: { level: 'normal', effort, outcome: { changed: false, reason: 'The draft still had something this page cannot hold.' } }, rewound: false, at: null },
  ];

  it('offers Try again at Pro and Think harder, each handed to the host', () => {
    const onRetry = vi.fn();

    render(<Harness turns={failed('low')} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again at Pro' }));
    fireEvent.click(screen.getByRole('button', { name: 'Think harder' }));

    expect(onRetry).toHaveBeenNthCalledWith(1, 'a1', 'pro');
    expect(onRetry).toHaveBeenNthCalledWith(2, 'a1', 'normal', 'medium');
  });

  it('stops offering more thought at high effort', () => {
    render(<Harness turns={failed('high')} onRetry={() => {}} />);

    expect(screen.queryByRole('button', { name: 'Think harder' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Try again at Pro' })).toBeTruthy();
  });
});

describe('picture thumbnails', () => {
  function Chips({ onReady }: { onReady: (api: ReturnType<typeof useComposerAttachments>) => void }) {
    const api = useComposerAttachments({ accept: ['image/png', 'application/pdf'], maxBytes: 5_000_000, maxFiles: 3, onUpload: (file) => Promise.resolve({ id: file.name, name: file.name, mime: file.type, size: file.size }) });

    onReady(api);

    return <PendingAttachmentChips items={api.items} onRemove={api.remove} />;
  }

  it('shows a picture its own thumbnail, keeps the icon for a document, and revokes the URL on remove', async () => {
    const create = vi.fn(() => 'blob:thumb');
    const revoke = vi.fn();

    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });

    let api: ReturnType<typeof useComposerAttachments> | null = null;
    const { container } = render(<Chips onReady={(a) => (api = a)} />);

    act(() => api?.add([new File(['x'], 'shot.png', { type: 'image/png' }), new File(['y'], 'brief.pdf', { type: 'application/pdf' })]));
    await waitFor(() => expect(container.querySelectorAll('img').length).toBe(1));

    expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:thumb');
    expect(create).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Remove shot.png' }));
    expect(revoke).toHaveBeenCalledWith('blob:thumb');
  });
});
