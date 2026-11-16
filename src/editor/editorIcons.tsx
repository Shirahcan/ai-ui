import { createElement } from 'react';

/**
 * The editor toolbar's icons as inline SVG data (1.62.0), so the package depends on no icon library (see
 * ../icons.tsx for why). Shapes from lucide 0.468.0 (ISC licence, https://lucide.dev), the same glyphs the
 * editor drew in Portify before it moved here.
 */
const ICONS = {
  Bold: [['path',{'d':'M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8'}]],
  Italic: [['line',{'x1':'19','x2':'10','y1':'4','y2':'4'}],['line',{'x1':'14','x2':'5','y1':'20','y2':'20'}],['line',{'x1':'15','x2':'9','y1':'4','y2':'20'}]],
  Underline: [['path',{'d':'M6 4v6a6 6 0 0 0 12 0V4'}],['line',{'x1':'4','x2':'20','y1':'20','y2':'20'}]],
  List: [['path',{'d':'M3 12h.01'}],['path',{'d':'M3 18h.01'}],['path',{'d':'M3 6h.01'}],['path',{'d':'M8 12h13'}],['path',{'d':'M8 18h13'}],['path',{'d':'M8 6h13'}]],
  ListOrdered: [['path',{'d':'M10 12h11'}],['path',{'d':'M10 18h11'}],['path',{'d':'M10 6h11'}],['path',{'d':'M4 10h2'}],['path',{'d':'M4 6h1v4'}],['path',{'d':'M6 18H4c0-1 2-2 2-3s-1-1.5-2-1'}]],
  Heading1: [['path',{'d':'M4 12h8'}],['path',{'d':'M4 18V6'}],['path',{'d':'M12 18V6'}],['path',{'d':'m17 12 3-2v8'}]],
  Heading2: [['path',{'d':'M4 12h8'}],['path',{'d':'M4 18V6'}],['path',{'d':'M12 18V6'}],['path',{'d':'M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1'}]],
  Heading3: [['path',{'d':'M4 12h8'}],['path',{'d':'M4 18V6'}],['path',{'d':'M12 18V6'}],['path',{'d':'M17.5 10.5c1.7-1 3.5 0 3.5 1.5a2 2 0 0 1-2 2'}],['path',{'d':'M17 17.5c2 1.5 4 .3 4-1.5a2 2 0 0 0-2-2'}]],
  Link: [['path',{'d':'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71'}],['path',{'d':'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'}]],
  Unlink: [['path',{'d':'m18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71'}],['path',{'d':'m5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71'}],['line',{'x1':'8','x2':'8','y1':'2','y2':'5'}],['line',{'x1':'2','x2':'5','y1':'8','y2':'8'}],['line',{'x1':'16','x2':'16','y1':'19','y2':'22'}],['line',{'x1':'19','x2':'22','y1':'16','y2':'16'}]],
  Image: [['rect',{'width':'18','height':'18','x':'3','y':'3','rx':'2','ry':'2'}],['circle',{'cx':'9','cy':'9','r':'2'}],['path',{'d':'m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21'}]],
  Loader: [['path',{'d':'M21 12a9 9 0 1 1-6.219-8.56'}]],
  Table: [['path',{'d':'M12 3v18'}],['rect',{'width':'18','height':'18','x':'3','y':'3','rx':'2'}],['path',{'d':'M3 9h18'}],['path',{'d':'M3 15h18'}]],
  Rows: [['rect',{'width':'18','height':'18','x':'3','y':'3','rx':'2'}],['path',{'d':'M21 9H3'}],['path',{'d':'M21 15H3'}]],
  Columns: [['rect',{'width':'18','height':'18','x':'3','y':'3','rx':'2'}],['path',{'d':'M9 3v18'}],['path',{'d':'M15 3v18'}]],
  Trash: [['path',{'d':'M3 6h18'}],['path',{'d':'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6'}],['path',{'d':'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2'}],['line',{'x1':'10','x2':'10','y1':'11','y2':'17'}],['line',{'x1':'14','x2':'14','y1':'11','y2':'17'}]],
  Note: [['path',{'d':'M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z'}],['path',{'d':'M15 3v4a2 2 0 0 0 2 2h4'}]],
  FinePrint: [['path',{'d':'m3 15 4-8 4 8'}],['path',{'d':'M4 13h6'}],['circle',{'cx':'18','cy':'12','r':'3'}],['path',{'d':'M21 9v6'}]],
  Highlighter: [['path',{'d':'m9 11-6 6v3h9l3-3'}],['path',{'d':'m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4'}]],
  Callout: [['path',{'d':'M5 21a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2'}],['path',{'d':'M9 21h1'}],['path',{'d':'M14 21h1'}]],
} as const satisfies Record<string, ReadonlyArray<readonly [string, Record<string, string>]>>;

export type EditorIconName = keyof typeof ICONS;

export function EditorIcon({ name, className = 'h-4 w-4' }: { name: EditorIconName; className?: string }) {
  return (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth={2}
      strokeLinecap='round'
      strokeLinejoin='round'
      aria-hidden
      className={className}
    >
      {ICONS[name].map(([tag, attrs], i) => createElement(tag, { key: i, ...attrs }))}
    </svg>
  );
}
