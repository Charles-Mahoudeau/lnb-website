import type { AnticheatRules } from '../../shared/schemas/anticheat.ts';

// The rules version 1 starts with. The migration that creates the anticheat tables inserts the same
// object (test/unit/anticheat-rules.test.ts compares them). No Nuxt imports, so tests can load it.

export const DEFAULT_ANTICHEAT_RULES: AnticheatRules = {
  criteria: {
    moderationApproved: 20,
    downloadsHigh: 20,
    downloadsHighMin: 10000,
    downloadsMid: 10,
    downloadsMidMin: 1000,
    projectAge: 15,
    projectAgeDays: 182,
    versionAge: 15,
    versionAgeDays: 14,
    bothPlatforms: 10,
    identityMatch: 10,
    serverSide: 10,
    texturesClean: 60,
    noCoreShaders: 40,
    unknown: -50,
    suspectedModified: -40,
    texturesAltered: -100,
    coreShaders: -40,
  },
  bands: { accepted: 75, middle: 40 },
  policy: {
    mod: { approved: 'allow', accepted: 'flag', middle: 'hold', low: 'refuse', banned: 'ban' },
    resourcepack: {
      approved: 'allow',
      accepted: 'flag',
      middle: 'warn',
      low: 'refuse',
      banned: 'kick',
    },
    shader: { approved: 'allow', accepted: 'allow', middle: 'allow', low: 'allow', banned: 'kick' },
  },
  player: {
    start: 50,
    trusted: 70,
    held: 30,
    challengeWrong: -25,
    challengeMissed: -5,
    challengeMissedSessionCap: -15,
    modSetChanged: -30,
    channelMismatch: -30,
    modlistIncomplete: -40,
    playPerHour: 1,
    playDailyCap: 5,
    adjustFactor: 0.2,
  },
  lookup: { pendingTimeoutSeconds: 60, notFoundRetryHours: 6, rescoreDays: 7 },
};
