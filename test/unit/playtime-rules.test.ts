import { describe, expect, it } from 'vitest';

import {
  advanceLedger,
  dueNotices,
  evaluate,
  hoursLines,
  resolveConfig,
  splitInterval,
  tailByWeek,
  takeBack,
  weekBounds,
  weekStart,
} from '../../server/services/playtime/rules.ts';
import type { PlaytimeConfig } from '../../server/services/playtime/rules.ts';
import { DEFAULT_PLAYTIME_SCHEDULE, playtimeSchedule } from '../../shared/schemas/playtime.ts';
import type { PlaytimeSchedule } from '../../shared/schemas/playtime.ts';
import { parisInstant } from '../../shared/utils/paris-time.ts';

const H = 3600;
const config: PlaytimeConfig = {
  allowanceSeconds: 10 * H,
  schedule: DEFAULT_PLAYTIME_SCHEDULE,
  graceSeconds: H,
  warningsMinutes: [30, 10, 5, 1],
  startWarningsMinutes: [5, 1],
};

/** A Paris wall-clock time as an instant: at('2026-11-16', '09:30'). */
function at(date: string, time: string): number {
  const [h, m] = time.split(':').map(Number) as [number, number];
  return parisInstant(date, h * 60 + m);
}

const MON = '2026-11-16'; // A Monday in winter time.
const TUE = '2026-11-17';
const SAT = '2026-11-21';
const NEXT_MON = '2026-11-23';

function evaluateAt(now: number, options: Partial<Parameters<typeof evaluate>[0]> = {}) {
  return evaluate({
    now,
    mode: 'enforce',
    config,
    closures: [],
    usedSeconds: 0,
    grantedSeconds: 0,
    exempt: false,
    ...options,
  });
}

describe('weeks', () => {
  it('start on Monday 00:00 in Paris', () => {
    expect(weekStart(at(MON, '00:00'))).toBe(MON);
    expect(weekStart(at(MON, '00:00') - 1)).toBe('2026-11-09');
    expect(weekStart(at('2026-11-22', '23:59'))).toBe(MON);
    expect(weekBounds(MON)).toEqual({ from: at(MON, '00:00'), to: at('2026-11-23', '00:00') });
  });

  it('are 167 and 169 hours around the clock changes', () => {
    const hours = (monday: string) => {
      const { from, to } = weekBounds(monday);
      return (to - from) / 3_600_000;
    };
    expect(hours('2027-03-22')).toBe(167);
    expect(hours('2027-10-25')).toBe(169);
  });
});

describe('resolveConfig', () => {
  const school = {
    allowanceSeconds: 5 * H,
    graceSeconds: 0,
    schedule: { ...DEFAULT_PLAYTIME_SCHEDULE, mon: [] },
  };

  it('inherits each field on its own', () => {
    const resolved = resolveConfig(config, school, { graceSeconds: 30 * 60 });
    expect(resolved.allowanceSeconds).toBe(5 * H);
    expect(resolved.graceSeconds).toBe(30 * 60);
    expect(resolved.schedule).toBe(school.schedule);
    expect(resolved.warningsMinutes).toEqual([30, 10, 5, 1]);
  });

  it('lets a player win over a school, and never override the schedule', () => {
    const resolved = resolveConfig(config, school, {
      allowanceSeconds: 2 * H,
      schedule: DEFAULT_PLAYTIME_SCHEDULE,
      warningsMinutes: [1],
    });
    expect(resolved.allowanceSeconds).toBe(2 * H);
    expect(resolved.warningsMinutes).toEqual([1]);
    expect(resolved.schedule).toBe(school.schedule);
  });

  it('treats null as inheriting, and 0 as a value', () => {
    expect(resolveConfig(config, { graceSeconds: null }).graceSeconds).toBe(H);
    expect(resolveConfig(config, { graceSeconds: 0 }).graceSeconds).toBe(0);
  });
});

describe('splitInterval', () => {
  it('counts only the time inside windows', () => {
    // 8:00 to 10:00 on a Monday: one hour free, one hour in the window.
    expect(splitInterval(at(MON, '08:00'), at(MON, '10:00'), config.schedule, [])).toEqual({
      countedSeconds: H,
      freeSeconds: H,
    });
  });

  it('handles several ranges in a day', () => {
    const schedule: PlaytimeSchedule = {
      ...DEFAULT_PLAYTIME_SCHEDULE,
      mon: [
        ['09:00', '12:00'],
        ['14:00', '17:00'],
      ],
    };
    expect(splitInterval(at(MON, '08:00'), at(MON, '18:00'), schedule, [])).toEqual({
      countedSeconds: 6 * H,
      freeSeconds: 4 * H,
    });
  });

  it('counts nothing on a free day or during a closure', () => {
    expect(
      splitInterval(at(SAT, '09:00'), at(SAT, '17:00'), config.schedule, []).countedSeconds,
    ).toBe(0);
    const closure = [{ startsOn: TUE, endsOn: TUE }];
    expect(splitInterval(at(TUE, '09:00'), at(TUE, '17:00'), config.schedule, closure)).toEqual({
      countedSeconds: 0,
      freeSeconds: 8 * H,
    });
    // The day before and after still count.
    expect(
      splitInterval(at(MON, '09:00'), at(MON, '17:00'), config.schedule, closure).countedSeconds,
    ).toBe(8 * H);
  });

  it('follows a closure that starts or ends mid-week', () => {
    const closure = [{ startsOn: '2026-11-18', endsOn: '2026-11-19' }];
    const result = splitInterval(
      at(MON, '00:00'),
      at('2026-11-23', '00:00'),
      config.schedule,
      closure,
    );
    expect(result.countedSeconds).toBe(3 * 8 * H); // Monday, Tuesday and Friday.
  });

  it('is right across a Monday 00:00 with an all-night window', () => {
    const night: PlaytimeSchedule = {
      ...DEFAULT_PLAYTIME_SCHEDULE,
      sun: [['22:00', '24:00']],
      mon: [['00:00', '02:00']],
    };
    expect(
      splitInterval(at('2026-11-22', '21:00'), at(NEXT_MON, '03:00'), night, []).countedSeconds,
    ).toBe(4 * H);
  });

  it('keeps wall-clock windows on the spring clock change (Sunday 28 March 2027)', () => {
    const schedule: PlaytimeSchedule = { ...DEFAULT_PLAYTIME_SCHEDULE, sun: [['01:00', '05:00']] };
    // 02:00 to 03:00 doesn't exist: the window is 3 real hours long.
    expect(
      splitInterval(at('2027-03-28', '00:00'), at('2027-03-29', '00:00'), schedule, [])
        .countedSeconds,
    ).toBe(3 * H);
  });

  it('keeps wall-clock windows on the autumn clock change (Sunday 31 October 2027)', () => {
    const schedule: PlaytimeSchedule = { ...DEFAULT_PLAYTIME_SCHEDULE, sun: [['01:00', '05:00']] };
    // 02:00 to 03:00 happens twice: the window is 5 real hours long.
    expect(
      splitInterval(at('2027-10-31', '00:00'), at('2027-11-01', '00:00'), schedule, [])
        .countedSeconds,
    ).toBe(5 * H);
  });

  it('keeps a 9:00 window at 9:00 after a clock change', () => {
    // 9:00 to 17:00 the Monday after the spring change is 8 hours of wall clock.
    expect(
      splitInterval(at('2027-03-29', '09:00'), at('2027-03-29', '17:00'), config.schedule, [])
        .countedSeconds,
    ).toBe(8 * H);
  });
});

describe('advanceLedger', () => {
  const base = { config, closures: [], unlimited: false, usedByWeek: {}, grantedByWeek: {} };

  function total(deltas: ReturnType<typeof advanceLedger>) {
    return deltas.reduce(
      (sum, d) => ({
        counted: sum.counted + d.countedSeconds,
        grace: sum.grace + d.graceSeconds,
        over: sum.over + d.overSeconds,
        free: sum.free + d.freeSeconds,
      }),
      { counted: 0, grace: 0, over: 0, free: 0 },
    );
  }

  it('splits a session across a window edge', () => {
    const deltas = advanceLedger({ ...base, from: at(MON, '08:30'), to: at(MON, '09:30') });
    expect(total(deltas)).toEqual({ counted: 30 * 60, grace: 0, over: 0, free: 30 * 60 });
  });

  it('gives two rows to a session across Monday 00:00, and counts the free time', () => {
    const deltas = advanceLedger({
      ...base,
      from: at('2026-11-22', '23:00'),
      to: at(NEXT_MON, '01:00'),
    });
    expect(deltas.map((d) => [d.week, d.freeSeconds])).toEqual([
      [MON, H],
      ['2026-11-23', H],
    ]);
  });

  it('stops counting where the allowance runs out', () => {
    const deltas = advanceLedger({
      ...base,
      from: at(MON, '10:00'),
      to: at(MON, '12:00'),
      usedByWeek: { [MON]: 10 * H - 30 * 60 },
    });
    // 30 minutes count. The rest is 5+ hours before the end of the window: over, not grace.
    expect(total(deltas)).toEqual({ counted: 30 * 60, grace: 0, over: 90 * 60, free: 0 });
  });

  it('sends what runs out in the last grace period to grace', () => {
    const deltas = advanceLedger({
      ...base,
      from: at(MON, '15:30'),
      to: at(MON, '17:30'),
      usedByWeek: { [MON]: 10 * H - 30 * 60 },
    });
    // Counted until 16:00. The window's grace period starts at 16:00 and ends at 17:00.
    expect(total(deltas)).toEqual({ counted: 30 * 60, grace: H, over: 0, free: 30 * 60 });
  });

  it('decides grace by when the allowance runs out: 61, 60 and 59 minutes before the end', () => {
    const run = (minutesBefore: number) =>
      total(
        advanceLedger({
          ...base,
          from: at(MON, '14:00'),
          to: at(MON, '17:00'),
          // The allowance is gone `minutesBefore` minutes before 17:00.
          usedByWeek: { [MON]: 10 * H - (180 - minutesBefore) * 60 },
        }),
      );
    // 61 minutes: the minute before the grace period is over, then the hour is grace.
    expect(run(61)).toEqual({ counted: 119 * 60, grace: H, over: 60, free: 0 });
    expect(run(60)).toEqual({ counted: 120 * 60, grace: H, over: 0, free: 0 });
    expect(run(59)).toEqual({ counted: 121 * 60, grace: 59 * 60, over: 0, free: 0 });
  });

  it('has no grace when it is switched off', () => {
    const deltas = advanceLedger({
      ...base,
      config: { ...config, graceSeconds: 0 },
      from: at(MON, '16:00'),
      to: at(MON, '17:00'),
      usedByWeek: { [MON]: 10 * H },
    });
    expect(total(deltas)).toEqual({ counted: 0, grace: 0, over: H, free: 0 });
  });

  it('counts an allowance that runs out exactly at the end of a window as counted', () => {
    const deltas = advanceLedger({
      ...base,
      from: at(MON, '16:00'),
      to: at(MON, '17:00'),
      usedByWeek: { [MON]: 10 * H - H },
    });
    expect(total(deltas)).toEqual({ counted: H, grace: 0, over: 0, free: 0 });
  });

  it('puts a player who joins in grace with no allowance in grace', () => {
    const deltas = advanceLedger({
      ...base,
      from: at(MON, '16:30'),
      to: at(MON, '16:45'),
      usedByWeek: { [MON]: 10 * H },
    });
    expect(total(deltas)).toEqual({ counted: 0, grace: 15 * 60, over: 0, free: 0 });
  });

  it('uses grants, by week', () => {
    const deltas = advanceLedger({
      ...base,
      from: at(MON, '10:00'),
      to: at(MON, '11:00'),
      usedByWeek: { [MON]: 10 * H },
      grantedByWeek: { [MON]: 20 * 60 },
    });
    expect(total(deltas)).toMatchObject({ counted: 20 * 60, over: 40 * 60 });
  });

  it('counts all the time of an exempt or unlimited player as free', () => {
    const deltas = advanceLedger({
      ...base,
      unlimited: true,
      from: at(MON, '09:00'),
      to: at(MON, '17:00'),
    });
    expect(total(deltas)).toEqual({ counted: 0, grace: 0, over: 0, free: 8 * H });
  });

  it('never loses a second: the parts add up to the total', () => {
    const from = at(MON, '08:59') + 437;
    const deltas = advanceLedger({ ...base, from, to: from + 3 * H * 1000 });
    const sum = total(deltas);
    expect(sum.counted + sum.grace + sum.over + sum.free).toBe(3 * H);
  });
});

describe('tail: giving back the time after the last heartbeat', () => {
  it('takes the last-counted time off first: grace, over, then counted', () => {
    const row = { countedSeconds: 600, graceSeconds: 100, overSeconds: 50, freeSeconds: 30 };
    expect(takeBack(row, { windowSeconds: 120, freeSeconds: 10 })).toEqual({
      countedSeconds: 600,
      graceSeconds: 0,
      overSeconds: 30,
      freeSeconds: 20,
    });
    expect(takeBack(row, { windowSeconds: 200, freeSeconds: 0 })).toEqual({
      countedSeconds: 550,
      graceSeconds: 0,
      overSeconds: 0,
      freeSeconds: 30,
    });
  });

  it('never goes below zero', () => {
    const row = { countedSeconds: 10, graceSeconds: 0, overSeconds: 0, freeSeconds: 5 };
    expect(takeBack(row, { windowSeconds: 999, freeSeconds: 999 })).toEqual({
      countedSeconds: 0,
      graceSeconds: 0,
      overSeconds: 0,
      freeSeconds: 0,
    });
  });

  it('measures a tail by week, and nothing is in a window for an exempt player', () => {
    const tail = tailByWeek(at(MON, '16:55'), at(MON, '17:05'), config, [], false);
    expect(tail).toEqual([{ week: MON, windowSeconds: 5 * 60, freeSeconds: 5 * 60 }]);
    expect(tailByWeek(at(MON, '16:55'), at(MON, '17:05'), config, [], true)[0]).toMatchObject({
      windowSeconds: 0,
      freeSeconds: 10 * 60,
    });
  });
});

describe('evaluate', () => {
  it('is free outside the windows, with the next window', () => {
    const result = evaluateAt(at(MON, '07:00'));
    expect(result.state).toBe('free');
    expect(result.nextWindowStartsAt).toBe(at(MON, '09:00'));
    expect(result.nextChangeAt).toBe(at(MON, '09:00'));
    expect(evaluateAt(at(SAT, '12:00')).nextWindowStartsAt).toBe(at('2026-11-23', '09:00'));
  });

  it('counts inside a window, and says when it runs out or ends', () => {
    const result = evaluateAt(at(MON, '10:00'), { usedSeconds: 10 * H - 30 * 60 });
    expect(result).toMatchObject({
      state: 'counting',
      remainingSeconds: 30 * 60,
      windowEndsAt: at(MON, '17:00'),
      nextChangeAt: at(MON, '10:30'),
    });
    expect(evaluateAt(at(MON, '10:00')).nextChangeAt).toBe(at(MON, '17:00'));
  });

  it('is blocked with no allowance in a window, until the window ends', () => {
    const result = evaluateAt(at(MON, '12:00'), { usedSeconds: 10 * H });
    expect(result).toMatchObject({
      state: 'blocked',
      resumesAt: at(MON, '17:00'),
      remainingSeconds: 0,
      nextChangeAt: at(MON, '16:00'),
    });
  });

  it('is in grace in the last hour: 61, 60 and 59 minutes before the end', () => {
    const state = (time: string) => evaluateAt(at(MON, time), { usedSeconds: 10 * H }).state;
    expect(state('15:59')).toBe('blocked');
    expect(state('16:00')).toBe('grace');
    expect(state('16:01')).toBe('grace');
    const grace = evaluateAt(at(MON, '16:30'), { usedSeconds: 10 * H });
    expect(grace.graceEndsAt).toBe(at(MON, '17:00'));
  });

  it('has no grace when it is off', () => {
    const result = evaluateAt(at(MON, '16:30'), {
      usedSeconds: 10 * H,
      config: { ...config, graceSeconds: 0 },
    });
    expect(result.state).toBe('blocked');
  });

  it('is blocked when a window starts and there is no allowance left', () => {
    expect(evaluateAt(at(TUE, '09:00'), { usedSeconds: 10 * H }).state).toBe('blocked');
    expect(evaluateAt(at(TUE, '08:59'), { usedSeconds: 10 * H }).state).toBe('free');
  });

  it('adds grants to the allowance', () => {
    const result = evaluateAt(at(MON, '12:00'), { usedSeconds: 10 * H, grantedSeconds: H });
    expect(result).toMatchObject({
      state: 'counting',
      allowanceSeconds: 11 * H,
      remainingSeconds: H,
    });
  });

  it('is unlimited for an exempt player, a closure and the mode off', () => {
    expect(evaluateAt(at(MON, '12:00'), { usedSeconds: 10 * H, exempt: true })).toMatchObject({
      state: 'unlimited',
      reason: 'exempt',
    });
    expect(evaluateAt(at(MON, '12:00'), { mode: 'off', usedSeconds: 10 * H })).toMatchObject({
      state: 'unlimited',
      reason: 'off',
    });
    const closed = evaluateAt(at(TUE, '12:00'), {
      usedSeconds: 10 * H,
      closures: [{ startsOn: '2026-11-16', endsOn: TUE }],
    });
    expect(closed).toMatchObject({
      state: 'unlimited',
      reason: 'closed',
      resumesAt: at('2026-11-18', '00:00'),
    });
  });

  it('evaluates observe like enforce', () => {
    expect(evaluateAt(at(MON, '12:00'), { mode: 'observe', usedSeconds: 10 * H }).state).toBe(
      'blocked',
    );
  });

  it('tells when the week resets', () => {
    expect(evaluateAt(at(MON, '12:00')).resetsAt).toBe(at('2026-11-23', '00:00'));
  });
});

describe('the schedule schema', () => {
  it('accepts the default and refuses overlaps, reversed ranges and a missing day', () => {
    expect(playtimeSchedule.safeParse(DEFAULT_PLAYTIME_SCHEDULE).success).toBe(true);
    const bad = (mon: [string, string][]) =>
      playtimeSchedule.safeParse({ ...DEFAULT_PLAYTIME_SCHEDULE, mon }).success;
    expect(
      bad([
        ['09:00', '12:00'],
        ['11:00', '17:00'],
      ]),
    ).toBe(false);
    expect(bad([['12:00', '09:00']])).toBe(false);
    expect(
      bad([
        ['14:00', '17:00'],
        ['09:00', '12:00'],
      ]),
    ).toBe(false);
    expect(bad([['00:00', '24:00']])).toBe(true);
    expect(bad([['09:00', '25:00']])).toBe(false);
    const { sun: _sun, ...missing } = DEFAULT_PLAYTIME_SCHEDULE;
    expect(playtimeSchedule.safeParse(missing).success).toBe(false);
  });

  it('merges days with the same hours into one line', () => {
    expect(hoursLines(DEFAULT_PLAYTIME_SCHEDULE)).toEqual([
      { days: ['mon', 'tue', 'wed', 'thu', 'fri'], ranges: [['09:00', '17:00']] },
    ]);
  });
});

describe('dueNotices', () => {
  const due = (now: number, options: Partial<Parameters<typeof evaluate>[0]> = {}) =>
    dueNotices(evaluateAt(now, options), config, now);

  it('warns at each mark, and says what is really left', () => {
    const now = at(MON, '10:00');
    expect(due(now, { usedSeconds: 10 * H - 29 * 60 }).warning).toEqual({
      kind: 'allowance',
      remainingSeconds: 29 * 60,
      notices: ['w30'],
    });
    // Joining with 3 minutes left has crossed the 30, 10 and 5 minute marks: one warning.
    expect(due(now, { usedSeconds: 10 * H - 180 }).warning).toEqual({
      kind: 'allowance',
      remainingSeconds: 180,
      notices: ['w30', 'w10', 'w5'],
    });
    expect(due(now, { usedSeconds: 5 * H }).warning).toBeNull();
  });

  it('does not warn when the window ends before the allowance would', () => {
    // 20 minutes left, but the window ends in 10: the player never reaches zero today.
    expect(due(at(MON, '16:50'), { usedSeconds: 10 * H - 20 * 60 }).warning).toBeNull();
  });

  it('kicks when the allowance is used up outside the grace period, and not inside it', () => {
    expect(due(at(MON, '10:00'), { usedSeconds: 10 * H })).toMatchObject({
      kick: true,
      grace: false,
    });
    expect(due(at(MON, '16:30'), { usedSeconds: 10 * H })).toMatchObject({
      kick: false,
      grace: true,
    });
  });

  it('warns a player with nothing left before a window opens, then the kick follows', () => {
    const used = { usedSeconds: 10 * H };
    expect(due(at(TUE, '08:50'), used).warning).toBeNull();
    expect(due(at(TUE, '08:56'), used).warning).toEqual({
      kind: 'windowStart',
      remainingSeconds: 240,
      notices: ['s5'],
    });
    expect(due(at(TUE, '08:59') + 10_000, used).warning?.notices).toEqual(['s5', 's1']);
    expect(due(at(TUE, '09:00') + 1000, used).kick).toBe(true);
  });

  it('says nothing to a player with allowance left outside a window, or with no limit', () => {
    expect(due(at(TUE, '08:59'), { usedSeconds: 0 })).toEqual({
      warning: null,
      grace: false,
      kick: false,
    });
    expect(due(at(MON, '10:00'), { usedSeconds: 10 * H, exempt: true })).toEqual({
      warning: null,
      grace: false,
      kick: false,
    });
  });
});
