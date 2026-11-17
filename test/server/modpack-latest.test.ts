import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveLatest } from '~~/server/services/modpack/latest';
import { getJson } from '~~/server/services/mods/catalog';

// The mod catalog caches through Nitro, which isn't running here.
vi.mock('nitropack/runtime', () => ({
  defineCachedFunction: <T>(fn: T) => fn,
  useStorage: () => ({}),
}));
vi.mock('~~/server/services/mods/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~~/server/services/mods/catalog')>()),
  getJson: vi.fn(),
}));

const target = { gameVersion: '1.21.1', loader: 'neoforge' } as const;
const fetchJson = vi.mocked(getJson);

const file = (filename: string, primary: boolean) => ({
  url: `https://cdn.modrinth.com/${filename}`,
  filename,
  primary,
  size: 1,
  hashes: { sha512: filename },
});

const version = (files: ReturnType<typeof file>[]) => ({
  version_number: '1.0.0',
  version_type: 'release' as const,
  date_published: '2026-01-01T00:00:00Z',
  files,
});

async function pickedName(files: ReturnType<typeof file>[]) {
  fetchJson.mockResolvedValueOnce([version(files)]);
  const result = await resolveLatest('modrinth', 'project', target);
  if (result.kind !== 'file') throw new Error('expected a file');
  return result.file.fileName;
}

describe('resolveLatest on Modrinth', () => {
  beforeEach(() => {
    fetchJson.mockReset();
  });

  it('takes the primary file', async () => {
    expect(await pickedName([file('m-1.0.jar', true), file('m-1.0-extra.jar', false)])).toBe(
      'm-1.0.jar',
    );
  });

  it('skips a sources jar even when the author flagged it primary', async () => {
    expect(await pickedName([file('m-1.0-sources.jar', true), file('m-1.0.jar', false)])).toBe(
      'm-1.0.jar',
    );
  });

  it('skips javadoc and dev jars', async () => {
    expect(
      await pickedName([
        file('m-1.0-javadoc.jar', true),
        file('m-1.0-dev.jar', false),
        file('m-1.0.jar', false),
      ]),
    ).toBe('m-1.0.jar');
  });

  it('keeps a sources jar when it is the only file', async () => {
    expect(await pickedName([file('m-1.0-sources.jar', true)])).toBe('m-1.0-sources.jar');
  });
});
