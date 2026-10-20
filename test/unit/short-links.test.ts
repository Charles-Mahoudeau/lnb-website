import { describe, expect, it } from 'vitest';

import en from '../../i18n/locales/en.json' with { type: 'json' };
import fr from '../../i18n/locales/fr.json' with { type: 'json' };
import {
  SHORT_LINK_PROBLEMS,
  shortLinkBody,
  shortLinkPatchBody,
} from '../../shared/schemas/short-links.ts';
import {
  SHORT_ID_PATTERN,
  decideAccess,
  isPreviewRequest,
  randomShortId,
} from '../../shared/utils/short-links.ts';

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';
const ISEG = '8dab9574-4b8e-4eec-8e5e-791d6835fdea';
const EARTSUP = '791f2edf-38ab-4c6c-b323-ea94dd988fde';

describe('decideAccess', () => {
  it('lets anyone through an open link', () => {
    expect(decideAccess({ access: 'any', tenantIds: [] }, null)).toBe('open');
    expect(decideAccess({ access: 'any', tenantIds: [] }, EPITECH)).toBe('open');
  });

  it('asks signed-out visitors to sign in, whatever the lock', () => {
    expect(decideAccess({ access: 'signed', tenantIds: [] }, null)).toBe('signIn');
    expect(decideAccess({ access: 'schools', tenantIds: [EPITECH] }, null)).toBe('signIn');
  });

  it('opens a signed-in link to every allowed school', () => {
    expect(decideAccess({ access: 'signed', tenantIds: [] }, ISEG)).toBe('open');
  });

  it('keeps a schools link to its schools, matching tenant IDs without case', () => {
    const link = { access: 'schools', tenantIds: [EPITECH, ISEG] } as const;
    expect(decideAccess(link, EPITECH.toUpperCase())).toBe('open');
    expect(decideAccess(link, ISEG)).toBe('open');
    expect(decideAccess(link, EARTSUP)).toBe('wrongSchool');
  });
});

describe('preview requests', () => {
  it('are not counted: crawlers, previews, HEAD and a missing user agent', () => {
    expect(isPreviewRequest('GET', 'Mozilla/5.0 (compatible; Discordbot/2.0)')).toBe(true);
    expect(isPreviewRequest('GET', 'Slackbot-LinkExpanding 1.0')).toBe(true);
    expect(isPreviewRequest('GET', 'Mozilla/5.0 (Windows NT 10.0) SkypeUriPreview')).toBe(true);
    expect(isPreviewRequest('HEAD', 'Mozilla/5.0 Firefox/130.0')).toBe(true);
    expect(isPreviewRequest('GET', undefined)).toBe(true);
  });

  it('count browsers', () => {
    expect(isPreviewRequest('GET', 'Mozilla/5.0 (X11; Linux x86_64) Firefox/130.0')).toBe(false);
    expect(isPreviewRequest('GET', 'Mozilla/5.0 (iPhone) AppleWebKit Safari/604.1')).toBe(false);
  });
});

describe('short IDs', () => {
  it('are generated from a readable alphabet and match the pattern', () => {
    for (let i = 0; i < 200; i++) {
      const id = randomShortId();
      expect(id).toHaveLength(6);
      expect(SHORT_ID_PATTERN.test(id)).toBe(true);
      expect(id).not.toMatch(/[0o1li]/);
    }
  });

  it('take lowercase letters, numbers and single dashes only', () => {
    for (const ok of ['lan-party', 'a1', 'rl-2026-autumn'])
      expect(SHORT_ID_PATTERN.test(ok)).toBe(true);
    for (const bad of ['-a', 'a-', 'a--b', 'LAN', 'a b', 'a/b', 'é']) {
      expect(SHORT_ID_PATTERN.test(bad)).toBe(false);
    }
  });
});

describe('short link bodies', () => {
  const body = {
    shortId: 'Lan-Party',
    name: 'LAN party signup',
    destinationUrl: 'https://forms.example.com/lan',
    access: 'signed',
    tenantIds: [],
    recordClicks: true,
    enabled: true,
  };

  it('lowercases the short ID, and an empty one asks for a random ID', () => {
    expect(shortLinkBody.parse(body).shortId).toBe('lan-party');
    expect(shortLinkBody.safeParse({ ...body, shortId: '' }).success).toBe(true);
    expect(shortLinkBody.safeParse({ ...body, shortId: 'a' }).success).toBe(false);
  });

  it('only sends to https pages', () => {
    for (const destinationUrl of [
      'http://x.example.com',
      'javascript:alert(1)',
      '//x.example.com',
      'https://',
    ]) {
      expect(shortLinkBody.safeParse({ ...body, destinationUrl }).success).toBe(false);
    }
  });

  it('needs a school when it is for schools, and knows only our schools', () => {
    const schools = { ...body, access: 'schools' };
    expect(shortLinkBody.safeParse({ ...schools, tenantIds: [] }).success).toBe(false);
    expect(shortLinkBody.safeParse({ ...schools, tenantIds: ['nope'] }).success).toBe(false);
    expect(shortLinkBody.safeParse({ ...schools, tenantIds: [EPITECH] }).success).toBe(true);
  });

  it('can’t record who clicks on an open link', () => {
    expect(shortLinkBody.safeParse({ ...body, access: 'any', recordClicks: true }).success).toBe(
      false,
    );
    expect(shortLinkBody.safeParse({ ...body, access: 'any', recordClicks: false }).success).toBe(
      true,
    );
  });

  it('keeps the short ID out of a patch, and refuses an empty one', () => {
    expect(shortLinkPatchBody.safeParse({ shortId: 'other' }).success).toBe(false);
    expect(shortLinkPatchBody.safeParse({}).success).toBe(false);
    expect(shortLinkPatchBody.safeParse({ enabled: false }).success).toBe(true);
  });
});

describe('short link messages', () => {
  it('has a message for every problem, in both languages', () => {
    for (const locale of [en, fr]) {
      for (const problem of SHORT_LINK_PROBLEMS) {
        expect(locale.admin.shortLinks.errors[problem], problem).toBeTruthy();
      }
    }
  });

  it('has the same keys in English and French', () => {
    const keys = (value: unknown, prefix = ''): string[] =>
      typeof value === 'object' && value !== null
        ? Object.entries(value).flatMap(([k, v]) => keys(v, `${prefix}${k}.`))
        : [prefix];
    expect(keys(fr.admin.shortLinks)).toEqual(keys(en.admin.shortLinks));
    expect(keys(fr.shortLink)).toEqual(keys(en.shortLink));
  });
});
