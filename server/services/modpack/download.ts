import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';

import { isPrivateAddress } from '~~/server/services/events/rules';

import { MAX_FILE_BYTES } from '#shared/schemas/files';
import type { ModpackProblem } from '#shared/schemas/modpack';

// Downloads a jar to hash it, without keeping it: the Modlist stores the hash and the link, and
// launchers fetch from the link. Used for custom links and for CurseForge files, which don't
// publish a SHA-512. Only https, only public hosts, and every redirect is checked again.

const TIMEOUT_MS = 60_000;
const MAX_REDIRECTS = 3;

/** Thrown with the problem the route answers with. */
export class DownloadError extends Error {
  constructor(readonly problem: ModpackProblem) {
    super(problem);
  }
}

export interface HashedFile {
  sha256: string;
  sha512: string;
  size: number;
  /** The last part of the final address. */
  fileName: string;
}

async function checkHost(hostname: string): Promise<void> {
  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname.replace(/^\[|\]$/g, ''), { all: true });
  } catch {
    throw new DownloadError('unreachable');
  }
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new DownloadError('unreachable');
  }
}

/** Whether the host may be fetched: any public host, or only those the caller allows. */
export function hostAllowed(host: string, allowed?: readonly string[]): boolean {
  return !allowed || allowed.some((entry) => host === entry || host.endsWith(`.${entry}`));
}

/** Hashes the file at an https link. With `hosts`, only those hosts and their subdomains. */
export async function downloadAndHash(url: string, hosts?: readonly string[]): Promise<HashedFile> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let target: URL;
    try {
      target = new URL(current);
    } catch {
      throw new DownloadError('badUrl');
    }
    if (target.protocol !== 'https:' || target.username || target.password) {
      throw new DownloadError('badUrl');
    }
    if (!hostAllowed(target.hostname, hosts)) throw new DownloadError('badUrl');
    await checkHost(target.hostname);

    let response: Response;
    try {
      response = await fetch(target, {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new DownloadError('unreachable');
    }
    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      current = new URL(location, target).toString();
      continue;
    }
    if (!response.ok || !response.body) throw new DownloadError('unreachable');
    if (Number(response.headers.get('content-length') ?? 0) > MAX_FILE_BYTES) {
      throw new DownloadError('tooLarge');
    }

    const sha256 = createHash('sha256');
    const sha512 = createHash('sha512');
    let size = 0;
    let head = Buffer.alloc(0);
    try {
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > MAX_FILE_BYTES) throw new DownloadError('tooLarge');
        if (head.length < 4) head = Buffer.concat([head, chunk]).subarray(0, 4);
        sha256.update(chunk);
        sha512.update(chunk);
      }
    } catch (error) {
      if (error instanceof DownloadError) throw error;
      throw new DownloadError('unreachable');
    }
    // Every jar is a zip archive.
    if (size === 0 || head[0] !== 0x50 || head[1] !== 0x4b) throw new DownloadError('notAJar');
    const fileName = decodeURIComponent(target.pathname.split('/').pop() ?? '') || 'mod.jar';
    return { sha256: sha256.digest('hex'), sha512: sha512.digest('hex'), size, fileName };
  }
  throw new DownloadError('unreachable');
}
