import { describe, expect, it } from 'vitest';

import {
  catalogIconPath,
  createRateLimiter,
  isCatalogIconUrl,
  isCompatible,
  mergeCatalogResults,
  normalizeName,
  suggestionsLeft,
} from '../../server/services/mods/rules.ts';
import { modAddBody, modSuggestBody, modVoteBody } from '../../shared/schemas/mods.ts';

const server = { gameVersion: '1.21.1', loader: 'neoforge' } as const;

describe('isCompatible', () => {
  it('needs the server version and loader', () => {
    expect(isCompatible({ gameVersions: ['1.21.1'], loaders: ['neoforge'] }, server)).toBe(true);
    expect(isCompatible({ gameVersions: ['1.21'], loaders: ['neoforge'] }, server)).toBe(false);
    expect(isCompatible({ gameVersions: ['1.21.1'], loaders: ['fabric'] }, server)).toBe(false);
  });

  it("doesn't take Forge mods for NeoForge", () => {
    expect(isCompatible({ gameVersions: ['1.21.1'], loaders: ['forge'] }, server)).toBe(false);
  });

  it('takes Fabric mods for a Quilt server', () => {
    const quilt = { gameVersion: '1.21.1', loader: 'quilt' } as const;
    expect(isCompatible({ gameVersions: ['1.21.1'], loaders: ['fabric'] }, quilt)).toBe(true);
  });

  it('ignores other categories and case in Modrinth search hits', () => {
    const hit = { gameVersions: ['1.20.1', '1.21.1'], loaders: ['food', 'NeoForge'] };
    expect(isCompatible(hit, server)).toBe(true);
  });
});

describe('mergeCatalogResults', () => {
  const hit = (name: string, slug: string, source: string) => ({ name, slug, source });

  it('keeps Modrinth first and adds CurseForge mods that are not on Modrinth', () => {
    const merged = mergeCatalogResults(
      [hit('Farmer’s Delight', 'farmers-delight', 'modrinth')],
      [
        hit("Farmer's Delight", 'farmers-delight', 'curseforge'),
        hit('Farming for Blockheads', 'farming-for-blockheads', 'curseforge'),
      ],
      10,
    );
    expect(merged.map((m) => `${m.source}:${m.slug}`)).toEqual([
      'modrinth:farmers-delight',
      'curseforge:farming-for-blockheads',
    ]);
  });

  it('stops at the limit', () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      hit(`Mod ${String(i)}`, `mod-${String(i)}`, 'm'),
    );
    expect(mergeCatalogResults(many, [hit('Other', 'other', 'c')], 5)).toHaveLength(5);
  });

  it('matches names without punctuation or case', () => {
    expect(normalizeName("Farmer's Delight")).toBe(normalizeName('farmers-delight'));
  });
});

describe('catalog icons', () => {
  it("are fetched from Modrinth's and CurseForge's image hosts only", () => {
    expect(isCatalogIconUrl('https://cdn.modrinth.com/data/AANobbMI/icon.webp')).toBe(true);
    expect(isCatalogIconUrl('https://media.forgecdn.net/avatars/thumbnails/1/2.png')).toBe(true);
    expect(isCatalogIconUrl('http://cdn.modrinth.com/data/x/icon.png')).toBe(false);
    expect(isCatalogIconUrl('https://cdn.modrinth.com.evil.example/icon.png')).toBe(false);
    expect(isCatalogIconUrl('https://evil@cdn.modrinth.com/icon.png')).toBe(false);
    expect(isCatalogIconUrl('https://cdn.modrinth.com:8443/icon.png')).toBe(false);
    expect(isCatalogIconUrl('https://169.254.169.254/latest/meta-data')).toBe(false);
    expect(isCatalogIconUrl('not a url')).toBe(false);
  });

  it('go through the site', () => {
    expect(catalogIconPath('https://cdn.modrinth.com/data/a/icon.png')).toBe(
      '/api/minecraft/mods/catalog-icon?src=https%3A%2F%2Fcdn.modrinth.com%2Fdata%2Fa%2Ficon.png',
    );
    expect(catalogIconPath('https://example.org/icon.png')).toBeNull();
    expect(catalogIconPath(null)).toBeNull();
  });
});

describe('suggestionsLeft', () => {
  it('never goes below zero', () => {
    expect(suggestionsLeft(5, 2)).toBe(3);
    expect(suggestionsLeft(5, 5)).toBe(0);
    // An admin lowered the limit below what someone already has.
    expect(suggestionsLeft(2, 4)).toBe(0);
  });
});

describe('createRateLimiter', () => {
  it('allows the limit per window, per key', () => {
    const allow = createRateLimiter(2, 1000);
    expect(allow('a', 0)).toBe(true);
    expect(allow('a', 10)).toBe(true);
    expect(allow('a', 20)).toBe(false);
    expect(allow('b', 20)).toBe(true);
    expect(allow('a', 1000)).toBe(true);
  });
});

describe('mod list contracts', () => {
  it('take a vote of -1, 0 or 1 only', () => {
    expect(modVoteBody.safeParse({ value: 0 }).success).toBe(true);
    expect(modVoteBody.safeParse({ value: 2 }).success).toBe(false);
  });

  it('need a reason of 10 to 500 characters', () => {
    const body = { source: 'modrinth', sourceId: 'AANobbMI' };
    expect(modSuggestBody.safeParse({ ...body, reason: 'Too short' }).success).toBe(false);
    expect(modSuggestBody.safeParse({ ...body, reason: '   padded    ' }).success).toBe(false);
    expect(modSuggestBody.safeParse({ ...body, reason: 'x'.repeat(501) }).success).toBe(false);
    expect(
      modSuggestBody.safeParse({ ...body, reason: 'Fast rendering for everyone.' }).success,
    ).toBe(true);
  });

  it('take https URLs only for mods added by hand', () => {
    const manual = { source: 'manual', name: 'Our mod' };
    expect(modAddBody.safeParse({ ...manual, pageUrl: 'https://example.org' }).success).toBe(true);
    expect(modAddBody.safeParse({ ...manual, pageUrl: 'http://example.org' }).success).toBe(false);
    expect(
      modAddBody.safeParse({
        ...manual,
        pageUrl: 'https://example.org',
        iconUrl: 'file:///etc/passwd',
      }).success,
    ).toBe(false);
  });
});
