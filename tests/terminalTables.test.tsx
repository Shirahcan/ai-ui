import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TerminalTableLinks } from '../src/terminal/TerminalTableView';
import { tableAsTsv, tablesIn } from '../src/terminal/terminalTables';

/**
 * Tables in a console answer open properly formatted (owner 2026-11-28: "the console width disfigures tables").
 * The grid is the shape Portify's ConsoleAnswerText::grid prints: columns padded, joined by two spaces, a `─` rule.
 */

const GRID = [
  'Case number           Client        Current step                    Consultant',
  '────────────────────  ────────────  ──────────────────────────────  ────────────',
  'CASE-20261128-KYVKNM  Amara Okafor  Client is on Payment (3 of 10)  Nadia Okafor',
  'CASE-20261128-AB12CD  Amara Okafor  Service Agreement               Nadia Okafor',
].join('\n');

describe('tablesIn', () => {
  it('recovers every cell, spaces inside a cell included, by the widths the rule states', () => {
    const table = tablesIn(`This case is on Payment.\n\n${GRID}\n\nNothing else.`)[0]!;

    expect(table.header).toEqual(['Case number', 'Client', 'Current step', 'Consultant']);
    expect(table.rows).toEqual([
      ['CASE-20261128-KYVKNM', 'Amara Okafor', 'Client is on Payment (3 of 10)', 'Nadia Okafor'],
      ['CASE-20261128-AB12CD', 'Amara Okafor', 'Service Agreement', 'Nadia Okafor'],
    ]);
  });

  it('ends a table at prose that follows it directly, and finds a second table', () => {
    const second = ['Name  Due', '────  ──────', 'Fee   May 4'].join('\n');
    // (A prose line no wider than the first column is indistinguishable from a row; the grid sits in its own paragraph.)
    const tables = tablesIn(`${GRID}\nThose are every case she has opened so far this month.\n\n${second}`);

    expect(tables).toHaveLength(2);
    expect(tables[0]?.rows).toHaveLength(2);
    expect(tables[1]).toEqual({ header: ['Name', 'Due'], rows: [['Fee', 'May 4']] });
  });

  it('keeps a trailing column short of its width (the grid trims trailing spaces) and drops bold marks', () => {
    // Widths count the bold marks, as the grid does; the last column's padding is trimmed away.
    const table = tablesIn(['Step        Who', '──────────  ──────', '**Intake**', 'Payment     Client'].join('\n'))[0]!;

    expect(table.rows[0]).toEqual(['Intake', '']);
    expect(table.rows[1]).toEqual(['Payment', 'Client']);
  });

  it('finds nothing in prose, a lone divider or a list', () => {
    expect(tablesIn('Just an answer.\n──────────\n- one\n- two')).toEqual([]);
  });

  it('copies as tab-separated cells, header first', () => {
    expect(tableAsTsv({ header: ['A', 'B'], rows: [['1', 'x y']] })).toBe('A\tB\n1\tx y');
  });
});

describe('TerminalTableLinks', () => {
  it('opens the table in a dialog with every row, copies it, and closes back to the link', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<TerminalTableLinks tables={tablesIn(GRID)} />);

    const link = screen.getByRole('button', { name: 'Open table (2 rows)' });
    fireEvent.click(link);
    const dialog = screen.getByRole('dialog', { name: 'Table' });

    expect(within(dialog).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Case number', 'Client', 'Current step', 'Consultant']);
    expect(within(dialog).getByText('Client is on Payment (3 of 10)')).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Case number\tClient'));

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(link);
  });

  it('numbers the links when an answer holds several tables, and draws nothing without one', () => {
    const { rerender } = render(<TerminalTableLinks tables={[...tablesIn(GRID), ...tablesIn(GRID)]} />);
    expect(screen.getByRole('button', { name: 'Open table 2 of 2 (2 rows)' })).toBeTruthy();

    rerender(<TerminalTableLinks tables={[]} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
