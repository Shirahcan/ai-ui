import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AssistantChat } from '../src/components/AssistantChat';
import { Composer } from '../src/components/Composer';
import { MessageBubble } from '../src/components/MessageBubble';
import { acceptsFile, withoutAttachedLine, type ComposerAttachmentsConfig } from '../src/components/ComposerAttachments';
import type { AssistantTheme } from '../src/theme';
import type { AttachmentChip } from '../src/types';

/**
 * Files on a message (1.29.0): the paperclip only appears for a product that passes a handler,
 * refusals happen before any upload, Send waits for uploads, and the person's bubble shows names.
 */
const THEME: AssistantTheme = {
  surface: '#fff', fg: '#111', muted: '#666', border: '#ddd', accent: '#4361EE', accentFg: '#fff', accentSoft: '#eef',
};

const pdf = (name = 'letter.pdf', size = 1000) => new File([new Uint8Array(size)], name, { type: 'application/pdf' });

function config(overrides: Partial<ComposerAttachmentsConfig> = {}): ComposerAttachmentsConfig {
  return {
    accept: ['application/pdf', 'image/png'],
    maxBytes: 5 * 1024 * 1024,
    maxFiles: 3,
    onUpload: vi.fn(async (file: File) => ({ id: `id-${file.name}`, name: file.name, mime: file.type, size: file.size })),
    onRefused: vi.fn(),
    ...overrides,
  };
}

function choose(files: File[]) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files } });
}

describe('Composer attachments', () => {
  it('draws no paperclip without a handler', () => {
    render(<Composer value="" onChange={() => {}} onSend={() => {}} />);

    expect(screen.queryByRole('button', { name: 'Attach a file' })).toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it('refuses a wrong type and an oversized file before any upload', () => {
    const cfg = config({ maxBytes: 500 });
    render(<Composer value="" onChange={() => {}} onSend={() => {}} attachments={cfg} />);

    choose([new File(['x'], 'notes.docx', { type: 'application/msword' }), pdf('big.pdf', 1000)]);

    expect(cfg.onUpload).not.toHaveBeenCalled();
    expect(cfg.onRefused).toHaveBeenCalledWith('notes.docx is not a file type that can be read here.');
    expect(cfg.onRefused).toHaveBeenCalledWith(expect.stringContaining('big.pdf is larger than'));
  });

  it('holds Send while a file uploads, then sends the chips and clears them', async () => {
    let finish: (chip: AttachmentChip) => void = () => {};
    const cfg = config({ onUpload: vi.fn(() => new Promise<AttachmentChip>((resolve) => { finish = resolve; })) });
    const onSend = vi.fn();
    render(<Composer value="Read this" onChange={() => {}} onSend={onSend} attachments={cfg} />);

    choose([pdf()]);
    const send = screen.getByRole('button', { name: 'Send' });
    expect(screen.getByText('Uploading')).toBeTruthy();
    expect((send as HTMLButtonElement).disabled).toBe(true);

    await act(async () => finish({ id: 'f1', name: 'letter.pdf', mime: 'application/pdf', size: 1000 }));
    await waitFor(() => expect((send as HTMLButtonElement).disabled).toBe(false));

    fireEvent.click(send);
    expect(onSend).toHaveBeenCalledWith([{ id: 'f1', name: 'letter.pdf', mime: 'application/pdf', size: 1000 }], 'attachment');
    expect(screen.queryByText('letter.pdf')).toBeNull();
  });

  it('tells the product when a stored file is removed before sending, and not after sending', async () => {
    const onRemove = vi.fn();
    const cfg = config({ onRemove });
    render(<Composer value="x" onChange={() => {}} onSend={() => {}} attachments={cfg} />);

    choose([pdf()]);
    await screen.findByText('1000 B');
    fireEvent.click(screen.getByRole('button', { name: 'Remove letter.pdf' }));

    expect(onRemove).toHaveBeenCalledWith({ id: 'id-letter.pdf', name: 'letter.pdf', mime: 'application/pdf', size: 1000 });

    choose([pdf('second.pdf')]);
    await screen.findByText('second.pdf');
    await waitFor(() => expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('shows the product reason on a failed upload and lets it be removed', async () => {
    const cfg = config({ onUpload: vi.fn(async () => { throw new Error('That file was refused by the scanner.'); }) });
    render(<Composer value="" onChange={() => {}} onSend={() => {}} attachments={cfg} />);

    choose([pdf()]);

    expect(await screen.findByText('Not attached')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe('That file was refused by the scanner.');
    fireEvent.click(screen.getByRole('button', { name: 'Remove letter.pdf' }));
    expect(screen.queryByText('letter.pdf')).toBeNull();
  });
});

describe('AssistantChat with files', () => {
  // jsdom has neither layout nor scrollTo; the autoscroll inside the panel calls it.
  Object.defineProperty(Element.prototype, 'scrollTo', { value: vi.fn(), configurable: true });

  it('a message that is only a file sends the stand-in words with the chip', async () => {
    const onSend = vi.fn();
    render(
      <AssistantChat theme={THEME} title="Porter" messages={[]} onSend={onSend} composer={{ attachments: config() }} />,
    );

    choose([pdf()]);
    const send = screen.getByRole('button', { name: 'Send' });
    await waitFor(() => expect((send as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(send);

    expect(onSend).toHaveBeenCalledWith('Here is a file.', {
      attachments: [{ id: 'id-letter.pdf', name: 'letter.pdf', mime: 'application/pdf', size: 1000 }],
      input: 'attachment',
    });
  });
});

describe('the person\'s row in AssistantChat', () => {
  Object.defineProperty(Element.prototype, 'scrollTo', { value: vi.fn(), configurable: true });

  it('draws the chips, drops the stored names line, and Export reads the names', () => {
    render(
      <AssistantChat
        theme={THEME}
        title="Porter"
        onSend={() => {}}
        messages={[{
          id: 'u1', role: 'user', text: 'What does it ask?\n\n[attached: letter.pdf]',
          attachments: [{ id: 'f1', name: 'letter.pdf', mime: 'application/pdf', size: 1000 }],
        }]}
      />,
    );

    const row = document.querySelector('[data-ai-export-role="user"]') as HTMLElement;
    expect(row.textContent).toContain('letter.pdf');
    expect(row.textContent).toContain('What does it ask?');
    expect(row.textContent).not.toContain('[attached:');
  });
});

describe('the person\'s bubble', () => {
  it('draws the files as chips and drops the stored names line', () => {
    render(
      <MessageBubble
        message={{
          id: 'u1',
          role: 'user',
          text: 'What does it ask?\n\n[attached: letter.pdf]',
          attachments: [{ id: 'f1', name: 'letter.pdf', mime: 'application/pdf', size: 1000 }],
        }}
      />,
    );

    expect(screen.getByRole('list', { name: 'Files sent' }).textContent).toContain('letter.pdf');
    expect(screen.getByText('What does it ask?')).toBeTruthy();
    expect(screen.queryByText(/\[attached:/)).toBeNull();
  });

  it('leaves a message without files exactly as typed', () => {
    expect(withoutAttachedLine('Hello')).toBe('Hello');
    render(<MessageBubble message={{ id: 'u2', role: 'user', text: 'Plain [attached: x] in the middle' }} />);
    expect(screen.getByText('Plain [attached: x] in the middle')).toBeTruthy();
  });
});

/**
 * 1.41.0: an extension in `accept` matches by the file's name. A browser reports `.md` (and on some
 * systems `.docx`) with an empty type, so a type-only check refused a Markdown or Word reference
 * before the product ever saw it.
 */
describe('acceptsFile', () => {
  it('accepts by type, as before', () => {
    expect(acceptsFile(['application/pdf'], { name: 'letter.pdf', type: 'application/pdf' })).toBe(true);
    expect(acceptsFile(['application/pdf'], { name: 'photo.png', type: 'image/png' })).toBe(false);
  });

  it('accepts by extension when the browser gives no type', () => {
    expect(acceptsFile(['.md', '.docx'], { name: 'notes.md', type: '' })).toBe(true);
    expect(acceptsFile(['.md', '.docx'], { name: 'GUIDE.DOCX', type: '' })).toBe(true);
    expect(acceptsFile(['.md'], { name: 'notes.exe', type: '' })).toBe(false);
  });

  it('never treats an empty type or a dotfile as a match', () => {
    expect(acceptsFile(['', 'application/pdf'], { name: 'mystery', type: '' })).toBe(false);
    expect(acceptsFile(['.env'], { name: '.env', type: '' })).toBe(false);
  });

  it('refuses a typeless file on the composer when only types are listed', async () => {
    const refused = vi.fn();
    render(<Composer value="" onChange={() => {}} onSend={() => {}} attachments={config({ onRefused: refused })} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [new File(['# x'], 'notes.md', { type: '' })] } });

    await waitFor(() => expect(refused).toHaveBeenCalledWith('notes.md is not a file type that can be read here.'));
  });
});
