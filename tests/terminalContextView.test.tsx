import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ContextView } from '../src/terminal/TerminalViews';
import type { TerminalSize } from '../src/terminal/types';

/** The Context view lists only what this console carries (Portify owner 2026-11-28: a test console showed "The design itself"). */
const size = (design: number): TerminalSize => ({
  parts: { brief: 0, summary: 0, turns: 940, design, files: 0 },
  used: 940 + design,
  budget: 100000,
  percent: 1,
  compact_at: 80,
});

describe('ContextView', () => {
  it('leaves out the design row when there is no design, and keeps attached files', () => {
    render(<ContextView size={size(0)} assistant="Porter" onCompact={() => {}} onClear={() => {}} onBack={() => {}} />);

    expect(screen.queryByText('The design itself')).toBeNull();
    expect(screen.getByText('Attached files')).toBeTruthy();
    expect(screen.getByText('Earlier asks and answers')).toBeTruthy();
  });

  it('shows the design row on a console that builds one', () => {
    render(<ContextView size={size(1500)} assistant="Porter" onCompact={() => {}} onClear={() => {}} onBack={() => {}} />);

    expect(screen.getByText('The design itself')).toBeTruthy();
  });
});
