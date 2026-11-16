import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '~~/server/db';
import { mod, modpackMod, modpackState, user } from '~~/server/db/schema';
import { modpackExportService } from '~~/server/services/modpack/export';
import { resolveLatest } from '~~/server/services/modpack/latest';
import { modCatalog } from '~~/server/services/mods/catalog';

vi.mock('nitropack/runtime', () => ({
  defineCachedFunction: <T>(fn: T) => fn,
  useStorage: () => ({}),
}));
vi.mock('~~/server/services/modpack/latest', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~~/server/services/modpack/latest')>()),
  resolveLatest: vi.fn(),
}));

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';
const ADMIN = 'modpack-export-admin';
const actor = { source: 'web', userId: ADMIN } as const;
const resolve = vi.mocked(resolveLatest);

let counter = 0;
const unique = () => `${String(++counter)}-${Math.random().toString(16).slice(2)}`;
const revision = async () =>
  (await db.select().from(modpackState).where(eq(modpackState.id, 1)))[0]!.revision;
const names = async () => (await db.select().from(modpackMod)).map((row) => row.name).sort();

async function vote(name: string, values: Partial<typeof mod.$inferInsert> = {}) {
  const sourceId = `v-${unique()}`;
  const [row] = await db
    .insert(mod)
    .values({
      list: 'official',
      status: 'visible',
      source: 'modrinth',
      sourceId,
      name,
      pageUrl: `https://modrinth.com/mod/${sourceId}`,
      ...values,
    })
    .returning();
  return row!;
}

async function pack(name: string, values: Partial<typeof modpackMod.$inferInsert> = {}) {
  const [row] = await db
    .insert(modpackMod)
    .values({ source: 'modrinth', sourceId: `p-${unique()}`, name, ...values })
    .returning();
  return row!;
}

beforeAll(async () => {
  await db
    .insert(user)
    .values({ id: ADMIN, name: 'Ada Lovelace', email: `${ADMIN}@epitech.eu`, tenantId: EPITECH })
    .onConflictDoNothing();
});

beforeEach(async () => {
  await db.delete(modpackMod);
  await db.delete(mod);
  resolve.mockReset();
  resolve.mockResolvedValue({
    kind: 'file',
    file: {
      version: '1',
      fileName: 'm.jar',
      url: 'https://x/m',
      sha256: null,
      sha512: 'h',
      size: 3,
    },
  });
  vi.spyOn(modCatalog, 'project').mockImplementation((source, sourceId) =>
    Promise.resolve({
      source,
      sourceId,
      name: `Project ${sourceId}`,
      summary: '',
      pageUrl: `https://example.com/${sourceId}`,
    } as never),
  );
});

describe('export diff', () => {
  it('lists the missing mods, and skips the ones added by hand', async () => {
    const have = await vote('Have');
    await pack('Have', { source: have.source, sourceId: have.sourceId });
    await vote('Missing');
    await vote('Manual', { source: 'manual', sourceId: null });
    await vote('Hidden', { status: 'removed' });
    await vote('Suggested', { list: 'suggestion' });
    const preview = await modpackExportService.preview('add');
    expect(preview.items.map((i) => [i.kind, i.name])).toEqual([['add', 'Missing']]);
    expect(preview.skipped).toEqual(['Manual']);
  });

  it('sync drops catalog mods that left the vote, replace drops everything else too', async () => {
    const have = await vote('Have');
    await pack('Have', { source: have.source, sourceId: have.sourceId });
    await pack('Gone');
    await pack('Link', { source: 'url', sourceId: null });
    const sync = await modpackExportService.preview('sync');
    expect(sync.items.map((i) => [i.kind, i.name])).toEqual([['remove', 'Gone']]);
    const replace = await modpackExportService.preview('replace');
    expect(replace.items.map((i) => [i.name, i.custom])).toEqual([
      ['Gone', false],
      ['Link', true],
    ]);
  });

  it('syncs the optional flag in sync and replace only', async () => {
    const have = await vote('Have', { optional: true });
    await pack('Have', { source: have.source, sourceId: have.sourceId });
    expect((await modpackExportService.preview('add')).items).toEqual([]);
    expect((await modpackExportService.preview('sync')).items.map((i) => i.kind)).toEqual([
      'update',
    ]);
  });
});

describe('export apply', () => {
  it('applies only the ticked changes, with one revision bump', async () => {
    const one = await vote('One');
    await vote('Two');
    await pack('Gone');
    const before = await revision();
    const preview = await modpackExportService.preview('sync');
    const keys = preview.items.filter((i) => i.name !== 'Two').map((i) => i.key);
    expect(keys).toContain(`add:${String(one.id)}`);
    const result = await modpackExportService.apply({ mode: 'sync', keys, actor });
    expect(result).toMatchObject({ added: 1, removed: 1, failed: 0 });
    expect(await names()).toEqual([`Project ${one.sourceId!}`]);
    expect(await revision()).toBe(before + 1);
    const [added] = await db.select().from(modpackMod);
    expect(added).toMatchObject({ voteModId: one.id, pinnedSha512: 'h' });
  });

  it('adds a mod with no compatible file flagged, and counts it', async () => {
    await vote('Nofile');
    resolve.mockResolvedValue({ kind: 'none' });
    const { items } = await modpackExportService.preview('add');
    const result = await modpackExportService.apply({
      mode: 'add',
      keys: items.map((i) => i.key),
      actor,
    });
    expect(result).toMatchObject({ added: 1, flagged: 1 });
    expect((await db.select().from(modpackMod))[0]!.attention).toBe('noCompatibleFile');
  });

  it('ignores keys that are not in the diff, and changes nothing when none apply', async () => {
    await vote('One');
    const before = await revision();
    const result = await modpackExportService.apply({ mode: 'add', keys: ['remove:nope'], actor });
    expect(result).toEqual({ added: 0, removed: 0, updated: 0, flagged: 0, failed: 0 });
    expect(await revision()).toBe(before);
  });
});
