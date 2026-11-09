import React, { useEffect, useMemo, useRef, useState } from 'react';

import { Composer, type ComposerProps } from '../components/Composer';
import type { ComposerMention } from '../components/ComposerPicker';
import type { AttachmentChip } from '../types';
import type { AssistantInputKind } from '../useAssistantConversation';
import { expandSavedCommand, parseCommand, savedSlashCommands, slashCommands, type TerminalCommandName, type TerminalSavedCommand } from './commands';

/** What the host lets the console's Composer do, beyond the words (files, dictation, Send's label). */
export type TerminalComposerOptions = Omit<ComposerProps, 'value' | 'onChange' | 'onSend' | 'history' | 'slashCommands' | 'mentions'>;

export interface TerminalMentions {
  /** The subject's elements whose name matches ("hero" -> Hero, Hero 2). */
  search: (query: string) => Promise<ComposerMention[]>;
  /** A pick aims the assistant at that element (the same target the host's own "Add" sets). */
  onAim: (id: string) => void;
}

export interface TerminalInputProps {
  value: string;
  onChange: (value: string) => void;
  onAsk: (text: string, files: AttachmentChip[], input?: AssistantInputKind) => void;
  onCommand: (name: TerminalCommandName, arg: string) => void;
  history: string[];
  words: { assistant: string; subject: string };
  /** Commands this host does not offer (1.45.0): left out of the "/" picker. */
  hiddenCommands?: readonly TerminalCommandName[];
  /** The person's own commands (1.53.0): listed after the built-ins; `/name` sends its ask. */
  saved?: readonly TerminalSavedCommand[];
  mentions?: TerminalMentions;
  composer?: TerminalComposerOptions;
  /** Ctrl+R: the reverse search row is open. */
  searching: boolean;
  onSearchClose: () => void;
}

/**
 * The console's input: the ONE shared `Composer` (never a copy: its docblock says why), with the up-arrow
 * history, the "/" commands run here instead of sent, "@" aiming at an element, and Ctrl+R search.
 */
export function TerminalInput({ value, onChange, onAsk, onCommand, history, words, hiddenCommands, saved = [], mentions, composer, searching, onSearchClose }: TerminalInputProps): React.JSX.Element {
  const picked = useRef(new Map<string, string>());
  // A command with nothing to add runs the moment it is picked; one that takes words fills the box. The
  // person's own fill the box too, so words can be added before Enter sends them.
  const commands = useMemo(
    () => [
      ...slashCommands(words, hiddenCommands).map((c) => (c.prompt.endsWith(' ') ? c : { ...c, run: () => onCommand(c.key as TerminalCommandName, '') })),
      ...savedSlashCommands(saved),
    ],
    [words, hiddenCommands, onCommand, saved],
  );

  const mentionConfig = useMemo(
    () =>
      mentions
        ? {
            title: `Aim ${words.assistant} at`,
            search: async (query: string) => {
              const found = await mentions.search(query);

              for (const m of found) picked.current.set(m.insert ?? `@${m.label}`, m.id);

              return found.map((m) => ({ ...m, insert: m.insert ?? `@${m.label}` }));
            },
          }
        : undefined,
    [mentions, words.assistant],
  );

  const change = (next: string) => {
    // A pick from the "@" list just went in: aim at it now, so the status line names it before Send.
    if (mentions && next.length > value.length) {
      for (const [token, id] of picked.current) {
        if (next.includes(token) && !value.includes(token)) mentions.onAim(id);
      }
    }

    onChange(next);
  };

  const send = (files: AttachmentChip[], input?: AssistantInputKind) => {
    const command = parseCommand(value);

    if (command && files.length === 0) {
      onCommand(command.name, command.arg);
      onChange('');

      return;
    }

    if (value.trim() === '' && files.length === 0) return;

    // `/seo-pass` sends the ask it stands for (the person's own command, 1.53.0).
    onAsk(expandSavedCommand(value, saved) ?? value.trim(), files, input);
  };

  return (
    <div className="relative">
      {searching ? <ReverseSearch history={history} onTake={(text) => { onChange(text); onSearchClose(); }} onClose={onSearchClose} /> : null}
      <Composer
        id="terminal-input"
        name="terminal-input"
        placeholder={`Describe what you want, and ${words.assistant} will build it`}
        {...composer}
        value={value}
        onChange={change}
        onSend={send}
        history={history}
        slashCommands={commands}
        mentions={mentionConfig}
        // The box itself is drawn from the `--ai-*` palette, which the panel points at its theme.
        className={composer?.className ?? 'pt-0'}
        textareaClassName={
          composer?.textareaClassName
          ?? 'w-full resize-none overflow-y-auto bg-transparent px-3 pt-2.5 pb-1 font-[inherit] text-[13px] leading-6 caret-[var(--term-accent)] outline-none placeholder:text-[var(--term-dim)]'
        }
      />
    </div>
  );
}

/** Ctrl+R: search earlier asks as you type; Ctrl+R again steps to an older match; Enter takes it. */
function ReverseSearch({ history, onTake, onClose }: { history: string[]; onTake: (text: string) => void; onClose: () => void }): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [skip, setSkip] = useState(0);
  const field = useRef<HTMLInputElement | null>(null);
  const matches = useMemo(() => (query.trim() === '' ? history : history.filter((h) => h.toLowerCase().includes(query.trim().toLowerCase()))), [history, query]);
  const match = matches.length > 0 ? matches[Math.min(skip, matches.length - 1)] : null;

  useEffect(() => {
    field.current?.focus();
  }, []);

  return (
    <div className="mb-1 flex items-center gap-2 rounded-md border border-[var(--term-border)] bg-[var(--term-bg)] px-2 py-1 text-[12px]">
      <label htmlFor="terminal-search" className="shrink-0 text-[var(--term-dim)]">(search)</label>
      <input
        ref={field}
        id="terminal-search"
        name="terminal-search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setSkip(0);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          } else if (event.key === 'Enter') {
            event.preventDefault();
            if (match) onTake(match);
            else onClose();
          } else if (event.key.toLowerCase() === 'r' && event.ctrlKey) {
            event.preventDefault();
            event.stopPropagation();
            setSkip((s) => s + 1);
          }
        }}
        aria-describedby="terminal-search-match"
        className="w-28 shrink-0 bg-transparent px-1 text-[var(--term-text)] outline-none"
      />
      <span id="terminal-search-match" className="min-w-0 flex-1 truncate text-[var(--term-text)]" aria-live="polite">
        {match ?? <span className="text-[var(--term-dim)]">no earlier ask matches</span>}
      </span>
    </div>
  );
}
