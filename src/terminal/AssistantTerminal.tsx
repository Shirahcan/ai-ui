import React, { useEffect, useMemo, useRef, useState } from 'react';

import type { AttachmentChip } from '../types';
import type { AssistantInputKind } from '../useAssistantConversation';
import { useAutoscroll } from '../useAutoscroll';
import type { TerminalCommandName } from './commands';
import { TerminalInput, type TerminalComposerOptions, type TerminalMentions } from './TerminalInput';
import { TerminalLines } from './TerminalLines';
import { TerminalRewind, type TerminalRewindChoice } from './TerminalRewind';
import { TerminalStatus } from './TerminalStatus';
import { BriefView, ContextView, HelpView, ResumeView, ThemeView } from './TerminalViews';
import { TERMINAL_THEMES, terminalTheme, themeToTerminalVars, type TerminalTheme } from './terminalThemes';
import { toLines, toMarkdown } from './transcript';
import type { TerminalBrief, TerminalLive, TerminalNote, TerminalSessionRow, TerminalSize, TerminalTurn } from './types';
import { useTerminalDock } from './useTerminalDock';
import { useTerminalKeys } from './useTerminalKeys';

type View = 'context' | 'resume' | 'help' | 'theme' | 'brief' | 'rewind';

/** The commands the panel runs itself; the rest go to the host. */
const PANEL_VIEWS: Partial<Record<TerminalCommandName, View>> = { help: 'help', context: 'context', resume: 'resume', rewind: 'rewind', theme: 'theme', brief: 'brief' };

const MONO = 'ui-monospace, "JetBrains Mono", "Cascadia Code", "SF Mono", Menlo, Consolas, monospace';

export interface AssistantTerminalProps {
  open: boolean;
  onClose: () => void;
  /** "Porter". */
  assistantName: string;
  /** What the console works on, as a person names it ("Home page") and as a noun ("page"). */
  subjectLabel: string;
  subjectNoun?: string;
  /** Header title. Default "{assistant} console". */
  title?: string;

  session: TerminalSessionRow | null;
  turns: TerminalTurn[];
  live?: TerminalLive | null;
  notes?: TerminalNote[];
  size?: TerminalSize | null;
  brief?: TerminalBrief | null;
  history?: string[];
  /** Loading the console, or its history could not be read: a line says so. */
  loading?: boolean;

  mode: 'build' | 'plan';
  onModeChange: (mode: 'build' | 'plan') => void;
  target?: { label: string; onClear: () => void } | null;

  value: string;
  onChange: (value: string) => void;
  onAsk: (text: string, files: AttachmentChip[], input?: AssistantInputKind) => void;
  composer?: TerminalComposerOptions;
  mentions?: TerminalMentions;

  onStop: () => void;
  /** `clear`, `compact` (arg = focus), `undo`: the host's. Views, `plan`, `brief text` and `export` the panel runs. */
  onCommand: (name: TerminalCommandName, arg: string) => void;
  onRewind: (turnId: string, choice: TerminalRewindChoice, focus?: string) => void;
  onBuildPlan?: () => void;
  onDismissPlan?: () => void;
  /** `/resume`: null while loading. `onLoad` is called when the view opens. */
  sessions?: { list: TerminalSessionRow[] | null; onLoad: () => void; onOpen: (id: string) => void };
  onSaveBrief: (text: string | null) => void;
  /** Esc Esc with a draft: the draft is cleared; the host may keep it in its history. */
  onClearDraft?: (text: string) => void;

  theme: string;
  themes?: TerminalTheme[];
  onThemeChange: (key: string) => void;
  width?: number | null;
  onWidthChange?: (width: number) => void;
  /** A failure that is not an API error (the clipboard on /export). */
  onError?: (error: unknown) => void;
  /** Position only (top, left, bottom, z-index): the panel draws everything else itself. */
  className?: string;
}

/**
 * A console for a studio surface (Porter console, owner 2026-11-08): a terminal-style session on one
 * subject, the asks and the assistant's steps, thinking, replies and outcomes line by line, with
 * Claude Code's context tools (`/clear`, `/compact`, `/context`, `/resume`, `/rewind`, a brief) and keys.
 *
 * ⚠ IT FLOATS OVER THE HOST'S CANVAS AND NEVER ASKS FOR ROOM (owner D1 revised): a canvas squeezed
 * beside a console is too narrow to judge a page. The host positions it; the panel sizes itself.
 * ⚠ ONE INPUT: the shared `Composer`, themed through the `--ai-*` palette the panel points at its theme.
 */
export function AssistantTerminal(props: AssistantTerminalProps): React.JSX.Element {
  const {
    open, onClose, assistantName, subjectLabel, subjectNoun = 'page', title, session, turns, live = null, notes = [], size = null, brief = null,
    history = [], loading = false, mode, onModeChange, target = null, value, onChange, onAsk, composer, mentions, onStop, onCommand, onRewind,
    onBuildPlan, onDismissPlan, sessions, onSaveBrief, onClearDraft, theme, themes = TERMINAL_THEMES, onThemeChange, width, onWidthChange, onError, className = '',
  } = props;
  const [view, setView] = useState<View | null>(null);
  const [rewindFrom, setRewindFrom] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [clearedThrough, setClearedThrough] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const dock = useTerminalDock(width, onWidthChange);
  const words = useMemo(() => ({ assistant: assistantName, subject: subjectNoun }), [assistantName, subjectNoun]);
  const active = terminalTheme(theme, themes);
  const working = live !== null;
  const lines = useMemo(
    () => toLines(turns, { session, live, expanded, notes, clearedThrough: clearedThrough && turns.some((t) => t.id === clearedThrough) ? clearedThrough : null, assistantName }),
    [turns, session, live, expanded, notes, clearedThrough, assistantName],
  );
  const scroll = useAutoscroll<HTMLDivElement>({ watch: lines });
  const panelTitle = title ?? `${assistantName} console`;
  const inputWrap = useRef<HTMLDivElement | null>(null);

  // Opening the console puts the cursor in it (a fresh page opens straight into an ask).
  useEffect(() => {
    if (open) inputWrap.current?.querySelector('textarea')?.focus();
  }, [open]);

  const openView = (next: View) => {
    setMenuOpen(false);
    setSearching(false);
    if (next === 'resume') sessions?.onLoad();
    setView(next);
  };

  const closeView = () => {
    setView(null);
    setRewindFrom(null);
    requestAnimationFrame(() => inputWrap.current?.querySelector('textarea')?.focus());
  };

  const exportTranscript = async () => {
    const markdown = toMarkdown(`${panelTitle}: ${subjectLabel}`, toLines(turns, { session, expanded: true, assistantName }));

    try {
      const blob = new Blob([markdown], { type: 'text/markdown' });
      const link = document.createElement('a');

      link.href = URL.createObjectURL(blob);
      link.download = `${subjectLabel.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'console'}-${new Date().toISOString().slice(0, 10)}.md`;
      link.click();
      URL.revokeObjectURL(link.href);
      await navigator.clipboard.writeText(markdown);
    } catch (error) {
      onError?.(error);
    }
  };

  const command = (name: TerminalCommandName, arg: string) => {
    setMenuOpen(false);

    if (name === 'brief' && arg !== '') return onSaveBrief(arg);
    if (name === 'plan') return onModeChange(mode === 'plan' ? 'build' : 'plan');
    if (name === 'export') return void exportTranscript();
    if (name === 'clear') setClearedThrough(null);

    const panelView = PANEL_VIEWS[name];

    if (panelView) return openView(panelView);

    onCommand(name, arg);
  };

  const onKeyDown = useTerminalKeys({
    working,
    viewOpen: view !== null || menuOpen,
    inputEmpty: value.trim() === '',
    onStop,
    onCloseView: () => (menuOpen ? setMenuOpen(false) : closeView()),
    onRewind: () => openView('rewind'),
    onClearDraft: () => {
      onClearDraft?.(value);
      onChange('');
    },
    onToggleMode: () => onModeChange(mode === 'plan' ? 'build' : 'plan'),
    onToggleDetails: () => setExpanded((e) => !e),
    onClearScreen: () => setClearedThrough(turns.at(-1)?.id ?? null),
    onHelp: () => openView('help'),
    onSearch: () => setSearching(true),
  });

  const menu: [string, () => void][] = [
    ['New session', () => command('clear', '')],
    ['Summarise the session', () => command('compact', '')],
    ['Context', () => openView('context')],
    ['Brief', () => openView('brief')],
    ['Export transcript', () => command('export', '')],
    ['Commands and shortcuts', () => openView('help')],
  ];

  const body = (() => {
    switch (view) {
      case 'context':
        return <ContextView size={size} assistant={assistantName} onBack={closeView} onCompact={() => { closeView(); onCommand('compact', ''); }} onClear={() => { closeView(); command('clear', ''); }} />;
      case 'resume':
        return <ResumeView sessions={sessions?.list ?? null} currentId={session?.id ?? null} subject={subjectNoun} onBack={closeView} onOpen={(id) => { closeView(); sessions?.onOpen(id); }} />;
      case 'help':
        return <HelpView words={words} onBack={closeView} />;
      case 'theme':
        return <ThemeView themes={themes} current={active.key} onPick={onThemeChange} onBack={closeView} />;
      case 'brief':
        return <BriefView brief={brief} subject={subjectNoun} onBack={closeView} onSave={(text) => { closeView(); onSaveBrief(text); }} />;
      case 'rewind':
        return <TerminalRewind turns={turns} subject={subjectNoun} initial={rewindFrom} onBack={closeView} onChoose={(id, choice, focus) => { closeView(); onRewind(id, choice, focus); }} />;
      default:
        return null;
    }
  })();

  return (
    <aside
      data-ai-terminal=""
      aria-label={`${panelTitle}, ${subjectLabel}`}
      aria-hidden={!open}
      inert={!open}
      onKeyDown={onKeyDown}
      className={`flex flex-col overflow-hidden rounded-xl border border-[var(--term-border)] bg-[var(--term-bg)] text-[13px] leading-6 text-[var(--term-text)] shadow-[0_24px_64px_rgba(2,6,23,0.45)] motion-safe:transition-transform motion-safe:duration-200 ${open ? 'translate-x-0' : 'pointer-events-none -translate-x-[calc(100%+2rem)]'} ${className}`}
      style={{ ...themeToTerminalVars(active), width: dock.width, fontFamily: MONO } as React.CSSProperties}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-[var(--term-border)] bg-[var(--term-bar)] px-3 py-2">
        <span aria-hidden="true" className="font-bold text-[var(--term-accent)]">❯_</span>
        <h2 className="min-w-0 flex-1 truncate">
          <span className="font-semibold">{panelTitle}</span>
          <span className="text-[var(--term-dim)]"> · {subjectLabel}</span>
          <span className="ml-2 text-[11px] text-[var(--term-dim)]">
            {session ? `${session.turns} ${session.turns === 1 ? 'turn' : 'turns'}${session.summary ? ' · summarised' : ''}` : 'new session'}
          </span>
        </h2>
        {sessions ? <button type="button" onClick={() => openView('resume')} className="rounded px-1.5 text-[11px] text-[var(--term-dim)] outline-none hover:text-[var(--term-text)] focus-visible:ring-1 focus-visible:ring-[var(--term-accent)]">sessions</button> : null}
        <button type="button" onClick={() => openView('theme')} className="rounded px-1.5 text-[11px] text-[var(--term-dim)] outline-none hover:text-[var(--term-text)] focus-visible:ring-1 focus-visible:ring-[var(--term-accent)]">theme</button>
        <div className="relative">
          <button type="button" aria-haspopup="menu" aria-expanded={menuOpen} aria-label="More" onClick={() => setMenuOpen((o) => !o)} className="rounded px-1.5 text-[var(--term-dim)] outline-none hover:text-[var(--term-text)] focus-visible:ring-1 focus-visible:ring-[var(--term-accent)]">⋮</button>
          {menuOpen ? (
            <ul role="menu" className="absolute right-0 top-7 z-10 w-56 rounded-md border border-[var(--term-border)] bg-[var(--term-bar)] py-1 shadow-xl">
              {menu.map(([label, run]) => (
                <li key={label} role="none">
                  <button type="button" role="menuitem" onClick={run} className="w-full px-3 py-1 text-left text-[12px] outline-none hover:bg-[var(--term-selection)] focus-visible:bg-[var(--term-selection)]">{label}</button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <button type="button" onClick={onClose} aria-label={`Close the ${panelTitle} (Ctrl+\`)`} title="Close (Ctrl+`)" className="rounded px-1.5 text-[var(--term-dim)] outline-none hover:text-[var(--term-text)] focus-visible:ring-1 focus-visible:ring-[var(--term-accent)]">×</button>
      </header>

      {body ?? (
        <div className="relative min-h-0 flex-1">
          <div ref={scroll.scrollRef} onScroll={scroll.onScroll} role="log" aria-label="Transcript" className="h-full overflow-y-auto px-4 py-3">
            {loading ? <p className="text-[var(--term-dim)]">Opening the session…</p> : null}
            {!loading && lines.length === 0 ? (
              <div className="text-[var(--term-dim)]">
                <p className="text-[var(--term-text)]">Describe what you want on this {subjectNoun}, and {assistantName} will build it.</p>
                <p className="mt-2">/ commands · @ aim at an element · ↑ earlier asks · ? shortcuts · alt+m plan first</p>
                {brief ? <p className="mt-2">Brief: <span className="text-[var(--term-text)]">{brief.text}</span></p> : null}
              </div>
            ) : null}
            <TerminalLines lines={lines} onRewind={(turnId) => { setRewindFrom(turnId); openView('rewind'); }} onBuildPlan={onBuildPlan} onDismissPlan={onDismissPlan} />
          </div>
          {!scroll.isPinned ? (
            <button type="button" onClick={scroll.scrollToBottom} className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-[var(--term-border)] bg-[var(--term-bar)] px-3 py-0.5 text-[11px] text-[var(--term-text)] shadow outline-none focus-visible:ring-1 focus-visible:ring-[var(--term-accent)]">
              Jump to latest ↓
            </button>
          ) : null}
        </div>
      )}

      <TerminalStatus
        working={working}
        verb={live ? (live.steps.at(-1)?.text ?? live.verb) : null}
        startedAt={live?.startedAt ?? null}
        stopping={live?.stopping}
        mode={mode}
        onToggleMode={() => onModeChange(mode === 'plan' ? 'build' : 'plan')}
        target={target}
        size={size}
        onContext={() => openView('context')}
      />

      <div ref={inputWrap} className="shrink-0 bg-[var(--term-bar)] px-2 pb-2">
        <TerminalInput
          value={value}
          onChange={onChange}
          onAsk={onAsk}
          onCommand={command}
          history={history}
          words={words}
          mentions={mentions}
          composer={composer}
          searching={searching}
          onSearchClose={() => setSearching(false)}
        />
      </div>

      <div
        {...dock.handle}
        aria-label="Resize the console"
        className="absolute inset-y-0 right-0 w-1.5 cursor-col-resize outline-none hover:bg-[var(--term-selection)] focus-visible:bg-[var(--term-accent)]"
      />
    </aside>
  );
}
