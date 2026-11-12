import {
  ANTICHEAT_ACTIONS,
  type AnticheatAction,
  type AnticheatBreakdown,
  type AnticheatCriterionKey,
  type AnticheatFacts,
  type AnticheatFileBand,
  type AnticheatFileKind,
  type AnticheatLookupState,
  type AnticheatMode,
  type AnticheatOverride,
  type AnticheatPenaltyKey,
  type AnticheatPlayerBand,
  type AnticheatPlayerEventKind,
  type AnticheatRules,
  type AnticheatVerdict,
  type AnticheatVerdictReason,
} from '../../../shared/schemas/anticheat.ts';

// The anticheat's pure rules: scoring, bands, the verdict and the player's trust math. No database
// or Nuxt imports, so plain unit tests can load them. See docs/anticheat.md.

const DAY_MS = 24 * 60 * 60 * 1000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** The platform data of a file's project, as stored. Only the fields scoring reads. */
export interface ScoreModrinth {
  status: string;
  downloads: number;
  publishedAt: string;
  serverSide: string;
}
export interface ScoreCurseforge {
  downloadCount: number;
  dateCreated: string;
}

export interface ScoreFileInput {
  kind: AnticheatFileKind;
  /** The file's own decision, and its project's. A ban always wins. */
  decision: 'approved' | 'banned' | null;
  projectDecision: 'approved' | 'banned' | null;
  /** The declared mod ID is in the mod-ID ban list. */
  modIdBanned: boolean;
  /** A visible official entry of the mod list matches the file. */
  inModpack: boolean;
  lookupState: AnticheatLookupState;
  modrinthProject: ScoreModrinth | null;
  curseforgeProject: ScoreCurseforge | null;
  platformVersion: {
    modrinth?: { versionNumber: string; loaders: string[]; publishedAt: string };
    curseforge?: { publishedAt: string };
  } | null;
  declared: { version?: string; loader?: string };
  facts: AnticheatFacts | null;
  factsDisputed: boolean;
  /** The declared mod ID belongs to a project that a platform confirmed. */
  declaredModIdKnown: boolean;
  /** Without a CurseForge key, "found on both platforms" can't be told. */
  curseforgeConfigured: boolean;
  now: Date;
}

export interface FileScore {
  score: number | null;
  band: AnticheatFileBand | null;
  breakdown: Omit<AnticheatBreakdown, 'rulesVersion'>;
}

type CriterionState = 'earned' | 'notEarned' | 'unavailable';

function emptyBreakdown(
  path: AnticheatBreakdown['path'],
  score: number | null,
  overrides: AnticheatOverride[] = [],
): Omit<AnticheatBreakdown, 'rulesVersion'> {
  return {
    path,
    overrides,
    criteria: [],
    fullMax: 0,
    availableMax: 0,
    earned: 0,
    scaled: 0,
    penalties: [],
    raw: 0,
    score,
  };
}

/** Where a score falls: 0 and 100 are the overrides, the rest follow the thresholds. */
export function bandOf(score: number, rules: AnticheatRules): AnticheatFileBand {
  if (score <= 0) return 'banned';
  if (score >= 100) return 'approved';
  if (score >= rules.bands.accepted) return 'accepted';
  if (score >= rules.bands.middle) return 'middle';
  return 'low';
}

/**
 * The score of one file, in this order: a client entry has none; a ban wins; an approval gives 100;
 * a pending lookup has none yet; otherwise the criteria are added up. The breakdown is stored as it
 * is and shown as it is, never recomputed.
 */
export function scoreFile(input: ScoreFileInput, rules: AnticheatRules): FileScore {
  if (input.kind === 'client') {
    return { score: null, band: null, breakdown: emptyBreakdown('client', null) };
  }

  const banned: AnticheatOverride[] = [];
  if (input.decision === 'banned') banned.push('hash');
  if (input.projectDecision === 'banned') banned.push('project');
  if (input.modIdBanned) banned.push('modId');
  if (banned.length > 0) {
    return { score: 0, band: 'banned', breakdown: emptyBreakdown('banned', 0, banned) };
  }

  const approved: AnticheatOverride[] = [];
  if (input.decision === 'approved') approved.push('hash');
  if (input.projectDecision === 'approved') approved.push('project');
  if (input.inModpack) approved.push('modpack');
  if (approved.length > 0) {
    return { score: 100, band: 'approved', breakdown: emptyBreakdown('approved', 100, approved) };
  }

  if (input.lookupState === 'pending') {
    return { score: null, band: null, breakdown: emptyBreakdown('pending', null) };
  }

  return computeScore(input, rules);
}

function computeScore(input: ScoreFileInput, rules: AnticheatRules): FileScore {
  const { criteria: points } = rules;
  const { kind, modrinthProject: modrinth, curseforgeProject: curseforge } = input;
  const version = input.platformVersion;
  const foundOnModrinth = Boolean(version?.modrinth);
  const foundOnCurseforge = Boolean(version?.curseforge);
  const foundAny = foundOnModrinth || foundOnCurseforge;
  // A disputed fact counts for nothing, in either direction.
  const facts = input.factsDisputed ? null : input.facts;

  const rows: { key: AnticheatCriterionKey; state: CriterionState; points: number }[] = [];
  const add = (key: AnticheatCriterionKey, state: CriterionState, value: number) => {
    rows.push({ key, state, points: value });
  };
  // For a file found on neither platform, platform criteria are not earned, never unavailable.
  const platform = (state: CriterionState): CriterionState => (foundAny ? state : 'notEarned');
  const flag = (earned: boolean): CriterionState => (earned ? 'earned' : 'notEarned');

  add(
    'moderationApproved',
    !foundAny
      ? 'notEarned'
      : !foundOnModrinth
        ? 'unavailable'
        : flag(modrinth?.status === 'approved'),
    points.moderationApproved,
  );

  const downloads = Math.max(modrinth?.downloads ?? 0, curseforge?.downloadCount ?? 0);
  const downloadsPoints =
    downloads >= points.downloadsHighMin
      ? points.downloadsHigh
      : downloads >= points.downloadsMidMin
        ? points.downloadsMid
        : 0;
  add(
    'downloads',
    foundAny && downloadsPoints > 0 ? 'earned' : 'notEarned',
    foundAny && downloadsPoints > 0 ? downloadsPoints : points.downloadsHigh,
  );

  const created = earliest(modrinth?.publishedAt, curseforge?.dateCreated);
  add(
    'projectAge',
    foundAny && created !== null && input.now.getTime() - created > points.projectAgeDays * DAY_MS
      ? 'earned'
      : 'notEarned',
    points.projectAge,
  );

  const published = earliest(version?.modrinth?.publishedAt, version?.curseforge?.publishedAt);
  add(
    'versionAge',
    foundAny &&
      published !== null &&
      input.now.getTime() - published > points.versionAgeDays * DAY_MS
      ? 'earned'
      : 'notEarned',
    points.versionAge,
  );

  add(
    'bothPlatforms',
    !input.curseforgeConfigured && foundAny
      ? 'unavailable'
      : flag(foundOnModrinth && foundOnCurseforge),
    points.bothPlatforms,
  );

  if (kind === 'mod') {
    const declaredVersion = input.declared.version?.trim();
    const declaredLoader = input.declared.loader?.trim().toLowerCase();
    const modrinthVersion = version?.modrinth;
    add(
      'identityMatch',
      platform(
        !declaredVersion || !declaredLoader || !modrinthVersion
          ? 'unavailable'
          : flag(
              modrinthVersion.loaders.some((loader) => loader.toLowerCase() === declaredLoader) &&
                (modrinthVersion.versionNumber === declaredVersion ||
                  modrinthVersion.versionNumber.includes(declaredVersion)),
            ),
      ),
      points.identityMatch,
    );
    add(
      'serverSide',
      platform(
        !modrinth || modrinth.serverSide === 'unknown'
          ? 'unavailable'
          : flag(modrinth.serverSide === 'required'),
      ),
      points.serverSide,
    );
  }

  if (kind === 'resourcepack') {
    add('texturesClean', flag(facts?.alteredTextures === false), points.texturesClean);
    add('noCoreShaders', flag(facts?.coreShaders === false), points.noCoreShaders);
  }

  const fullMax = sum(rows.map((row) => row.points));
  const availableMax = fullMax - sum(rows.filter((r) => r.state === 'unavailable').map(pointsOf));
  const earned = sum(rows.filter((row) => row.state === 'earned').map(pointsOf));
  const scaled = availableMax > 0 ? Math.round((earned * fullMax) / availableMax) : 0;

  const penalties: { key: AnticheatPenaltyKey; points: number }[] = [];
  if (!foundAny) {
    penalties.push({ key: 'unknown', points: points.unknown });
    if (input.declaredModIdKnown && kind !== 'shader') {
      penalties.push({ key: 'suspectedModified', points: points.suspectedModified });
    }
  }
  if (kind === 'resourcepack' && facts?.alteredTextures === true) {
    penalties.push({ key: 'texturesAltered', points: points.texturesAltered });
  }
  if (kind === 'resourcepack' && facts?.coreShaders === true) {
    penalties.push({ key: 'coreShaders', points: points.coreShaders });
  }

  const raw = scaled + sum(penalties.map(pointsOf));
  const score = clamp(raw, 1, 99);
  return {
    score,
    band: bandOf(score, rules),
    breakdown: {
      path: 'computed',
      overrides: [],
      criteria: rows,
      fullMax,
      availableMax,
      earned,
      scaled,
      penalties,
      raw,
      score,
    },
  };
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function pointsOf(item: { points: number }): number {
  return item.points;
}

/** The earliest of some ISO dates, as a timestamp, or null when there is none. */
function earliest(...dates: (string | undefined)[]): number | null {
  const times = dates
    .filter((date): date is string => Boolean(date))
    .map((date) => Date.parse(date))
    .filter((time) => !Number.isNaN(time));
  return times.length > 0 ? Math.min(...times) : null;
}

/**
 * The score a file counts for once the player's trust is added, for scores from 1 to 99 only.
 * `keepOwn` is for a mod found on neither platform: trust never lifts it.
 */
export function effectiveScore(
  fileScore: number,
  playerScore: number,
  rules: AnticheatRules,
  keepOwn = false,
): number {
  if (fileScore <= 0 || fileScore >= 100) return fileScore;
  const adjusted = clamp(
    Math.round(fileScore + (playerScore - 50) * rules.player.adjustFactor),
    1,
    99,
  );
  return keepOwn && adjusted > fileScore ? fileScore : adjusted;
}

/** What the policy says for a file in a band. Client entries and pending files are allowed. */
export function fileAction(
  kind: AnticheatFileKind,
  band: AnticheatFileBand | null,
  rules: AnticheatRules,
): AnticheatAction {
  if (kind === 'client' || band === null) return 'allow';
  return rules.policy[kind][band];
}

export function playerBandOf(score: number, rules: AnticheatRules): AnticheatPlayerBand {
  if (score <= 0) return 'zero';
  if (score >= rules.player.trusted) return 'trusted';
  if (score >= rules.player.held) return 'normal';
  return 'held';
}

/** `held` gives `hold`, `zero` gives `kick`, and a stored manual hold gives `hold`. */
export function playerAction(
  score: number,
  manualHold: boolean,
  rules: AnticheatRules,
): AnticheatAction {
  const band = playerBandOf(score, rules);
  if (band === 'zero') return 'kick';
  return band === 'held' || manualHold ? 'hold' : 'allow';
}

export function actionRank(action: AnticheatAction): number {
  return ANTICHEAT_ACTIONS.indexOf(action);
}

export function mostSevere(actions: AnticheatAction[]): AnticheatAction {
  return actions.reduce<AnticheatAction>(
    (worst, action) => (actionRank(action) > actionRank(worst) ? action : worst),
    'allow',
  );
}

export interface VerdictFile {
  sha512: string;
  name: string;
  kind: AnticheatFileKind;
  band: AnticheatFileBand | null;
  action: AnticheatAction;
}

function fileReasonCode(file: VerdictFile): AnticheatVerdictReason['code'] | null {
  switch (file.action) {
    case 'ban':
    case 'kick':
      return 'fileBanned';
    case 'refuse':
      return 'fileRefused';
    case 'hold':
      return 'fileHeld';
    case 'warn':
      return 'packWarning';
    case 'flag':
      return 'fileFlagged';
    default:
      return null;
  }
}

/**
 * The most severe action over a session's files and the player, with the reasons. In observe mode
 * the action is always `allow` and `wouldBe` holds the real one. In enforce mode `wouldBe` is absent.
 */
export function verdictOf(
  files: VerdictFile[],
  player: { score: number; manualHold: boolean },
  mode: Exclude<AnticheatMode, 'off'>,
  rules: AnticheatRules,
): AnticheatVerdict {
  const reasons: AnticheatVerdictReason[] = [];
  for (const file of files) {
    const code = fileReasonCode(file);
    if (code) reasons.push({ code, sha512: file.sha512, name: file.name, action: file.action });
  }

  const band = playerBandOf(player.score, rules);
  if (band === 'zero') reasons.push({ code: 'playerZero', action: 'kick' });
  else if (band === 'held') reasons.push({ code: 'playerHeld', action: 'hold' });
  if (player.manualHold) reasons.push({ code: 'manualHold', action: 'hold' });

  const real = mostSevere(reasons.map((reason) => reason.action));
  // Most severe first, so the server's message names the file that mattered.
  reasons.sort((a, b) => actionRank(b.action) - actionRank(a.action));
  return mode === 'observe'
    ? { action: 'allow', wouldBe: real, reasons }
    : { action: real, reasons };
}

/** An event already recorded in the session, for the caps. `delta` is what was recorded. */
export interface SessionEvent {
  kind: AnticheatPlayerEventKind;
  delta: number;
}

/**
 * The delta of an event the server sends (or the modlist check), before the score is clamped to
 * 0 to 100. Missed challenges stop at a cap per session, and an incomplete modlist counts once.
 */
export function applyPlayerEvent(
  score: number,
  kind:
    | 'challengeWrong'
    | 'challengeMissed'
    | 'modSetChanged'
    | 'channelMismatch'
    | 'modlistIncomplete',
  sessionEvents: readonly SessionEvent[],
  rules: AnticheatRules,
): number {
  const base = rules.player[kind];
  let delta = base;
  if (kind === 'challengeMissed') {
    const used = sum(sessionEvents.filter((e) => e.kind === kind).map(pointsOfDelta));
    delta = Math.max(base, Math.min(0, rules.player.challengeMissedSessionCap - used));
  } else if (kind === 'modlistIncomplete' && sessionEvents.some((e) => e.kind === kind)) {
    delta = 0;
  }
  return clamp(score + delta, 0, 100) - score;
}

function pointsOfDelta(item: { delta: number }): number {
  return item.delta;
}

/**
 * Trust earned by playing: whole hours of a session, up to the daily cap (UTC days). None when the
 * session had a penalty, recorded or applied.
 */
export function playtimeGain(
  sessionSeconds: number,
  gainedToday: number,
  hadPenalty: boolean,
  rules: AnticheatRules,
): number {
  if (hadPenalty) return 0;
  const hours = Math.floor(sessionSeconds / 3600) * rules.player.playPerHour;
  return Math.max(0, Math.min(hours, rules.player.playDailyCap - gainedToday));
}
