/**
 * The tables inside a console answer, recovered as rows and columns so a person can open one properly formatted.
 *
 * A console prints a table as a fixed grid (Portify's ConsoleAnswerText::grid, the same shape Claude Code prints):
 * a header line, a rule of `─` runs separated by two spaces (one run per column, exactly the column's width), then
 * the rows, each cell padded to its column's width and the columns joined by two spaces. The rule therefore states
 * every column boundary, so the cells are sliced at those offsets instead of guessed from runs of spaces (a cell may
 * itself contain spaces). A narrow console wraps those lines and the grid falls apart; the parsed table does not.
 */

export interface TerminalTable {
  header: string[];
  rows: string[][];
}

/** Two or more columns: a lone run of `─` is as likely to be a divider in prose. */
const RULE = /^─+(?: {2}─+)+$/;

/** Characters as PHP's mb_strlen counts them (code points), so an emoji does not shift the columns. */
function chars(line: string): string[] {
  return Array.from(line);
}

function strip(cell: string): string {
  return cell.replace(/\*\*/g, '').trim();
}

/** The column widths a rule line states, or null when the line is not a rule. */
function widthsOf(line: string | undefined): number[] | null {
  if (line === undefined || !RULE.test(line)) return null;

  return line.split('  ').map((run) => chars(run).length);
}

/** A line laid out on these columns: every boundary falls on the two spaces between columns (or past its end). */
function fits(line: string, widths: number[]): boolean {
  if (line.trim() === '') return false;
  const text = chars(line);
  let at = 0;
  for (let k = 0; k < widths.length - 1; k++) {
    at += widths[k] ?? 0;
    if (at >= text.length) return true;
    if (text[at] !== ' ' || (text[at + 1] ?? ' ') !== ' ') return false;
    at += 2;
  }

  return true;
}

function slice(line: string, widths: number[]): string[] {
  const text = chars(line);
  const cells: string[] = [];
  let at = 0;
  widths.forEach((width, k) => {
    const end = k === widths.length - 1 ? text.length : at + width;
    cells.push(strip(text.slice(at, end).join('')));
    at += width + 2;
  });

  return cells;
}

/** Every grid table in an answer's text, in order. Text that is not a grid yields nothing. */
export function tablesIn(text: string): TerminalTable[] {
  const lines = text.split('\n');
  const tables: TerminalTable[] = [];

  for (let i = 1; i < lines.length; i++) {
    const widths = widthsOf(lines[i]);
    const header = lines[i - 1] ?? '';
    if (widths === null || !fits(header, widths)) continue;

    const rows: string[][] = [];
    let j = i + 1;
    // A row ends the table at a blank line, a line off the grid, or the header of the next table.
    while (j < lines.length && fits(lines[j] ?? '', widths) && widthsOf(lines[j + 1]) === null) {
      rows.push(slice(lines[j] ?? '', widths));
      j++;
    }
    tables.push({ header: slice(header, widths), rows });
    i = j - 1;
  }

  return tables;
}

/** A table as tab-separated text, header first: it pastes into a spreadsheet as cells. */
export function tableAsTsv(table: TerminalTable): string {
  return [table.header, ...table.rows].map((row) => row.map((cell) => cell.replace(/[\t\n]/g, ' ')).join('\t')).join('\n');
}
