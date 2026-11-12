import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { DEFAULT_ANTICHEAT_RULES as rules } from '../../server/lib/anticheat-rules.ts';
import {
  applyPlayerEvent,
  bandOf,
  effectiveScore,
  fileAction,
  playerAction,
  playerBandOf,
  playtimeGain,
  scoreFile,
  verdictOf,
  type ScoreFileInput,
} from '../../server/services/anticheat/rules.ts';
import { anticheatRules } from '../../shared/schemas/anticheat.ts';
import { fileStatus } from '../../shared/utils/anticheat.ts';

const now = new Date('2026-11-12T12:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

function input(overrides: Partial<ScoreFileInput> = {}): ScoreFileInput {
  return {
    kind: 'mod',
    decision: null,
    projectDecision: null,
    modIdBanned: false,
    inModpack: false,
    lookupState: 'notFound',
    modrinthProject: null,
    curseforgeProject: null,
    platformVersion: null,
    declared: {},
    facts: null,
    factsDisputed: false,
    declaredModIdKnown: false,
    curseforgeConfigured: true,
    now,
    ...overrides,
  };
}

const modrinthFound = {
  lookupState: 'found' as const,
  modrinthProject: {
    status: 'approved',
    downloads: 50_000,
    publishedAt: daysAgo(400),
    serverSide: 'required',
  },
  platformVersion: {
    modrinth: { versionNumber: '0.6.0', loaders: ['neoforge'], publishedAt: daysAgo(60) },
  },
};

describe('default rules', () => {
  it('match the schema', () => {
    expect(anticheatRules.parse(rules)).toEqual(rules);
  });

  it('are the ones the migration seeds as version 1', () => {
    const sql = readFileSync(
      new URL('../../server/db/migrations/0031_anticheat.sql', import.meta.url),
      'utf8',
    );
    const match =
      /INSERT INTO "anticheat_rules" \("version", "rules"\) VALUES \(1, '(.*)'::jsonb\)/.exec(sql);
    expect(match).not.toBeNull();
    expect(JSON.parse(match![1]!)).toEqual(rules);
  });
});

describe('scoreFile', () => {
  it('gives a client entry no score', () => {
    const result = scoreFile(input({ kind: 'client' }), rules);
    expect(result.score).toBeNull();
    expect(result.breakdown.path).toBe('client');
  });

  it('scores a mod found on neither platform 1', () => {
    const result = scoreFile(input(), rules);
    expect(result.score).toBe(1);
    expect(result.band).toBe('low');
    expect(result.breakdown.raw).toBe(-50);
    expect(result.breakdown.penalties).toEqual([{ key: 'unknown', points: -50 }]);
  });

  it('adds the suspected-modified penalty when the mod ID is known elsewhere', () => {
    const result = scoreFile(input({ declaredModIdKnown: true }), rules);
    expect(result.breakdown.raw).toBe(-90);
    expect(result.score).toBe(1);
  });

  it('scores an unknown resource pack with clean facts 50', () => {
    const result = scoreFile(
      input({ kind: 'resourcepack', facts: { coreShaders: false, alteredTextures: false } }),
      rules,
    );
    expect(result.score).toBe(50);
    expect(result.band).toBe('middle');
  });

  it('scores an unknown resource pack with altered textures 1 (raw -110)', () => {
    const result = scoreFile(
      input({ kind: 'resourcepack', facts: { coreShaders: false, alteredTextures: true } }),
      rules,
    );
    expect(result.breakdown.raw).toBe(-110);
    expect(result.score).toBe(1);
  });

  it('ignores disputed facts, for points and penalties', () => {
    const result = scoreFile(
      input({
        kind: 'resourcepack',
        facts: { coreShaders: true, alteredTextures: true },
        factsDisputed: true,
      }),
      rules,
    );
    expect(result.breakdown.penalties).toEqual([{ key: 'unknown', points: -50 }]);
    expect(result.breakdown.earned).toBe(0);
  });

  it('scores a banned project 0 even with an approved hash', () => {
    const result = scoreFile(input({ decision: 'approved', projectDecision: 'banned' }), rules);
    expect(result.score).toBe(0);
    expect(result.band).toBe('banned');
    expect(result.breakdown.overrides).toEqual(['project']);
  });

  it('bans a declared mod ID from the ban list', () => {
    const result = scoreFile(input({ modIdBanned: true, inModpack: true }), rules);
    expect(result.score).toBe(0);
    expect(result.breakdown.overrides).toEqual(['modId']);
  });

  it('scores an approved file, project or official mod 100', () => {
    for (const override of [
      { decision: 'approved' as const },
      { projectDecision: 'approved' as const },
      { inModpack: true },
    ]) {
      const result = scoreFile(input(override), rules);
      expect(result.score).toBe(100);
      expect(result.band).toBe('approved');
    }
  });

  it('gives a pending file no score, unless an override decides', () => {
    expect(scoreFile(input({ lookupState: 'pending' }), rules).score).toBeNull();
    expect(scoreFile(input({ lookupState: 'pending', inModpack: true }), rules).score).toBe(100);
  });

  it('adds up a mod found on Modrinth and clamps it to 99', () => {
    const result = scoreFile(
      input({ ...modrinthFound, declared: { version: '0.6.0', loader: 'NeoForge' } }),
      rules,
    );
    // Without a CurseForge match, only bothPlatforms is not earned: 100 - 10.
    expect(result.breakdown.earned).toBe(90);
    expect(result.score).toBe(90);
    expect(result.band).toBe('accepted');
  });

  it('scales a CurseForge-only mod over the criteria that apply', () => {
    const result = scoreFile(
      input({
        lookupState: 'found',
        curseforgeProject: { downloadCount: 20_000, dateCreated: daysAgo(500) },
        platformVersion: { curseforge: { publishedAt: daysAgo(100) } },
      }),
      rules,
    );
    // Unavailable: moderation (20), identity (10), serverSide (10). Earned: 20 + 15 + 15 = 50.
    expect(result.breakdown.fullMax).toBe(100);
    expect(result.breakdown.availableMax).toBe(60);
    expect(result.breakdown.earned).toBe(50);
    expect(result.breakdown.scaled).toBe(83);
    expect(result.score).toBe(83);
  });

  it('counts both platforms as unavailable without a CurseForge key', () => {
    const result = scoreFile(input({ ...modrinthFound, curseforgeConfigured: false }), rules);
    const both = result.breakdown.criteria.find((c) => c.key === 'bothPlatforms');
    expect(both?.state).toBe('unavailable');
  });

  it('gives mid downloads their own points', () => {
    const result = scoreFile(
      input({
        ...modrinthFound,
        modrinthProject: { ...modrinthFound.modrinthProject, downloads: 2000 },
      }),
      rules,
    );
    const downloads = result.breakdown.criteria.find((c) => c.key === 'downloads');
    expect(downloads).toEqual({ key: 'downloads', state: 'earned', points: 10 });
  });
});

describe('bands and status', () => {
  it('splits scores into bands', () => {
    expect([0, 1, 39, 40, 74, 75, 99, 100].map((s) => bandOf(s, rules))).toEqual([
      'banned',
      'low',
      'low',
      'middle',
      'middle',
      'accepted',
      'accepted',
      'approved',
    ]);
  });

  it('labels files for the admin', () => {
    const base = { kind: 'mod' as const, reviewedBand: null };
    expect(fileStatus({ ...base, score: null, band: null })).toBe('pending');
    expect(fileStatus({ ...base, score: 0, band: 'banned' })).toBe('banned');
    expect(fileStatus({ ...base, score: 100, band: 'approved' })).toBe('approved');
    expect(fileStatus({ ...base, score: 10, band: 'low' })).toBe('refused');
    expect(fileStatus({ ...base, score: 50, band: 'middle' })).toBe('review');
    expect(fileStatus({ ...base, score: 80, band: 'accepted' })).toBe('review');
    expect(fileStatus({ ...base, score: 80, band: 'accepted', reviewedBand: 'accepted' })).toBe(
      'accepted',
    );
    expect(fileStatus({ ...base, kind: 'shader', score: 10, band: 'low' })).toBe('accepted');
    expect(fileStatus({ ...base, kind: 'client', score: null, band: null })).toBeNull();
  });
});

describe('effectiveScore', () => {
  it('moves a score by the player adjustment, between 1 and 99', () => {
    expect(effectiveScore(60, 100, rules)).toBe(70);
    expect(effectiveScore(60, 0, rules)).toBe(50);
    expect(effectiveScore(98, 100, rules)).toBe(99);
    expect(effectiveScore(2, 0, rules)).toBe(1);
  });

  it('leaves 0 and 100 alone', () => {
    expect(effectiveScore(0, 100, rules)).toBe(0);
    expect(effectiveScore(100, 0, rules)).toBe(100);
  });

  it('never lifts a mod found on neither platform', () => {
    expect(effectiveScore(10, 100, rules, true)).toBe(10);
    expect(effectiveScore(10, 0, rules, true)).toBe(1);
  });
});

describe('policy and verdict', () => {
  it('reads the action table, and allows clients and pending files', () => {
    expect(fileAction('mod', 'middle', rules)).toBe('hold');
    expect(fileAction('resourcepack', 'banned', rules)).toBe('kick');
    expect(fileAction('shader', 'low', rules)).toBe('allow');
    expect(fileAction('mod', null, rules)).toBe('allow');
    expect(fileAction('client', null, rules)).toBe('allow');
  });

  it('bands and acts on a player score', () => {
    expect([0, 1, 29, 30, 69, 70, 100].map((s) => playerBandOf(s, rules))).toEqual([
      'zero',
      'held',
      'held',
      'normal',
      'normal',
      'trusted',
      'trusted',
    ]);
    expect(playerAction(0, false, rules)).toBe('kick');
    expect(playerAction(20, false, rules)).toBe('hold');
    expect(playerAction(50, true, rules)).toBe('hold');
    expect(playerAction(50, false, rules)).toBe('allow');
  });

  const files = [
    {
      sha512: 'a',
      name: 'Sodium',
      kind: 'mod' as const,
      band: 'approved' as const,
      action: 'allow' as const,
    },
    {
      sha512: 'b',
      name: 'Freecam',
      kind: 'mod' as const,
      band: 'middle' as const,
      action: 'hold' as const,
    },
    {
      sha512: 'c',
      name: 'XRay',
      kind: 'mod' as const,
      band: 'banned' as const,
      action: 'ban' as const,
    },
  ];

  it('takes the most severe action in enforce mode', () => {
    const verdict = verdictOf(files, { score: 50, manualHold: false }, 'enforce', rules);
    expect(verdict.action).toBe('ban');
    expect(verdict.wouldBe).toBeUndefined();
    expect(verdict.reasons.map((r) => r.code)).toEqual(['fileBanned', 'fileHeld']);
  });

  it('allows in observe mode and says what would have happened', () => {
    const verdict = verdictOf(files, { score: 50, manualHold: false }, 'observe', rules);
    expect(verdict.action).toBe('allow');
    expect(verdict.wouldBe).toBe('ban');
  });

  it('adds the player reasons', () => {
    const verdict = verdictOf([], { score: 10, manualHold: true }, 'enforce', rules);
    expect(verdict.action).toBe('hold');
    expect(verdict.reasons.map((r) => r.code)).toEqual(['playerHeld', 'manualHold']);
    expect(verdictOf([], { score: 0, manualHold: false }, 'enforce', rules).action).toBe('kick');
  });
});

describe('applyPlayerEvent', () => {
  it('applies the configured delta', () => {
    expect(applyPlayerEvent(50, 'challengeWrong', [], rules)).toBe(-25);
    expect(applyPlayerEvent(50, 'modSetChanged', [], rules)).toBe(-30);
    expect(applyPlayerEvent(50, 'channelMismatch', [], rules)).toBe(-30);
  });

  it('stops missed challenges at the session cap', () => {
    const events = [
      { kind: 'challengeMissed' as const, delta: -5 },
      { kind: 'challengeMissed' as const, delta: -5 },
    ];
    expect(applyPlayerEvent(50, 'challengeMissed', events, rules)).toBe(-5);
    events.push({ kind: 'challengeMissed', delta: -5 });
    expect(applyPlayerEvent(50, 'challengeMissed', events, rules)).toBe(0);
  });

  it('counts an incomplete modlist once per session', () => {
    expect(applyPlayerEvent(50, 'modlistIncomplete', [], rules)).toBe(-40);
    expect(
      applyPlayerEvent(10, 'modlistIncomplete', [{ kind: 'modlistIncomplete', delta: -40 }], rules),
    ).toBe(0);
  });

  it('keeps the score between 0 and 100', () => {
    expect(applyPlayerEvent(10, 'challengeWrong', [], rules)).toBe(-10);
  });
});

describe('playtimeGain', () => {
  it('earns per whole hour, up to the daily cap', () => {
    expect(playtimeGain(3599, 0, false, rules)).toBe(0);
    expect(playtimeGain(2 * 3600 + 100, 0, false, rules)).toBe(2);
    expect(playtimeGain(10 * 3600, 0, false, rules)).toBe(5);
    expect(playtimeGain(3 * 3600, 4, false, rules)).toBe(1);
    expect(playtimeGain(3 * 3600, 6, false, rules)).toBe(0);
  });

  it('earns nothing after a penalty', () => {
    expect(playtimeGain(5 * 3600, 0, true, rules)).toBe(0);
  });
});
