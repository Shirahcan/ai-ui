import { useCallback, useRef, useState } from 'react';
import type { AttachmentChip } from '../types';
import { FileIcon, PaperclipIcon } from '../icons';
import { aiVar } from '../theme';

/**
 * Files on the composer (1.29.0). A product turns the paperclip on by passing this; without it the
 * composer draws none, so every other product stays exactly as it was.
 *
 * The COMPONENT owns the states (uploading, ready, failed with the product's own reason, removed);
 * the PRODUCT owns the request, which is why `onUpload` returns its chip or throws its reason.
 */
export interface ComposerAttachmentsConfig {
  /** MIME types the product accepts, e.g. `['application/pdf', 'image/png']`. */
  accept: string[];
  /** Largest single file, in bytes: refused here, before any upload. */
  maxBytes: number;
  /** Files on one message. */
  maxFiles: number;
  /** Stores one file and returns its chip. Throw an Error whose message the person should read. */
  onUpload: (file: File) => Promise<AttachmentChip>;
  /** A refusal made here (wrong type, too large, too many), for the product's own error surface. */
  onRefused?: (message: string) => void;
  /**
   * A stored file the person removed before sending, so the product can delete it now rather
   * than keep it until its retention. Best-effort: the chip goes either way.
   */
  onRemove?: (chip: AttachmentChip) => void | Promise<void>;
  /** The paperclip's accessible name. */
  label?: string;
}

export interface PendingAttachment {
  key: string;
  name: string;
  size: number;
  status: 'uploading' | 'ready' | 'failed';
  chip?: AttachmentChip;
  error?: string;
}

function megabytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);

  return mb >= 10 || Number.isInteger(mb) ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;

  return megabytes(bytes);
}

/** The pending files and what can be done with them. */
export function useComposerAttachments(config: ComposerAttachmentsConfig | undefined) {
  const [items, setItems] = useState<PendingAttachment[]>([]);
  const seq = useRef(0);

  const add = useCallback(
    (files: File[]) => {
      if (!config || files.length === 0) return;

      const room = config.maxFiles - items.filter((i) => i.status !== 'failed').length;
      if (room <= 0) {
        config.onRefused?.(`You can attach up to ${config.maxFiles} files to one message.`);
        return;
      }

      for (const file of files.slice(0, room)) {
        if (!config.accept.includes(file.type)) {
          config.onRefused?.(`${file.name} is not a file type that can be read here.`);
          continue;
        }
        if (file.size > config.maxBytes) {
          config.onRefused?.(`${file.name} is larger than ${megabytes(config.maxBytes)}.`);
          continue;
        }

        seq.current += 1;
        const key = `f${seq.current}`;
        setItems((prev) => [...prev, { key, name: file.name, size: file.size, status: 'uploading' }]);

        config
          .onUpload(file)
          .then((chip) => {
            setItems((prev) => prev.map((i) => (i.key === key ? { ...i, status: 'ready', chip } : i)));
          })
          .catch((err: unknown) => {
            const error = err instanceof Error && err.message ? err.message : 'That file could not be attached.';
            setItems((prev) => prev.map((i) => (i.key === key ? { ...i, status: 'failed', error } : i)));
          });
      }

      if (files.length > room) {
        config.onRefused?.(`You can attach up to ${config.maxFiles} files to one message.`);
      }
    },
    [config, items],
  );

  const remove = useCallback((key: string) => {
    const gone = items.find((i) => i.key === key);
    if (gone?.status === 'ready' && gone.chip && config?.onRemove) {
      void Promise.resolve(config.onRemove(gone.chip)).catch(() => undefined);
    }
    setItems((prev) => prev.filter((i) => i.key !== key));
  }, [config, items]);

  const clear = useCallback(() => setItems([]), []);

  const ready = items.filter((i) => i.status === 'ready' && i.chip).map((i) => i.chip as AttachmentChip);
  const uploading = items.some((i) => i.status === 'uploading');

  return { items, add, remove, clear, ready, uploading };
}

/** The paperclip: a real button over a hidden file input. */
export function AttachButton({
  config,
  onFiles,
  disabled,
}: {
  config: ComposerAttachmentsConfig;
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const label = config.label ?? 'Attach a file';

  return (
    <>
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={disabled}
        aria-label={label}
        title={label}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full outline-none transition-colors hover:bg-[var(--ai-accent-soft)] disabled:opacity-40"
        style={{ color: aiVar('--ai-muted') }}
      >
        <PaperclipIcon />
      </button>
      <input
        ref={input}
        type="file"
        name="attachment"
        multiple={config.maxFiles > 1}
        accept={config.accept.join(',')}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          onFiles(Array.from(event.target.files ?? []));
          // The same file chosen twice in a row must fire again.
          event.target.value = '';
        }}
      />
    </>
  );
}

/** The chips on the composer, each removable. A failed one says why, in the product's words. */
export function PendingAttachmentChips({
  items,
  onRemove,
}: {
  items: PendingAttachment[];
  onRemove: (key: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-1.5 px-2 pt-2" aria-label="Attached files">
      {items.map((item) => (
        <li
          key={item.key}
          className="flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs"
          style={{
            borderColor: item.status === 'failed' ? aiVar('--ai-danger') : aiVar('--ai-border'),
            color: aiVar('--ai-fg'),
          }}
          title={item.error ?? item.name}
        >
          <FileIcon size={12} />
          <span className="max-w-[12rem] truncate">{item.name}</span>
          <span style={{ color: item.status === 'failed' ? aiVar('--ai-danger') : aiVar('--ai-muted') }}>
            {item.status === 'uploading' ? 'Uploading' : item.status === 'failed' ? 'Not attached' : formatBytes(item.size)}
          </span>
          <button
            type="button"
            onClick={() => onRemove(item.key)}
            aria-label={`Remove ${item.name}`}
            className="ml-0.5 rounded-full px-1 leading-none outline-none hover:opacity-70"
          >
            ×
          </button>
          {item.status === 'failed' && item.error ? (
            <span className="sr-only" role="alert">
              {item.error}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** The chips on a sent message: the file names, read-only. */
export function MessageAttachmentChips({ attachments }: { attachments: AttachmentChip[] }) {
  if (attachments.length === 0) return null;

  return (
    <ul className="mb-1.5 flex flex-wrap justify-end gap-1.5" aria-label="Files sent">
      {attachments.map((a) => (
        <li
          key={a.id}
          // Drawn on the person's light bubble: the card's own surface and hairline, not a white wash.
          className="flex max-w-full items-center gap-1.5 rounded-full border border-[var(--ai-border,#e2e8f0)] bg-[var(--ai-surface,#fff)] px-2.5 py-1 text-xs"
          style={{ opacity: a.state === 'deleted' ? 0.7 : 1 }}
          title={a.state === 'deleted' ? `${a.name} (no longer kept)` : a.name}
        >
          <FileIcon size={12} />
          <span className="max-w-[14rem] truncate">{a.name}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * A person's message as stored ends with the names of its files ("[attached: a.pdf]") so the
 * transcript says what was sent. On the bubble the chips say it instead, so the line is dropped.
 */
export function withoutAttachedLine(text: string): string {
  return text.replace(/\n*\[attached: [^\]\n]*\]\s*$/, '').trimEnd();
}
