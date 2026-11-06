import { useEffect, useRef } from 'react';
import type { Dictation } from './useDictation';

/**
 * Hands-free conversation (1.34.0): talk, and the message sends itself when you stop; the answer is
 * read aloud, then the microphone opens again. Like Claude's voice mode, built only from parts already
 * here (dictation through the product's own route, the browser's on-device speech).
 *
 * ⚠ "STOPPED TALKING" IS STOP, THEN IDLE, NEVER A TIMER ON THE TEXT. Pieces land every ~3 s while
 * someone keeps talking, so a quiet box says nothing about whether they have finished, and the last
 * piece is still being transcribed when they go quiet. So after ~1.8 s with no voice this calls the
 * ordinary Stop, which flushes what is held and waits for every piece in flight; only when dictation
 * reaches `idle` is the box sent. Nothing is lost and nothing is sent half-transcribed.
 *
 * ⚠ THE MICROPHONE IS CLOSED WHILE AN ANSWER IS READ ALOUD (`suspended`), or it would transcribe the
 * assistant's own voice back into the box. iOS starts audio only inside a tap, so there the
 * microphone may not reopen by itself; the status line then says to tap it, as dictation always does.
 */
export interface HandsFreeState {
  active: boolean;
  /** True while an answer is being read aloud: the microphone stays closed. */
  suspended: boolean;
}

const QUIET_MS = 1800;
/** The level (0..1) above which a frame counts as the person talking. */
const VOICE_LEVEL = 0.08;

export function useHandsFree(
  handsFree: HandsFreeState | undefined,
  dictation: Dictation,
  busy: boolean,
  value: string,
  send: () => void,
): void {
  const active = handsFree?.active === true;
  const suspended = handsFree?.suspended === true;
  const lastVoice = useRef(0);
  const spoke = useRef(false);
  const sendWhenIdle = useRef(false);
  /*
   * ⚠ ONE START PER IDLE SPELL. `start()` replaces a running session, and this effect re-runs on every
   * render while the state still reads idle, so without this it threw away the session it had just
   * opened (and on iOS the replacement is no longer inside the tap that allowed the microphone).
   */
  const asked = useRef(false);
  useEffect(() => {
    if (dictation.state !== 'idle') asked.current = false;
  }, [dictation.state]);
  const valueRef = useRef(value);
  const sendRef = useRef(send);
  useEffect(() => {
    valueRef.current = value;
    sendRef.current = send;
  });

  // Listen whenever it is the person's turn; close the microphone while the assistant answers or speaks.
  useEffect(() => {
    if (!active || !dictation.supported) return;
    if ((busy || suspended) && dictation.listening) {
      dictation.stop();
    } else if (!busy && !suspended && dictation.state === 'idle' && !sendWhenIdle.current && !asked.current) {
      asked.current = true;
      spoke.current = false;
      dictation.start();
    }
  }, [active, busy, suspended, dictation.state, dictation.listening, dictation.supported, dictation]);

  // Hearing the person.
  useEffect(() => {
    if (!active || dictation.level < VOICE_LEVEL) return;
    lastVoice.current = Date.now();
    spoke.current = true;
  }, [active, dictation.level]);

  // They went quiet: Stop, which flushes the held words and waits for the pieces still in flight.
  useEffect(() => {
    if (!active || dictation.state !== 'listening') return undefined;
    const timer = window.setInterval(() => {
      if (spoke.current && Date.now() - lastVoice.current > QUIET_MS) {
        sendWhenIdle.current = true;
        dictation.stop();
      }
    }, 250);

    return () => window.clearInterval(timer);
  }, [active, dictation.state, dictation]);

  // Everything has arrived: send what is in the box (nothing, if they only coughed).
  useEffect(() => {
    if (dictation.state !== 'idle' || !sendWhenIdle.current) return;
    sendWhenIdle.current = false;
    spoke.current = false;
    if (!active) return;
    if (valueRef.current.trim() !== '') {
      sendRef.current();
    } else {
      // Nothing to send (a cough, a door): listen again rather than sit closed.
      asked.current = true;
      dictation.start();
    }
  }, [active, dictation.state, dictation]);

  // Turning it off closes the microphone it opened (a tap on the mic afterwards is ordinary dictation).
  const wasActive = useRef(active);
  useEffect(() => {
    if (wasActive.current && !active) {
      sendWhenIdle.current = false;
      if (dictation.listening) dictation.stop();
    }
    wasActive.current = active;
  }, [active, dictation]);
}
