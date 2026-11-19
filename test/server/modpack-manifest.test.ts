import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '~~/server/db';
import { modListSettings, modpackMod, modpackTool, storedFile } from '~~/server/db/schema';
import { modpackManifestService } from '~~/server/services/modpack/manifest';

vi.mock('~~/server/lib/site', () => ({
  siteUrl: (path: string) => new URL(path, 'https://lnb.example').toString(),
}));

vi.mock('~~/server/services/modpack/loader-version', () => ({
  latestLoaderVersion: () => Promise.resolve('21.1.200'),
}));

beforeEach(async () => {
  await db.delete(modpackTool);
  await db.delete(modpackMod);
  await db.delete(storedFile);
});

describe('manifest', () => {
  it('lists pinned mods with hashes and absolute downloads, and leaves out flagged ones', async () => {
    const [file] = await db
      .insert(storedFile)
      .values({ sha256: 'f'.repeat(64), sha512: 'g', name: 'Own Mod.jar', kind: 'mod', size: 9 })
      .returning();
    await db.insert(storedFile).values([
      { sha256: 'a'.repeat(64), sha512: 'b', name: 'wrapper.jar', kind: 'wrapper', size: 5 },
      { sha256: 'c'.repeat(64), sha512: 'd', name: 'extra.json', kind: 'asset', size: 2 },
    ]);
    await db.insert(modpackMod).values([
      {
        source: 'modrinth',
        sourceId: 'x',
        name: 'Sodium',
        pinnedVersion: '1',
        pinnedFileName: 's.jar',
        pinnedUrl: 'https://cdn.modrinth.com/s.jar',
        pinnedSha512: 'h1',
        pinnedSize: 3,
        side: 'client',
        iconKey: 'k1',
      },
      {
        source: 'upload',
        name: 'Ours',
        pinnedVersion: '2',
        pinnedFileName: file!.name,
        pinnedSha256: file!.sha256,
        pinnedSha512: file!.sha512,
        pinnedSize: 9,
        pinnedFileId: file!.id,
      },
      { source: 'modrinth', sourceId: 'y', name: 'NoFile' },
      {
        source: 'url',
        name: 'Changed',
        attention: 'urlChanged',
        pinnedVersion: '1',
        pinnedUrl: 'https://example.com/c.jar',
        pinnedSha512: 'old',
      },
    ]);
    const manifest = await modpackManifestService.build();
    expect(manifest).toMatchObject({
      schema: 1,
      gameVersion: '1.21.1',
      loader: 'neoforge',
      loaderVersion: '21.1.200',
    });
    expect(manifest.mods.map((m) => m.name)).toEqual(['Ours', 'Sodium']);
    expect(manifest.mods[0]).toMatchObject({
      downloads: [`https://lnb.example/api/files/${'f'.repeat(64)}/Own%20Mod.jar`],
      hashes: { sha256: 'f'.repeat(64), sha512: 'g' },
    });
    expect(manifest.mods[1]).toMatchObject({
      side: 'client',
      downloads: ['https://cdn.modrinth.com/s.jar'],
      hashes: { sha512: 'h1' },
    });
    expect(manifest.mods[1]!.hashes).not.toHaveProperty('sha256');
    // The logo is an absolute address on this site, null without one.
    expect(manifest.mods[1]!.icon).toBe(
      `https://lnb.example/api/minecraft/modpack/mods/${manifest.mods[1]!.id}/icon?v=k1`,
    );
    expect(manifest.mods[0]!.icon).toBeNull();
    // A wrapper jar is a tool, listed once it is published, not an asset.
    expect(manifest.assets).toEqual([
      expect.objectContaining({ name: 'extra.json', kind: 'asset' }),
    ]);
    expect(manifest.tools).toEqual({});
  });

  it('has an ETag that follows the content', async () => {
    const first = await modpackManifestService.render();
    expect((await modpackManifestService.render()).etag).toBe(first.etag);
    await db.insert(modpackMod).values({
      source: 'url',
      name: 'New',
      pinnedVersion: '1',
      pinnedUrl: 'https://example.com/n.jar',
      pinnedSha512: 'n',
    });
    expect((await modpackManifestService.render()).etag).not.toBe(first.etag);
  });

  it('resolves latest, and keeps a version an admin pinned', async () => {
    expect((await modpackManifestService.build()).loaderVersion).toBe('21.1.200');
    await db
      .update(modListSettings)
      .set({ loaderVersion: '21.1.100' })
      .where(eq(modListSettings.id, 1));
    expect((await modpackManifestService.build()).loaderVersion).toBe('21.1.100');
    await db
      .update(modListSettings)
      .set({ loaderVersion: 'latest' })
      .where(eq(modListSettings.id, 1));
  });

  it('lists the current tools with absolute addresses', async () => {
    const [launcher, updater] = await db
      .insert(storedFile)
      .values([
        {
          sha256: '1'.repeat(64),
          sha512: 'l5',
          name: 'lnb-modsync-launcher.jar',
          kind: 'wrapper',
          size: 7,
        },
        {
          sha256: '2'.repeat(64),
          sha512: 'u5',
          name: 'lnb-modsync-updater.jar',
          kind: 'updater',
          size: 8,
        },
      ])
      .returning();
    await db.insert(modpackTool).values([
      { tool: 'launcher', fileId: launcher!.id, version: '1.0.0' },
      { tool: 'updater', fileId: updater!.id, version: '2.1.0' },
    ]);
    const { tools } = await modpackManifestService.build();
    expect(tools.launcher).toEqual({
      version: '1.0.0',
      fileName: 'lnb-modsync-launcher.jar',
      size: 7,
      hashes: { sha256: '1'.repeat(64), sha512: 'l5' },
      url: `https://lnb.example/api/files/${'1'.repeat(64)}/lnb-modsync-launcher.jar`,
    });
    expect(tools.updater?.version).toBe('2.1.0');
  });
});
