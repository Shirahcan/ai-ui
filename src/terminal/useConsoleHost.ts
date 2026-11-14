'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { AttachmentChip } from '../types';
import { elementsOf, shortenAsk, type AskOptions, type ConsoleHostOptions, type ConsoleRunState } from './consoleHostPorts';
import type { AssistantTerminalProps } from './AssistantTerminal';
import type { TerminalRewindChoice } from './TerminalRewind';
import type { TerminalCommandName } from './commands';
import { tuningFor, useConsolePrefs } from './useConsolePrefs';
import type { TerminalAnswer, TerminalEffort, TerminalLevel, TerminalLive, TerminalMode, TerminalStep, TerminalTurn } from './types';

/**
 * The console's behaviour for one subject (shared console C4c, moved from Portify's usePorterConsole): the product's
 * own engine underneath (asking, queueing, Stop, merging, plans) is the runner; this adds the session, the steps and
 * thinking as they stream, the commands and the rewind, and hands AssistantTerminal its props.
 */
export function useConsoleHost<K extends string, D, S extends ConsoleRunState>({
  api,
  kind,
  id,
  console: data,
  runner: porter,
  target,
  subject,
  verbFor,
  assistantName,
  storagePrefix,
  extraProps,
  answered,
  onError,
  modes,
}: ConsoleHostOptions<K, D, S>): Omit<AssistantTerminalProps, 'open' | 'onClose' | 'composer' | 'className'> {
  const { noun: subjectNoun, nodes, labelFor, restoreDesign, showElement, flashChanges, capture, upload } = subject;
  const [value, setValue] = useState('');
  const [liveAsk, setLiveAsk] = useState<TerminalLive['ask']>(null);
  // When the person sent it: the ask is drawn at once, before the session and the subject are saved.
  const [askedAt, setAskedAt] = useState<number | null>(null);
  const [settling, setSettling] = useState<TerminalLive | null>(null);
  const [asked, setAsked] = useState<string[]>([]);
  const prefs = useConsolePrefs({ storagePrefix, note: data.note });
  const { level, effort } = prefs;
  const lastLive = useRef<TerminalLive | null>(null);
  const turns: TerminalTurn[] = useMemo(() => data.data?.turns ?? [], [data.data]);
  // The answer an ask is waiting for: when a newer one lands, what it changed flashes. Only after an ask here:
  // opening a subject or an older session flashes nothing.
  const lastAnswer = useMemo(() => [...turns].reverse().find((t) => t.role === 'assistant') ?? null, [turns]);
  const lastAnswerId = useRef<string | null>(null);
  const awaiting = useRef<string | null | false>(false);

  useEffect(() => {
    lastAnswerId.current = lastAnswer?.id ?? null;

    if (awaiting.current === false || !lastAnswer || lastAnswer.id === awaiting.current) return;
    awaiting.current = false;

    const uids = (lastAnswer.structured?.outcome?.changes ?? []).filter((c) => c.how !== 'removed').map((c) => c.uid);

    if (uids.length > 0) flashChanges?.(uids);
  }, [lastAnswer, flashChanges]);
  const { building } = porter;

  const live: TerminalLive | null = useMemo(() => {
    // Sent, not running yet (a first ask starts a session and saves the subject first): the ask is on screen at
    // once, as a terminal prints a prompt the moment it is sent.
    if (!building) return settling ?? (liveAsk && askedAt !== null ? { startedAt: askedAt, ask: liveAsk, steps: [], verb: 'Getting ready', queued: porter.queued } : null);

    const steps: TerminalStep[] = (building.steps ?? []).map((s) => ({ kind: s.kind, text: s.text, ms: s.ms, detail: s.detail }));

    if (building.thinking) steps.push({ kind: 'think', text: 'Thinking', detail: building.thinking });

    // Timed from when the person sent it, so the clock and the lines carry on from "Getting ready".
    return { startedAt: askedAt ?? building.startedAt, ask: liveAsk, steps, verb: verbFor(building, subjectNoun), queued: porter.queued, stopping: building.stopping };
  }, [askedAt, building, liveAsk, porter.queued, settling, subjectNoun, verbFor]);

  // Kept so the lines stay on screen between the run landing and the recorded session arriving.
  useEffect(() => {
    lastLive.current = live;
  }, [live]);

  const mode: TerminalMode = porter.brainstorm ? 'brainstorm' : porter.planFirst ? 'plan' : 'build';

  const ask = useCallback(
    async (text: string, files: AttachmentChip[], options: AskOptions = {}) => {
      const meta = { target: target.node ? labelFor(target.path ?? []) : null, files: files.map((f) => f.name), answers: options.answers };

      setValue('');
      setAsked((current) => [text, ...current.filter((a) => a !== text)]);
      awaiting.current = lastAnswerId.current;
      // The level and effort this ask runs at: its own (a retry one level up), else the console's.
      data.setTuning(tuningFor(options.level ?? level, options.effort ?? effort));

      // A run is under way: the ask runs next; the console shows it as queued.
      if (porter.asking) {
        void porter.ask(text, target.path ?? null, files.map((f) => f.id), options.mode);

        return;
      }

      // The answers ride with the ask under way, so the console shows them under the questions at once.
      setLiveAsk({ text, target: meta.target, files: meta.files, mode: options.mode ?? mode, ...(meta.answers?.length ? { answers: meta.answers } : {}) });
      setAskedAt(Date.now());
      await data.ensureSession(text);
      data.setAskMeta(meta);

      const line = await porter.ask(text, target.path ?? null, files.map((f) => f.id), options.mode);

      // Hold the finished lines until the session (written by the worker) comes back with them.
      setSettling(lastLive.current);
      await data.refresh();
      setSettling(null);
      setLiveAsk(null);
      setAskedAt(null);

      if (line === null && options.ownWords !== false) setValue((current) => (current === '' ? text : current));
      else if (porter.answer && !data.sessionId()) data.note(porter.answer);

      answered?.(line);
    },
    [answered, data, effort, labelFor, level, mode, porter, target],
  );

  /** "Try again at Pro" and "Think harder": the same ask, once, at the next level or effort, in its own mode. */
  const retry = useCallback(
    (turnId: string, at: TerminalLevel, deeper?: TerminalEffort) => {
      const turn = turns.find((t) => t.id === turnId);
      const text = turn?.body?.trim();
      const askedIn = turn?.structured?.mode;
      // The files go again too: the ask keeps their ids beside the names.
      const ids = ((turn?.structured as { file_ids?: unknown } | null | undefined)?.file_ids ?? []) as unknown[];
      const names = turn?.structured?.files ?? [];
      const files: AttachmentChip[] = ids.flatMap((fileId, i) => (typeof fileId === 'string' ? [{ id: fileId, name: names[i] ?? 'file', mime: '', size: 0 }] : []));

      if (text) void ask(text, files, { level: at, ...(deeper ? { effort: deeper } : {}), mode: askedIn === 'brainstorm' || askedIn === 'plan' ? askedIn : 'build', answers: turn?.structured?.answers });
    },
    [ask, turns],
  );

  /** The person's answers to the assistant's questions: the ask they answer, again, with the answers beside it. */
  const answer = useCallback(
    (turnId: string, answers: TerminalAnswer[]) => {
      const at = turns.findIndex((t) => t.id === turnId);
      const asking = at > 0 && turns[at - 1]?.role === 'user' ? turns[at - 1] : null;
      // The ask again, in the person's own words; the answers travel beside it, never folded into the words.
      const text = asking?.body?.trim() || answers.map((a) => `${a.question} ${a.answer}`).join('\n');

      void ask(text, [], { answers, mode: asking?.structured?.mode === 'brainstorm' ? 'brainstorm' : 'build' });
    },
    [ask, turns],
  );

  const restoreFrom = useCallback(
    async (turnId: string): Promise<boolean> => {
      const at = turns.findIndex((t) => t.id === turnId);
      const reply = at >= 0 && turns[at + 1]?.role === 'assistant' ? turns[at + 1] : null;
      const point = reply?.structured?.checkpoint_id;

      if (!point) {
        data.note(`There is no saved ${subjectNoun} to put back for that ask.`, 'fail');

        return false;
      }

      restoreDesign(await api.checkpoint(kind, id, point));

      return true;
    },
    [api, data, id, kind, restoreDesign, subjectNoun, turns],
  );

  const onRewind = useCallback(
    async (turnId: string, choice: TerminalRewindChoice, focus?: string) => {
      const session = data.sessionId();

      if (!session) return;

      try {
        if (choice === 'summarise_from' || choice === 'summarise_upto') {
          data.accept(await api.compact(kind, id, session, { focus, range: choice === 'summarise_from' ? 'from' : 'upto', turn: turnId }));
          data.note('Summarised. The folded turns stay on screen, dimmed.', 'ok');

          return;
        }

        if ((choice === 'design' || choice === 'both') && !(await restoreFrom(turnId))) return;
        if (choice === 'conversation' || choice === 'both') data.accept(await api.rewind(kind, id, session, turnId));

        const askText = turns.find((t) => t.id === turnId)?.body ?? '';

        data.note(choice === 'conversation' ? `Rewound the conversation to before "${shortenAsk(askText)}".` : `Put the ${subjectNoun} back as it was before "${shortenAsk(askText)}".`, 'ok');
        if (choice !== 'design') setValue((current) => (current === '' ? askText : current));
      } catch {
        // The product's fetcher said why; nothing here changed.
      }
    },
    [api, data, id, kind, restoreFrom, subjectNoun, turns],
  );

  const onCommand = useCallback(
    async (name: TerminalCommandName, arg: string) => {
      const session = data.sessionId();

      try {
        if (name === 'clear') {
          data.clearNotes();
          data.accept(await api.start(kind, id));
        } else if (name === 'compact') {
          if (!session) return data.note('Nothing to summarise yet.');
          const result = await api.compact(kind, id, session, { focus: arg || undefined });

          data.accept(result);
          data.note(result.compacted ? 'Session summarised. I read the summary instead of the older turns.' : 'Nothing older to summarise yet.', 'ok');
        } else if (name === 'undo') {
          const line = await porter.ask('undo', null);

          if (line) data.note(line, 'ok');
        }
      } catch {
        // The product's fetcher said why.
      }
    },
    [api, data, id, kind, porter],
  );

  const buildPlan = useCallback(() => {
    // Building a plan is an ask too: what it changes flashes when its answer lands.
    awaiting.current = lastAnswerId.current;

    if (porter.plan) {
      setLiveAsk({ text: porter.plan.instruction, mode: 'build' });
      setAskedAt(Date.now());
      void porter.buildPlan().then(async (line) => {
        await data.refresh();
        setLiveAsk(null);
        setAskedAt(null);
        answered?.(line);
      });

      return;
    }

    // A plan from an earlier visit: built with the steps it set out, as the ask it answered.
    let at = -1;

    for (let i = turns.length - 1; i >= 0; i--) {
      if (turns[i]?.role === 'assistant' && turns[i]?.structured?.plan) {
        at = i;
        break;
      }
    }

    const planTurn = at >= 0 ? turns[at] : null;
    const askTurn = at > 0 && turns[at - 1]?.role === 'user' ? turns[at - 1] : null;

    if (!planTurn?.structured?.plan || !askTurn?.body) return;

    const instruction = askTurn.body;

    porter.setPlanFirst(false);
    setLiveAsk({ text: instruction, mode: 'build' });
    setAskedAt(Date.now());
    void porter.buildAgreed(instruction, planTurn.structured.plan.steps ?? []).then(async (line) => {
      setSettling(lastLive.current);
      await data.refresh();
      setSettling(null);
      setLiveAsk(null);
      setAskedAt(null);
      answered?.(line);
    });
  }, [answered, data, porter, turns]);

  /** Compare with the picture: the design as drawn now, beside the person's last picture in the session. */
  const compare = useCallback(async () => {
    if (!capture || !upload) return;

    try {
      const shot = await capture();

      if (!shot) {
        data.note(`The ${subjectNoun} could not be captured just now. Try again in a moment.`, 'fail');

        return;
      }

      const chip = await upload(shot);

      await ask(`Compare the ${subjectNoun} with my picture`, [chip], { mode: 'compare', ownWords: false });
    } catch (error) {
      // A refused upload (too large) is not an HTTP status the product's fetcher reports by itself.
      onError(error);
    }
  }, [ask, capture, data, onError, subjectNoun, upload]);

  return {
    ...extraProps,
    ...prefs.props,
    assistantName,
    subjectLabel: data.data?.subject.label ?? '',
    subjectNoun,
    session: data.data?.session ?? null,
    turns,
    live,
    notes: data.notes,
    size: data.data?.size ?? null,
    brief: data.data?.brief ?? null,
    history: [...asked, ...(data.data?.history ?? []).filter((h) => !asked.includes(h))],
    loading: data.loading,
    mode,
    modes: modes ?? ['build', 'plan', 'brainstorm'],
    onModeChange: (next) => {
      porter.setPlanFirst(next === 'plan');
      porter.setBrainstorm(next === 'brainstorm');
    },
    onRetry: retry,
    onAnswer: answer,
    // "Do this" on a suggestion and "Build this" on a recommendation: built as the next ask.
    onSuggestion: (text) => void ask(text, [], { mode: 'build' }),
    // What changed: each element line shows that element.
    onElement: showElement,
    // /cost: what this session has cost, by level.
    onUsage: async () => {
      const session = data.sessionId();

      if (!session) return { levels: [], total: { calls: 0, tokens_in: 0, tokens_out: 0, cost_usd: 0 } };

      try {
        return await api.usage(kind, id, session);
      } catch {
        // The product's fetcher reports a real fault; the view says it cannot be read.
        return null;
      }
    },
    // The person's own commands (saved asks), kept with their space.
    savedCommands: data.commands,
    onSavedCommandsChange: (next) => void data.saveCommands(next),
    onCompare: capture && upload ? () => void compare() : undefined,
    // The assistant writes the recap itself; null keeps the console's own.
    onRecap: async (awayMinutes) => {
      const session = data.sessionId();

      if (!session) return null;

      try {
        return (await api.recap(kind, id, session, awayMinutes)).recap?.lines ?? null;
      } catch {
        // The product's fetcher reports a real fault; the console keeps its own recap.
        return null;
      }
    },
    target: target.node ? { label: labelFor(target.path ?? []), onClear: target.clear } : null,
    value,
    onChange: setValue,
    onAsk: (text, files) => void ask(text, files),
    mentions: {
      search: async (query: string) =>
        elementsOf(nodes, labelFor)
          .filter((e) => e.label.toLowerCase().includes(query.toLowerCase()))
          .slice(0, 8)
          .map((e) => ({ id: e.path.join('.'), label: e.label, detail: e.path.length > 1 ? 'inside a section' : undefined })),
      onAim: (pathId: string) => target.add(pathId.split('.').map(Number)),
    },
    onStop: porter.stop,
    onCommand: (name, arg) => void onCommand(name, arg),
    onRewind: (turnId, choice, focus) => void onRewind(turnId, choice, focus),
    onBuildPlan: buildPlan,
    onDismissPlan: () => porter.dismissPlan(),
    sessions: {
      list: data.sessions,
      onLoad: () => void data.loadSessions(),
      onOpen: (session: string) => void api.openSession(kind, id, session).then(data.accept).catch(() => undefined),
    },
    onSaveBrief: (text) =>
      void api
        .saveBrief(kind, id, text)
        .then((brief) => {
          if (data.data) data.accept({ ...data.data, brief });
          data.note(brief ? 'Brief saved. I read it with every ask on this ' + subjectNoun + '.' : 'Brief removed.', 'ok');
        })
        .catch(() => undefined),
    onClearDraft: (text) => setAsked((current) => [text, ...current]),
    onError,
  };
}
