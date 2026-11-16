import { Editor } from '@tiptap/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RichTextEditor, ToolbarButton, basicEditorExtensions, canonicaliseEmailBody, editorContentClass, editorFrameClass, emailEditorExtensions } from '../src/editor';

/** The estate's rich text editor (1.62.0, moved from Portify, owner 2026-11-16). */
const editors: Editor[] = [];
afterEach(() => {
  editors.splice(0).forEach((e) => e.destroy());
});

function roundTrip(html: string, extensions: ReturnType<typeof basicEditorExtensions>): string {
  const editor = new Editor({ extensions, content: html });
  editors.push(editor);

  return editor.getHTML();
}

describe('the extension sets keep what a stored document holds', () => {
  it('an email keeps its note card, fine print and table, and its links carry no target or rel', () => {
    const body = '<p>Hello <a href="https://example.com">there</a></p><aside><p>Keep this</p></aside><p><small>Fine print</small></p>'
      + '<table><tbody><tr><td><p>Fee</p></td><td><p>$85</p></td></tr></tbody></table>';
    const out = canonicaliseEmailBody(roundTrip(body, emailEditorExtensions()));

    expect(out).toContain('<aside><p>Keep this</p></aside>');
    expect(out).toContain('<small>Fine print</small>');
    expect(out).toMatch(/<td[^>]*><p>Fee<\/p><\/td><td[^>]*><p>\$85<\/p><\/td>/);
    expect(out).toContain('<a href="https://example.com">there</a>');
    expect(out).not.toMatch(/target=|rel=|style=|class=|<colgroup>/);
  });

  it('a page keeps its highlights, including a pasted background colour', () => {
    const out = roundTrip('<p><mark>clause 11</mark> and <span style="background-color: yellow">pasted</span> and <span style="background-color: transparent">plain</span></p>', basicEditorExtensions());

    expect(out).toBe('<p><mark>clause 11</mark> and <mark>pasted</mark> and plain</p>');
  });
});

describe('editorContentClass', () => {
  it('a caller size or padding replaces the default rather than competing with it', () => {
    expect(editorContentClass('min-h-[480px]')).toBe('prose prose-sm max-w-none focus:outline-none px-3 py-2 min-h-[480px]');
    expect(editorContentClass('p-0')).toBe('prose prose-sm max-w-none focus:outline-none min-h-[200px] p-0');
    expect(editorContentClass()).toBe('prose prose-sm max-w-none focus:outline-none min-h-[200px] px-3 py-2');
  });
});

describe('editorFrameClass', () => {
  it('a caller rounding, border colour or background replaces the default; a border width or layout class does not', () => {
    expect(editorFrameClass('overflow-hidden rounded-2xl border-slate-200')).toBe('border bg-[var(--ai-editor-bg,#ffffff)] overflow-hidden rounded-2xl border-slate-200');
    expect(editorFrameClass('border-2 mt-2')).toBe('rounded-lg border border-[var(--ai-editor-border,#d1d5db)] bg-[var(--ai-editor-bg,#ffffff)] border-2 mt-2');
    expect(editorFrameClass()).toBe('rounded-lg border border-[var(--ai-editor-border,#d1d5db)] bg-[var(--ai-editor-bg,#ffffff)]');
  });
});

describe('RichTextEditor', () => {
  it('offers only the groups asked for, and the email-only groups only on an email', async () => {
    const { unmount } = render(<RichTextEditor value="<p>Hi</p>" controls={['format', 'link', 'table', 'blocks']} />);
    await screen.findByRole('button', { name: 'Bold' });
    expect(screen.queryByRole('button', { name: 'Heading 1' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Insert detail table' })).toBeNull(); // not an email
    unmount();

    render(<RichTextEditor value="<p>Hi</p>" variant="email" controls={['table', 'blocks']} />);
    expect(await screen.findByRole('button', { name: 'Insert detail table' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Note card' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Bold' })).toBeNull();
  });

  it('a value the parent sets is shown without echoing back as an edit', async () => {
    const onChange = vi.fn();
    function Host() {
      const [value, setValue] = useState('<p>First</p>');

      return (
        <>
          <button type="button" onClick={() => setValue('<p>Second</p>')}>Swap</button>
          <RichTextEditor value={value} onChange={onChange} />
        </>
      );
    }
    const { container } = render(<Host />);
    await waitFor(() => expect(container.querySelector('.ProseMirror')?.textContent).toBe('First'));
    fireEvent.click(screen.getByText('Swap'));
    await waitFor(() => expect(container.querySelector('.ProseMirror')?.textContent).toBe('Second'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('links through a bar inside the editor: Enter saves, Escape closes without touching the text', async () => {
    const onChange = vi.fn();
    const ref = { current: null as Editor | null };
    render(<RichTextEditor value="<p>Read the news</p>" onChange={onChange} editorRef={ref as never} />);
    await screen.findByRole('button', { name: 'Insert link' });
    act(() => {
      ref.current!.commands.setTextSelection({ from: 10, to: 14 });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Insert link' }));
    fireEvent.keyDown(screen.getByLabelText('Link to'), { key: 'Escape' });
    expect(screen.queryByLabelText('Link to')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Insert link' }));
    fireEvent.change(screen.getByLabelText('Link to'), { target: { value: 'https://www.canada.ca/' } });
    fireEvent.keyDown(screen.getByLabelText('Link to'), { key: 'Enter' });
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(expect.stringMatching(/Read the <a [^>]*href="https:\/\/www\.canada\.ca\/"[^>]*>news<\/a>/)));
    expect(screen.queryByLabelText('Link to')).toBeNull();
  });

  it('a product adds its own tools to the formatting group and its own extensions', async () => {
    const extensions = vi.fn((placeholder) => basicEditorExtensions({ placeholder }));
    render(
      <RichTextEditor
        value="<p>Hi</p>"
        extensions={extensions}
        formatTools={(editor, disabled) => <ToolbarButton icon="Callout" label="Clause panel" disabled={disabled} active={editor.isActive('bold')} onClick={() => undefined} />}
      />,
    );
    expect(await screen.findByRole('button', { name: 'Clause panel' })).toBeTruthy();
    expect(extensions).toHaveBeenCalled();
  });
});
