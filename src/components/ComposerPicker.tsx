import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

/**
 * "@" to point the assistant at a record, "/" for what it can do here (1.34.0).
 *
 * ⚠ A MENTION IS WORDS IN THE MESSAGE, NOT A HIDDEN ID. Picking one writes the product's `insert`
 * text (Portify writes the case's name and number) into the box, so the turn is an ordinary message
 * the person can read, edit and see in their history, and the assistant resolves it the way it
 * resolves any name. Nothing travels that the person cannot see.
 *
 * ⚠ A "/" COMMAND FILLS THE BOX, IT DOES NOT SEND. The prompt lands as a draft the person finishes
 * ("Draft a reply to ..." needs the who), the same rule as follow-ups being the person's own words.
 */
export interface ComposerMention {
  id: string;
  label: string;
  /** A second line, e.g. "Case · MKT-52842927". */
  detail?: string;
  /** What goes into the message. Defaults to the label. */
  insert?: string;
}

export interface ComposerMentionsConfig {
  /** The product's own search, scoped to what this person may see. */
  search: (query: string) => Promise<ComposerMention[]>;
  /** Shown above the list. */
  title?: string;
}

export interface ComposerSlashCommand {
  key: string;
  label: string;
  detail?: string;
  /** The draft it puts in the box. */
  prompt: string;
}

type Mode = { kind: 'mention'; query: string; from: number } | { kind: 'slash'; query: string } | null;

const MENTION = /(^|\s)@([^\s@]{0,40})$/;

function modeFor(value: string, caret: number, mentions: boolean, slash: boolean): Mode {
  if (slash && /^\/\S*$/.test(value)) return { kind: 'slash', query: value.slice(1).toLowerCase() };
  if (!mentions) return null;
  const before = value.slice(0, caret);
  const match = MENTION.exec(before);
  if (!match) return null;

  return { kind: 'mention', query: match[2] ?? '', from: before.length - (match[2] ?? '').length - 1 };
}

interface Option {
  key: string;
  label: string;
  detail?: string;
  apply: () => void;
}

export interface ComposerPicker {
  open: boolean;
  options: Option[];
  active: number;
  title: string;
  loading: boolean;
  setActive: (i: number) => void;
  /** True when the key was the picker's: the composer must not also act on it. */
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => boolean;
  close: () => void;
}

export function useComposerPicker(
  value: string,
  caret: number,
  onChange: (value: string, caret?: number) => void,
  mentions?: ComposerMentionsConfig,
  slash?: ComposerSlashCommand[],
): ComposerPicker {
  const mode = modeFor(value, caret, Boolean(mentions), Boolean(slash && slash.length > 0));
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [found, setFound] = useState<{ query: string; items: ComposerMention[] } | null>(null);
  const [active, setActive] = useState(0);
  const searchRef = useRef(mentions?.search);
  useEffect(() => {
    searchRef.current = mentions?.search;
  });

  const mentionQuery = mode?.kind === 'mention' ? mode.query : null;
  useEffect(() => {
    if (mentionQuery === null || !searchRef.current) return undefined;
    let live = true;
    const timer = window.setTimeout(() => {
      searchRef.current?.(mentionQuery)
        .then((items) => {
          if (live) setFound({ query: mentionQuery, items: items.slice(0, 8) });
        })
        .catch(() => {
          if (live) setFound({ query: mentionQuery, items: [] });
        });
    }, 180);

    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [mentionQuery]);

  const signature = mode ? `${mode.kind}:${mode.query}` : null;
  const open = mode !== null && dismissed !== signature;

  let options: Option[] = [];
  if (mode?.kind === 'slash' && slash) {
    options = slash
      .filter((c) => mode.query === '' || c.label.toLowerCase().includes(mode.query) || c.key.toLowerCase().includes(mode.query))
      .slice(0, 8)
      .map((c) => ({ key: c.key, label: c.label, detail: c.detail, apply: () => onChange(c.prompt, c.prompt.length) }));
  } else if (mode?.kind === 'mention' && found && found.query === mode.query) {
    options = found.items.map((m) => ({
      key: m.id,
      label: m.label,
      detail: m.detail,
      apply: () => {
        const insert = `${m.insert ?? m.label} `;
        const next = value.slice(0, mode.from) + insert + value.slice(caret);
        onChange(next, mode.from + insert.length);
      },
    }));
  }
  const index = Math.min(active, Math.max(0, options.length - 1));

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!open || options.length === 0) {
      if (open && event.key === 'Escape') {
        setDismissed(signature);
        return true;
      }
      return false;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((index + step + options.length) % options.length);
      return true;
    }
    if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Tab') {
      if (event.nativeEvent.isComposing) return false;
      event.preventDefault();
      options[index]?.apply();
      setActive(0);
      return true;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setDismissed(signature);
      return true;
    }

    return false;
  };

  return {
    open: open && (options.length > 0 || mode?.kind === 'mention'),
    options,
    active: index,
    title: mode?.kind === 'slash' ? 'What I can do here' : mentions?.title ?? 'Point me at',
    loading: mode?.kind === 'mention' && (found === null || found.query !== mode.query),
    setActive,
    onKeyDown,
    close: () => setDismissed(signature),
  };
}

export function ComposerPickerList({ picker, listId }: { picker: ComposerPicker; listId: string }) {
  if (!picker.open) return null;

  return (
    <div
      className="mx-2 mt-2 overflow-hidden rounded-xl border"
      style={{ borderColor: 'var(--ai-border)', background: 'var(--ai-surface)' }}
    >
      <p className="px-3 pt-2 text-xs font-medium" style={{ color: 'var(--ai-muted)' }}>{picker.title}</p>
      {picker.options.length === 0 ? (
        <p className="px-3 pb-2 pt-1 text-sm" style={{ color: 'var(--ai-muted)' }}>
          {picker.loading ? 'Looking…' : 'Nothing matches.'}
        </p>
      ) : (
        <ul id={listId} role="listbox" className="max-h-56 overflow-y-auto py-1">
          {picker.options.map((option, i) => (
            <li key={option.key} role="option" aria-selected={i === picker.active}>
              <button
                type="button"
                // Picking must not blur the box first, or the caret the insert relies on is lost.
                onMouseDown={(event) => event.preventDefault()}
                onClick={option.apply}
                onMouseEnter={() => picker.setActive(i)}
                className="block w-full px-3 py-1.5 text-left text-sm outline-none"
                style={{
                  color: 'var(--ai-fg)',
                  background: i === picker.active ? 'var(--ai-accent-soft)' : 'transparent',
                }}
              >
                <span className="block truncate font-medium">{option.label}</span>
                {option.detail ? (
                  <span className="block truncate text-xs" style={{ color: 'var(--ai-muted)' }}>{option.detail}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
