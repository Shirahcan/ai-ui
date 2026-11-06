import { describe, expect, it } from 'vitest';
import { answerTime, dayKey, dayLabel, elapsed, fullTime, sameDay } from '../src/chatTime';

/** Owner, 2026-11-06: chat entries say when they were said, in the viewer's clock, zone named. */
describe('chatTime', () => {
  it('names the zone on every time, in the viewer clock', () => {
    expect(answerTime('2026-11-06T16:07:00Z', 'Africa/Lagos')).toBe('5:07 PM WAT');
    expect(answerTime('2026-07-06T16:07:00Z', 'America/Toronto')).toBe('12:07 PM EDT');
    expect(answerTime('2026-11-06T16:07:00Z', 'America/Toronto')).toBe('11:07 AM EST');
    expect(fullTime('2026-11-06T16:07:00Z', 'Africa/Lagos')).toBe('Fri, Nov 6, 2026, 5:07 PM WAT');
  });

  it('says Today and Yesterday on the viewer calendar, not UTC', () => {
    const now = new Date('2026-11-06T23:30:00Z'); // 00:30 on Nov 7 in Lagos
    expect(dayLabel('2026-11-06T23:10:00Z', 'Africa/Lagos', now)).toBe('Today');
    expect(dayLabel('2026-11-06T22:50:00Z', 'Africa/Lagos', now)).toBe('Yesterday');
    expect(dayLabel('2026-11-06T22:50:00Z', 'UTC', now)).toBe('Today');
    expect(dayLabel('2026-11-04T10:00:00Z', 'Africa/Lagos', now)).toBe('Wed, Nov 4');
    expect(dayLabel('2025-11-04T10:00:00Z', 'Africa/Lagos', now)).toBe('Tue, Nov 4, 2025');
  });

  it('keeps Yesterday right across a DST change', () => {
    // Toronto falls back on Sun Nov 1 2026.
    const now = new Date('2026-11-02T04:30:00Z'); // 11:30 PM Nov 1 EST
    expect(dayLabel('2026-10-31T15:00:00Z', 'America/Toronto', now)).toBe('Yesterday');
  });

  it('compares days in the zone', () => {
    expect(sameDay('2026-11-06T22:50:00Z', '2026-11-06T23:10:00Z', 'Africa/Lagos')).toBe(false);
    expect(sameDay('2026-11-06T22:50:00Z', '2026-11-06T23:10:00Z', 'UTC')).toBe(true);
    expect(dayKey('2026-11-06T23:10:00Z', 'Africa/Lagos')).toBe('2026-11-07');
  });

  it('says how long between two moments', () => {
    expect(elapsed('2026-11-06T16:07:00Z', '2026-11-06T16:07:08Z')).toBe('8 s');
    expect(elapsed('2026-11-06T16:07:00Z', '2026-11-06T16:09:10Z')).toBe('2 min');
    expect(elapsed('2026-11-06T16:00:00Z', '2026-11-06T17:05:00Z')).toBe('1 h 5 min');
    expect(elapsed('2026-11-06T16:00:00Z', '2026-11-06T18:00:00Z')).toBe('2 h');
    expect(elapsed('2026-11-04T16:00:00Z', '2026-11-06T16:00:00Z')).toBe('2 days');
  });

  it('draws nothing for a missing or broken instant', () => {
    expect(answerTime(null, 'UTC')).toBeNull();
    expect(answerTime('not a date', 'UTC')).toBeNull();
    expect(dayLabel(undefined, 'UTC')).toBeNull();
    expect(elapsed('2026-11-06T16:00:00Z', '')).toBeNull();
    expect(sameDay(null, null, 'UTC')).toBe(false);
  });
});
