import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { microphoneSupported } from './microphone';
import { DictationSession, type DictationConfig, type DictationState } from './session';

export interface Dictation {
  state: DictationState;
  /** Microphone loudness 0..1 while listening, for the level ring. */
  level: number;
  /** Grey words from the on-device recogniser for the phrase being spoken ('' when there is none). */
  preview: string;
  /** One line for the person: "Listening...", an error in plain words, or null. */
  message: string | null;
  supported: boolean;
  listening: boolean;
  /** Call from the click: iOS only starts audio inside the gesture. */
  start: () => void;
  stop: () => void;
  toggle: () => void;
}

/**
 * Speak instead of typing. `onText` receives each finished phrase, in the order spoken; insert it with
 * `insertPhrase` (a textarea) or the editor's own insert command.
 */
export function useDictation(config: DictationConfig | undefined, onText: (text: string) => void): Dictation {
  const [state, setState] = useState<DictationState>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [preview, setPreview] = useState('');
  const [supported] = useState(() => microphoneSupported());

  // The latest config and callback, read by the session without restarting it on every render.
  const configRef = useRef(config);
  const onTextRef = useRef(onText);
  useLayoutEffect(() => {
    configRef.current = config;
    onTextRef.current = onText;
  });

  const sessionRef = useRef<DictationSession | null>(null);

  useEffect(() => () => sessionRef.current?.destroy(), []);

  const start = useCallback(() => {
    const current = configRef.current;
    if (!current) return;

    sessionRef.current?.destroy();
    const session = new DictationSession(
      {
        ...current,
        // Read the terms and callbacks at send time, so names that load later still help.
        transcribe: (blob, ctx) => (configRef.current ?? current).transcribe(blob, { ...ctx, terms: configRef.current?.terms ?? ctx.terms }),
        onError: (error) => configRef.current?.onError?.(error),
      },
      {
        onText: (text) => onTextRef.current(text),
        onState: (next, line) => {
          setState(next);
          setMessage(line);
          if (next !== 'listening') setPreview('');
        },
        onLevel: setLevel,
        onPreview: setPreview,
      },
    );
    sessionRef.current = session;
    void session.start();
  }, []);

  const stop = useCallback(() => sessionRef.current?.stop(), []);

  const listening = state === 'starting' || state === 'listening';

  const toggle = useCallback(() => {
    if (sessionRef.current && (sessionRef.current.current === 'starting' || sessionRef.current.current === 'listening')) {
      sessionRef.current.stop();
    } else {
      start();
    }
  }, [start]);

  return { state, level, preview, message, supported, listening, start, stop, toggle };
}
