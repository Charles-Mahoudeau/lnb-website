// Plays the Minecraft server's part of the anticheat locally: sends one report for a Warden
// session and prints the verdict. See docs/anticheat.md ("Trying it locally").
//
//   node scripts/anticheat-simulate.ts --session <id> --files files.json [--url http://localhost:3000]
//
// `files.json` is an array of report files, as in the contract (kind, sha512, filename...).
// WARDEN_SERVER_SECRET is read from `.env`. Needs Node 22.18 or later (it runs TypeScript as is).
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    session: { type: 'string' },
    files: { type: 'string' },
    url: { type: 'string', default: 'http://localhost:3000' },
  },
});

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

if (!values.session || !values.files) {
  fail(
    'Usage: node scripts/anticheat-simulate.ts --session <id> --files <file.json> [--url <site>]',
  );
}

try {
  process.loadEnvFile('.env');
} catch {
  // No .env: the secret may already be in the environment.
}
const secret = process.env.WARDEN_SERVER_SECRET;
if (!secret) fail('WARDEN_SERVER_SECRET is not set in .env or the environment.');

const files: unknown = JSON.parse(readFileSync(values.files, 'utf8'));
if (!Array.isArray(files)) fail(`${values.files} must hold a JSON array of files.`);

const response = await fetch(new URL('/api/warden/server/anticheat/reports', values.url), {
  method: 'POST',
  headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
  body: JSON.stringify({ sessionId: values.session, files }),
});
const text = await response.text();
let body: unknown = text;
try {
  body = JSON.parse(text);
} catch {
  // Not JSON: print it as it came.
}
if (!response.ok) {
  console.error(`HTTP ${String(response.status)}`);
  console.error(typeof body === 'string' ? body : JSON.stringify(body, null, 2));
  process.exit(1);
}

const report = body as {
  mode: string;
  verdict: { action: string; wouldBe?: string; reasons: { code: string; name?: string }[] };
  player?: { score: number; band: string };
  files: { name?: string; sha512: string; state: string; score?: number; action?: string }[];
  pending: number;
};
console.log(`Mode: ${report.mode}`);
console.log(
  `Verdict: ${report.verdict.action}${report.verdict.wouldBe ? ` (would be ${report.verdict.wouldBe})` : ''}`,
);
for (const reason of report.verdict.reasons) {
  console.log(`  - ${reason.code}${reason.name ? `: ${reason.name}` : ''}`);
}
if (report.player) console.log(`Player: ${String(report.player.score)} (${report.player.band})`);
for (const file of report.files) {
  const score = file.score === undefined ? '-' : String(file.score);
  console.log(
    `  ${file.state.padEnd(8)} ${score.padStart(3)}  ${file.action ?? '-'}  ${file.name ?? file.sha512.slice(0, 10)}`,
  );
}
if (report.pending > 0) {
  console.log(`${String(report.pending)} file(s) still pending a lookup. Ask again in a minute:`);
  console.log(`  GET /api/warden/server/anticheat/sessions/${values.session}`);
}
