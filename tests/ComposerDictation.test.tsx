import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Composer } from '../src/components/Composer';

/**
 * Dictation into the shared composer. Measured 2026-11-05: the last phrase on Stop came back in the
 * same tick as the one before it, read the DOM caret (which still sat before the first insert) and
 * went in AHEAD of it, so "...as soon as it comes" arrived as "Comes ... as soon as it".
 */
let feed: ((s: Float32Array) => void) | null = null;
vi.mock('../src/dictation/microphone', () => ({
  microphoneSupported: () => true,
  openMicrophone: async (onSamples: (s: Float32Array) => void) => {
    feed = onSamples;
    return { stream: {} as MediaStream, stop: () => { feed = null; } };
  },
}));
vi.mock('../src/dictation/onDevicePreview', () => ({
  onDevicePreviewAvailable: async () => false,
  startOnDevicePreview: () => null,
}));

const RATE = 16000;
const tone = (ms: number) => Float32Array.from({ length: (RATE * ms) / 1000 }, (_, i) => 0.2 * Math.sin((2 * Math.PI * 220 * i) / RATE));
const quiet = (ms: number) => new Float32Array((RATE * ms) / 1000).fill(0.0005);

function Harness({ transcribe }: { transcribe: () => Promise<string> }) {
  const [value, setValue] = useState('');
  return <Composer value={value} onChange={setValue} onSend={() => {}} dictation={{ transcribe }} />;
}

describe('dictating into the composer', () => {
  it('puts two phrases that land in the same tick in the order they were spoken', async () => {
    const replies: Array<(t: string) => void> = [];
    render(<Harness transcribe={() => new Promise<string>((resolve) => replies.push(resolve))} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Dictate' }));
    });
    await act(async () => {
      feed!(quiet(300));
      feed!(tone(1500)); feed!(quiet(1600));
      feed!(tone(1500)); feed!(quiet(1600));
    });
    expect(replies).toHaveLength(2);

    await act(async () => {
      replies[0]!('please send the letter');
      replies[1]!('as soon as it comes');
    });

    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Please send the letter as soon as it comes');
  });
});
