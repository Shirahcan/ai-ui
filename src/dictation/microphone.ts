import { Resampler } from './audio';

/**
 * The microphone, as a stream of 16 kHz mono samples.
 *
 * ⚠ THE DEVICE RATE IS KEPT AND RESAMPLED HERE. Asking the AudioContext for 16 kHz works in Chrome
 * but Firefox refuses to connect a microphone to a context at a different rate, so the context
 * runs at the device's own rate and `Resampler` brings it down.
 *
 * ⚠ iOS SAFARI: the AudioContext must be created inside the tap that started dictation, or it stays
 * suspended and records nothing. `openMicrophone` is therefore called straight from the click.
 */
export interface Microphone {
  stop: () => void;
  /** The raw stream, so an on-device recogniser can share the same permission. */
  stream: MediaStream;
}

type AudioContextCtor = typeof AudioContext;

const TAP = `class AiDictationTap extends AudioWorkletProcessor {
  process(inputs) { const ch = inputs[0] && inputs[0][0]; if (ch) this.port.postMessage(ch.slice(0)); return true; }
}
registerProcessor('ai-dictation-tap', AiDictationTap);`;

export function microphoneSupported(): boolean {
  return typeof navigator !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia
    && typeof window !== 'undefined'
    && !!(window.AudioContext || (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext);
}

export async function openMicrophone(onSamples: (samples: Float32Array) => void): Promise<Microphone> {
  const Ctor: AudioContextCtor = window.AudioContext
    || (window as unknown as { webkitAudioContext: AudioContextCtor }).webkitAudioContext;
  const context = new Ctor();

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (error) {
    void context.close();
    throw error;
  }

  if (context.state === 'suspended') await context.resume().catch(() => undefined);

  const resampler = new Resampler(context.sampleRate);
  const source = context.createMediaStreamSource(stream);
  const deliver = (chunk: Float32Array) => {
    const out = resampler.push(chunk);
    if (out.length > 0) onSamples(out);
  };

  let node: AudioNode;
  let workletUrl: string | null = null;

  if (context.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
    workletUrl = URL.createObjectURL(new Blob([TAP], { type: 'application/javascript' }));
    await context.audioWorklet.addModule(workletUrl);
    const worklet = new AudioWorkletNode(context, 'ai-dictation-tap');
    worklet.port.onmessage = (event: MessageEvent<Float32Array>) => deliver(event.data);
    node = worklet;
  } else {
    // Older Safari: the deprecated processor is the only tap there is.
    const processor = context.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (event) => deliver(event.inputBuffer.getChannelData(0).slice(0));
    node = processor;
  }

  // Connected through a muted gain: some engines only pull audio through a node that reaches the output.
  const mute = context.createGain();
  mute.gain.value = 0;
  source.connect(node);
  node.connect(mute);
  mute.connect(context.destination);

  return {
    stream,
    stop: () => {
      try {
        source.disconnect();
        node.disconnect();
        mute.disconnect();
      } catch {
        // Already torn down.
      }
      // Releasing the tracks is what turns off the browser's "recording" dot.
      stream.getTracks().forEach((track) => track.stop());
      void context.close().catch(() => undefined);
      if (workletUrl) URL.revokeObjectURL(workletUrl);
    },
  };
}
