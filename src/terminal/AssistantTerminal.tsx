import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { AttachmentChip } from '../types';
import type { AssistantInputKind } from '../useAssistantConversation';
import { useAutoscroll } from '../useAutoscroll';
import { specializationFromArg, type TerminalCommandName, type TerminalSavedCommand } from './commands';
import { CostView, SavedCommandsView, SpecializationView, specializationWhy } from './TerminalExtrasViews';
import { TerminalInput, type TerminalComposerOptions, type TerminalMentions } from './TerminalInput';
import { TerminalLines } from './TerminalLines';
import { TerminalMenu, type TerminalMenuItem } from './TerminalMenu';
import { TerminalQuestionBlock, type TerminalQuestionDraft } from './TerminalQuestion';
import { TerminalRewind, type TerminalRewindChoice } from './TerminalRewind';
import { SettingsView } from './TerminalSettings';
import { TerminalStatus } from './TerminalStatus';
import { BriefView, ContextView, HelpView, ResumeView, ThemeView, TuningView } from './TerminalViews';
import { TERMINAL_THEMES, terminalTheme, themeToTerminalVars, type TerminalTheme } from './terminalThemes';
import { toLines, toMarkdown } from './transcript';
import type { TerminalAnswer, TerminalBrief, TerminalEffort, TerminalLevel, TerminalLive, TerminalMode, TerminalNote, TerminalSessionRow, TerminalSize, TerminalSpecialization, TerminalSpecializationOption, TerminalTurn, TerminalUsage } from './types';
import { useDoneMark } from './useDoneMark';
import { useTerminalDock } from './useTerminalDock';
import { useTerminalKeys } from './useTerminalKeys';
import { useTerminalRecap } from './useTerminalRecap';
import { stepZoom } from './zoom';

type View = 'context' | 'resume' | 'help' | 'theme' | 'brief' | 'rewind' | 'tuning' | 'settings' | 'cost' | 'commands' | 'specialize';

const ALL_LEVELS: TerminalLevel[] = ['normal', 'pro', 'expert'];
const ALL_EFFORTS: TerminalEffort[] = ['low', 'medium', 'high'];

/** The commands the panel runs itself; the rest go to the host. */
const PANEL_VIEWS: Partial<Record<TerminalCommandName, View>> = { help: 'help', context: 'context', resume: 'resume', rewind: 'rewind', theme: 'theme', brief: 'brief', config: 'settings' };

/**
 * What a click in the transcript leaves alone (1.48.0): anything the person can use there. Every other
 * click puts the cursor back in the composer, as a click anywhere in Claude Code's terminal does.
 */
const OWN_CLICK = 'button, a, input, textarea, select, summary, label, [role="button"], [role="menuitem"], [role="radio"], [contenteditable="true"], [data-ai-question]';

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
  /**
   * The guide the work follows (1.55.0, owner 2026-11-11: "specialization" for landing pages, blog posts):
   * what applies now, the guides on offer, and the person's own choice (a key, 'none', or null for "let the
   * subject decide"). Without `onSpecializationChange` there is no chip, no menu item and no /specialize.
   */
  specialization?: TerminalSpecialization | null;
  specializations?: TerminalSpecializationOption[];
  specializationChoice?: string | null;
  onSpecializationChange?: (key: string | null) => void;
  /** Where the guides are edited, linked from the picker. */
  manageSpecializationsHref?: string | null;
  /** Apply or dismiss fields drafted for the page's record (1.55.0); `proposalState` is what was done. */
  onProposal?: (turnId: string, action: 'apply' | 'dismiss') => void;
  proposalState?: (turnId: string) => 'applied' | 'dismissed' | null;
  history?: string[];
  /** Loading the console, or its history could not be read: a line says so. */
  loading?: boolean;

  mode: TerminalMode;
  onModeChange: (mode: TerminalMode) => void;
  /** The modes Alt+M cycles through (1.45.0). Default Build and Plan first; add `brainstorm` to offer it. */
  modes?: TerminalMode[];
  /** How capable a model answers, and how hard it thinks (1.45.0): host-owned; omit to offer neither. */
  level?: TerminalLevel;
  levels?: TerminalLevel[];
  onLevelChange?: (level: TerminalLevel) => void;
  effort?: TerminalEffort;
  efforts?: TerminalEffort[];
  onEffortChange?: (effort: TerminalEffort) => void;
  /** "Try again at Pro" on a failed answer: the ask's turn id and the level to try it at. */
  onRetry?: (turnId: string, level: TerminalLevel, effort?: TerminalEffort) => void;
  /** The person's answers to the assistant's questions (the multiple-choice tool). */
  onAnswer?: (turnId: string, answers: TerminalAnswer[]) => void;
  /** "Do this" on a suggestion, "Build this" on a recommendation: the host runs it as the next ask. */
  onSuggestion?: (text: string) => void;
  /**
   * An element named in an outcome's "what changed" list (1.53.0): the host shows it (selects it on the
   * canvas, scrolls to it). Without it the list is plain text.
   */
  onElement?: (uid: string) => void;
  /** `/cost` (1.53.0): what this session has cost, by level, read when the view opens. Without it, no /cost. */
  onUsage?: () => Promise<TerminalUsage | null>;
  /** The person's own commands (1.53.0): `/name` sends the ask saved under it. */
  savedCommands?: TerminalSavedCommand[];
  /** Keep the person's commands (add, change, delete, `/save`). Without it, no /save and no editor. */
  onSavedCommandsChange?: (next: TerminalSavedCommand[]) => void;
  /** `/compare` (1.53.0): check the subject against the picture it was built from. The host runs it. */
  onCompare?: () => void;
  /**
   * The console's text size (1.54.0, owner 2026-11-10: "zoom: in (Ctrl +) bigger text, out (Ctrl -) smaller
   * text"): a factor, 1 the usual size, one of TERMINAL_ZOOMS. The host keeps it, like the theme. Without
   * `onZoomChange` the keys stay the browser's.
   */
  zoom?: number;
  onZoomChange?: (zoom: number) => void;
  /** Minutes away before a recap is shown on return (1.45.0); null turns it off. Default 30. */
  recapAfterMinutes?: number | null;
  /**
   * `/recap off`, `/recap <minutes>` and the Settings view: the host keeps the choice. `from` says which
   * (1.48.0): a command wants a line saying what changed, a setting already shows its new value.
   */
  onRecapChange?: (minutes: number | null, from?: 'command' | 'settings') => void;
  /**
   * The assistant's own recap (1.51.0, owner 2026-11-09: "Recap should use AI"): called when a recap is
   * due (back after the set time, a session opened after a break, `/recap`) with the minutes away (null
   * when asked for). Resolve the lines, or null to keep the recap drawn from the turns. Omit: turns only.
   */
  onRecap?: (awayMinutes: number | null) => Promise<string[] | null>;
  /** Mark the tab title when an ask finishes while the tab is hidden. Default true. */
  notifyWhenDone?: boolean;
  /** The Settings view's "Mark the tab when done" (1.48.0): the host keeps the choice; omit to leave it out. */
  onNotifyWhenDoneChange?: (on: boolean) => void;
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
    history = [], loading = false, mode, onModeChange, modes = ['build', 'plan'], target = null, value, onChange, onAsk, composer, mentions, onStop, onCommand, onRewind,
    onBuildPlan, onDismissPlan, sessions, onSaveBrief, onClearDraft, theme, themes = TERMINAL_THEMES, onThemeChange, width, onWidthChange, onError, className = '',
    level = 'normal', levels = ALL_LEVELS, onLevelChange, effort = 'low', efforts = ALL_EFFORTS, onEffortChange, onRetry, onAnswer, onSuggestion, onElement, onUsage, savedCommands = [], onSavedCommandsChange, onCompare, zoom = 1, onZoomChange,
    recapAfterMinutes = 30, onRecapChange, onRecap, notifyWhenDone = true, onNotifyWhenDoneChange,
    specialization = null, specializations = [], specializationChoice = null, onSpecializationChange, manageSpecializationsHref = null, onProposal, proposalState,
  } = props;
  const [view, setView] = useState<View | null>(null);
  const [rewindFrom, setRewindFrom] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [clearedThrough, setClearedThrough] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // What the person opened (thinking, a long reply, a rewound turn), by line key: folded, never cut.
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set());
  const dock = useTerminalDock(width, onWidthChange);
  const words = useMemo(() => ({ assistant: assistantName, subject: subjectNoun }), [assistantName, subjectNoun]);
  const active = terminalTheme(theme, themes);
  const working = live !== null;
  // A recap describes the session as it stood: once the turns move on (a new answer, a rewind) it is no
  // longer drawn, so it never states something stale.
  const recaps = useTerminalRecap({ turns, words, afterMinutes: recapAfterMinutes, working, loading, sessionId: session?.id ?? null, fetchRecap: onRecap });
  const recap = recaps.recap;
  const lines = useMemo(
    () => toLines(turns, { session, live, expanded, opened, notes, recap, clearedThrough: clearedThrough && turns.some((t) => t.id === clearedThrough) ? clearedThrough : null, assistantName, proposalState }),
    [turns, session, live, expanded, opened, notes, recap, clearedThrough, assistantName, proposalState],
  );
  // The assistant's last word asked questions and nothing has run since: they take the composer's place
  // (Claude Code), unless the person chose "Chat about this" for them (`aside`, by their line key).
  const [aside, setAside] = useState<string | null>(null);
  // Where the person had got with them (picks, typed answers, tab), kept while they are set aside.
  const [questionDraft, setQuestionDraft] = useState<{ key: string; draft: TerminalQuestionDraft } | null>(null);
  const lastTurn = turns.at(-1);
  const openQuestions =
    onAnswer && !working && lastTurn && lastTurn.role === 'assistant' && !lastTurn.rewound && (lastTurn.structured?.questions?.length ?? 0) > 0
      ? { key: `${lastTurn.id}:question`, turnId: lastTurn.id, questions: lastTurn.structured?.questions ?? [] }
      : null;
  const asking = openQuestions && aside !== openQuestions.key && view === null ? openQuestions : null;
  const hidden = useMemo(() => {
    const out: TerminalCommandName[] = [];

    if (!onLevelChange) out.push('level');
    if (!onEffortChange) out.push('effort');
    if (!modes.includes('brainstorm')) out.push('brainstorm');
    if (!onUsage) out.push('cost');
    if (!onCompare) out.push('compare');
    if (!onSavedCommandsChange) out.push('save');
    if (!onSpecializationChange) out.push('specialize');

    return out;
  }, [onLevelChange, onEffortChange, modes, onUsage, onCompare, onSavedCommandsChange, onSpecializationChange]);
  // `/save name`: the commands view opens with the last ask under that name.
  const [commandDraft, setCommandDraft] = useState<TerminalSavedCommand | null>(null);
  const nextMode = () => modes[(modes.indexOf(mode) + 1) % modes.length] ?? 'build';
  const toggleOpen = useCallback((key: string) => {
    setOpened((prev) => {
      const next = new Set(prev);

      if (next.has(key)) next.delete(key);
      else next.add(key);

      return next;
    });
  }, []);

  useDoneMark(working, notifyWhenDone, assistantName);
  const scroll = useAutoscroll<HTMLDivElement>({ watch: lines });
  const panelTitle = title ?? `${assistantName} console`;
  const inputWrap = useRef<HTMLDivElement | null>(null);

  // The composer, or the questions standing in its place.
  const focusComposer = () => inputWrap.current?.querySelector<HTMLElement>('textarea, [data-ai-question] [data-row]')?.focus();

  // Opening the console puts the cursor in it (a fresh page opens straight into an ask).
  useEffect(() => {
    if (open) inputWrap.current?.querySelector<HTMLElement>('textarea, [data-ai-question] [data-row]')?.focus();
  }, [open]);

  // The questions answered (or set aside), the cursor goes back to the composer, as Claude Code returns
  // to its prompt (1.47.2). The picker held the focus, and when it left, the focus fell to the page: the
  // console's keys stopped, so Esc no longer stopped the run the answers had just started (test box,
  // 2026-11-09). Only when the focus is lost or still in the console: it never pulls the cursor away.
  const askingKey = asking?.key ?? null;
  const wasAsking = useRef<string | null>(null);

  useEffect(() => {
    const was = wasAsking.current;

    wasAsking.current = askingKey;
    // A view opened over the questions keeps its own focus.
    if (was === null || askingKey !== null || view !== null) return;

    const active = document.activeElement;
    const here = inputWrap.current?.closest('[data-ai-terminal]');

    if (active === null || active === document.body || Boolean(here?.contains(active))) {
      inputWrap.current?.querySelector<HTMLElement>('textarea')?.focus();
    }
  }, [askingKey]);

  const openView = (next: View) => {
    setMenuOpen(false);
    setSearching(false);
    if (next === 'resume') sessions?.onLoad();
    setView(next);
  };

  const closeView = () => {
    setView(null);
    setRewindFrom(null);
    requestAnimationFrame(focusComposer);
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
    if (name === 'specialize') {
      const pick = arg === '' ? undefined : specializationFromArg(arg, specializations);

      return pick === undefined ? openView('specialize') : onSpecializationChange?.(pick);
    }
    if (name === 'plan') return onModeChange(mode === 'plan' ? 'build' : 'plan');
    if (name === 'brainstorm') return onModeChange(mode === 'brainstorm' ? 'build' : 'brainstorm');
    if (name === 'level' || name === 'effort') {
      const pick = arg.toLowerCase();

      if (name === 'level' && (levels as string[]).includes(pick)) return onLevelChange?.(pick as TerminalLevel);
      if (name === 'effort' && (efforts as string[]).includes(pick)) return onEffortChange?.(pick as TerminalEffort);

      return openView('tuning');
    }
    if (name === 'recap') {
      const minutes = Number(arg);

      if (arg === 'off') return onRecapChange?.(null, 'command');
      if (arg !== '' && Number.isFinite(minutes) && minutes > 0) return onRecapChange?.(Math.round(minutes), 'command');

      return recaps.show();
    }
    if (name === 'export') return void exportTranscript();
    if (name === 'cost' && onUsage) return openView('cost');
    if (name === 'compare' && onCompare) return onCompare();
    if (name === 'save' && onSavedCommandsChange) {
      setCommandDraft({ name: arg.toLowerCase().replace(/^\//, '').replace(/\s+/g, '-'), ask: history[0] ?? '', description: null });

      return openView('commands');
    }
    if (name === 'clear') setClearedThrough(null);

    const panelView = PANEL_VIEWS[name];

    if (panelView) return openView(panelView);

    onCommand(name, arg);
  };

  const zoomTo = useCallback((step: 1 | -1 | 0) => onZoomChange?.(stepZoom(zoom, step)), [onZoomChange, zoom]);

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
    onToggleMode: () => onModeChange(nextMode()),
    onToggleDetails: () => setExpanded((e) => !e),
    onClearScreen: () => setClearedThrough(turns.at(-1)?.id ?? null),
    onHelp: () => openView('help'),
    onSearch: () => setSearching(true),
    onZoom: onZoomChange ? zoomTo : undefined,
  });
  // The text size: the transcript, the views and the composer grow; the bars stay as they are.
  const zoomed: React.CSSProperties | undefined = zoom === 1 ? undefined : { zoom };

  // Every view and command a person may look for without knowing its slash name (1.48.0, owner
  // 2026-11-09: "level and effort should be added as an option/entry on the kebab menu").
  const menu: TerminalMenuItem[] = [
    { label: 'New session', run: () => command('clear', '') },
    { label: 'Summarise the session', run: () => command('compact', '') },
    { label: 'Context', run: () => openView('context') },
    { label: 'Brief', run: () => openView('brief') },
    ...(onSpecializationChange ? [{ label: 'Specialization', run: () => openView('specialize') }] : []),
    ...(onLevelChange || onEffortChange ? [{ label: 'Level and effort', run: () => openView('tuning') }] : []),
    { label: 'Recap: where the session stands', run: () => command('recap', '') },
    ...(onCompare ? [{ label: 'Compare with the picture', run: () => command('compare', '') }] : []),
    ...(onUsage ? [{ label: 'Session cost', run: () => openView('cost') }] : []),
    ...(onSavedCommandsChange ? [{ label: 'Your commands', run: () => { setCommandDraft(null); openView('commands'); } }] : []),
    { label: 'Export transcript', run: () => command('export', '') },
    { label: 'Settings', run: () => openView('settings') },
    { label: 'Commands and shortcuts', run: () => openView('help') },
  ];

  // A click in the transcript that is not on something usable (a fold, a button, a link, selected
  // text) puts the cursor in the composer (1.48.0, owner 2026-11-09: "mirroring Claude Code").
  const clickToCompose = (event: React.MouseEvent<HTMLElement>) => {
    if (event.detail > 1 || event.button !== 0) return;
    if ((event.target as HTMLElement).closest(OWN_CLICK)) return;
    if ((window.getSelection()?.toString() ?? '') !== '') return;
    focusComposer();
  };

  const body = (() => {
    switch (view) {
      case 'context':
        return <ContextView size={size} assistant={assistantName} onBack={closeView} onCompact={() => { closeView(); onCommand('compact', ''); }} onClear={() => { closeView(); command('clear', ''); }} />;
      case 'resume':
        return <ResumeView sessions={sessions?.list ?? null} currentId={session?.id ?? null} subject={subjectNoun} onBack={closeView} onOpen={(id) => { closeView(); sessions?.onOpen(id); }} />;
      case 'help':
        return <HelpView words={words} hidden={hidden} onBack={closeView} />;
      case 'tuning':
        return <TuningView assistant={assistantName} levels={levels} level={level} onLevel={onLevelChange} efforts={efforts} effort={effort} onEffort={onEffortChange} onBack={closeView} />;
      case 'settings':
        return (
          <SettingsView
            assistant={assistantName}
            levels={levels}
            level={level}
            onLevel={onLevelChange}
            efforts={efforts}
            effort={effort}
            onEffort={onEffortChange}
            recapAfterMinutes={recapAfterMinutes}
            onRecap={onRecapChange ? (minutes) => onRecapChange(minutes, 'settings') : undefined}
            onRecapNow={() => { closeView(); recaps.show(); }}
            notifyWhenDone={notifyWhenDone}
            onNotify={onNotifyWhenDoneChange}
            zoom={zoom}
            onZoom={onZoomChange}
            themes={themes}
            theme={active.key}
            onTheme={onThemeChange}
            onBack={closeView}
          />
        );
      case 'cost':
        return onUsage ? <CostView assistant={assistantName} load={onUsage} onBack={closeView} /> : null;
      case 'commands':
        return onSavedCommandsChange ? (
          <SavedCommandsView key={commandDraft?.name ?? ''} saved={savedCommands} draft={commandDraft} onSave={onSavedCommandsChange} onBack={() => { setCommandDraft(null); closeView(); }} />
        ) : null;
      case 'theme':
        return <ThemeView themes={themes} current={active.key} onPick={onThemeChange} onBack={closeView} />;
      case 'specialize':
        return (
          <SpecializationView
            assistant={assistantName}
            subject={subjectNoun}
            current={specialization}
            chosen={specializationChoice}
            options={specializations}
            manageHref={manageSpecializationsHref}
            onPick={(key) => { closeView(); onSpecializationChange?.(key); }}
            onBack={closeView}
          />
        );
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
      onFocus={recaps.returned}
      onPointerDown={recaps.touch}
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
        <TerminalMenu open={menuOpen} onOpenChange={setMenuOpen} items={menu} />
        <button type="button" onClick={onClose} aria-label={`Close the ${panelTitle} (Ctrl+~)`} title="Close (Ctrl+~)" className="rounded px-1.5 text-[var(--term-dim)] outline-none hover:text-[var(--term-text)] focus-visible:ring-1 focus-visible:ring-[var(--term-accent)]">×</button>
      </header>

      {/* A view opens OVER the transcript, which stays mounted (1.48.0): it used to be swapped out, so
          closing Help or Settings re-mounted it at the top of a long session instead of where it was. */}
      <div className="relative min-h-0 flex-1">
          <div ref={scroll.scrollRef} onScroll={scroll.onScroll} onClick={clickToCompose} role="log" aria-label="Transcript" aria-hidden={body ? true : undefined} inert={body !== null} className="h-full cursor-text overflow-y-auto px-4 py-3">
            <div style={zoomed}>
            {loading ? <p className="text-[var(--term-dim)]">Opening the session…</p> : null}
            {!loading && lines.length === 0 ? (
              <div className="text-[var(--term-dim)]">
                <p className="text-[var(--term-text)]">Describe what you want on this {subjectNoun}, and {assistantName} will build it.</p>
                <p className="mt-2">/ commands · @ aim at an element · ↑ earlier asks · ? shortcuts · alt+m {modes.includes('brainstorm') ? 'plan first or brainstorm' : 'plan first'}</p>
                {brief ? <p className="mt-2">Brief: <span className="text-[var(--term-text)]">{brief.text}</span></p> : null}
              </div>
            ) : null}
            <TerminalLines
              lines={lines}
              onRewind={(turnId) => { setRewindFrom(turnId); openView('rewind'); }}
              onBuildPlan={onBuildPlan}
              onDismissPlan={onDismissPlan}
              onToggle={toggleOpen}
              onRetry={onRetry}
              asking={asking?.key ?? null}
              onReopenQuestions={onAnswer ? () => { setAside(null); requestAnimationFrame(focusComposer); } : undefined}
              onSuggestion={onSuggestion ? (text) => { recaps.dismiss(); onSuggestion(text); } : undefined}
              onElement={onElement}
              onCompare={onCompare}
              onProposal={onProposal}
            />
            </div>
          </div>
          {!scroll.isPinned && body === null ? (
            <button type="button" onClick={scroll.scrollToBottom} className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-[var(--term-border)] bg-[var(--term-bar)] px-3 py-0.5 text-[11px] text-[var(--term-text)] shadow outline-none focus-visible:ring-1 focus-visible:ring-[var(--term-accent)]">
              Jump to latest ↓
            </button>
          ) : null}
          {body ? <div className="absolute inset-0 flex flex-col bg-[var(--term-bg)]" style={zoomed}>{body}</div> : null}
      </div>

      <TerminalStatus
        working={working}
        verb={live ? (live.steps.at(-1)?.text ?? live.verb) : null}
        startedAt={live?.startedAt ?? null}
        stopping={live?.stopping}
        mode={mode}
        onToggleMode={() => onModeChange(nextMode())}
        target={target}
        size={size}
        onContext={() => openView('context')}
        tuning={onLevelChange || onEffortChange ? { level: onLevelChange ? level : null, effort: onEffortChange ? effort : null, onOpen: () => openView('tuning') } : null}
        specialization={
          onSpecializationChange
            ? {
                label: specialization ? (specialization.key === null ? `${assistantName} picks` : specialization.name) : 'No guide',
                title: `Specialization (/specialize): ${specializationWhy(specialization, subjectNoun)}`,
                onOpen: () => openView('specialize'),
              }
            : null
        }
      />

      <div ref={inputWrap} className="shrink-0 bg-[var(--term-bar)] px-2 pb-2" style={zoomed}>
        {asking && onAnswer ? (
          <TerminalQuestionBlock
            key={asking.key}
            questions={asking.questions}
            draft={questionDraft?.key === asking.key ? questionDraft.draft : undefined}
            onDraft={(draft) => setQuestionDraft({ key: asking.key, draft })}
            onAnswer={(answers) => {
              setQuestionDraft(null);
              recaps.dismiss();
              recaps.touch();
              onAnswer(asking.turnId, answers);
            }}
            onChat={() => {
              setAside(asking.key);
              // The draft the person had is still theirs: the composer comes back holding it.
              requestAnimationFrame(focusComposer);
            }}
          />
        ) : (
          <TerminalInput
            value={value}
            onChange={onChange}
            onAsk={(text, files, input) => {
              recaps.dismiss();
              recaps.touch();
              onAsk(text, files, input);
            }}
            onCommand={command}
            history={history}
            words={words}
            hiddenCommands={hidden}
            saved={savedCommands}
            mentions={mentions}
            composer={composer}
            searching={searching}
            onSearchClose={() => setSearching(false)}
          />
        )}
      </div>

      <div
        {...dock.handle}
        aria-label="Resize the console"
        className="absolute inset-y-0 right-0 w-1.5 cursor-col-resize outline-none hover:bg-[var(--term-selection)] focus-visible:bg-[var(--term-accent)]"
      />
    </aside>
  );
}
