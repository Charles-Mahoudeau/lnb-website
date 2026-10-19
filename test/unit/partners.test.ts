import { describe, expect, it } from 'vitest';

import en from '../../i18n/locales/en.json' with { type: 'json' };
import fr from '../../i18n/locales/fr.json' with { type: 'json' };
import {
  PARTNER_KINDS,
  PARTNER_KIND_ICONS,
  PARTNER_PROBLEMS,
  partnerBody,
  partnerLogoParams,
  partnerPatchBody,
  partnerSettingsBody,
} from '../../shared/schemas/partners.ts';
import { isUnsafeSvg } from '../../shared/utils/partners.ts';

const logoKey = 'a'.repeat(64) + '.webp';

describe('partner bodies', () => {
  const body = {
    kind: 'sponsor',
    name: 'Northpeak Hardware',
    description: { en: 'Lends the gaming PCs.', fr: '' },
    url: 'https://northpeak.example',
    logoKey,
    visible: true,
  };

  it('needs an English description, but not a French one', () => {
    expect(partnerBody.safeParse(body).success).toBe(true);
    expect(partnerBody.safeParse({ ...body, description: { en: ' ', fr: 'Oui' } }).success).toBe(
      false,
    );
  });

  it('only takes the three kinds', () => {
    for (const kind of PARTNER_KINDS)
      expect(partnerBody.safeParse({ ...body, kind }).success).toBe(true);
    expect(partnerBody.safeParse({ ...body, kind: 'media' }).success).toBe(false);
  });

  it('makes the link optional and https only', () => {
    expect(partnerBody.parse({ ...body, url: '' }).url).toBeNull();
    expect(partnerBody.parse({ ...body, url: null }).url).toBeNull();
    expect(partnerBody.safeParse({ ...body, url: 'http://example.com' }).success).toBe(false);
    expect(partnerBody.safeParse({ ...body, url: 'javascript:alert(1)' }).success).toBe(false);
  });

  it('refuses a logo key that is not a stored file name', () => {
    expect(partnerBody.safeParse({ ...body, logoKey: '../secret.webp' }).success).toBe(false);
    expect(partnerBody.safeParse({ ...body, logoKey: 'a'.repeat(64) + '.png' }).success).toBe(
      false,
    );
    expect(partnerBody.safeParse({ ...body, logoKey: 'a'.repeat(64) + '.svg' }).success).toBe(true);
  });

  it('refuses an empty patch', () => {
    expect(partnerPatchBody.safeParse({}).success).toBe(false);
    expect(partnerPatchBody.safeParse({ visible: false }).success).toBe(true);
  });

  it('checks the logo route key', () => {
    expect(partnerLogoParams.safeParse({ key: logoKey }).success).toBe(true);
    expect(partnerLogoParams.safeParse({ key: '../x.webp' }).success).toBe(false);
  });
});

describe('partner contact link', () => {
  it('takes an https link or a mailto: address, trimmed', () => {
    expect(partnerSettingsBody.parse({ contactUrl: ' https://forms.example.com/x ' })).toEqual({
      contactUrl: 'https://forms.example.com/x',
    });
    expect(partnerSettingsBody.parse({ contactUrl: 'mailto:lnb@example.com' })).toEqual({
      contactUrl: 'mailto:lnb@example.com',
    });
  });

  it('turns an empty link into null, which hides the band', () => {
    expect(partnerSettingsBody.parse({ contactUrl: '' })).toEqual({ contactUrl: null });
    expect(partnerSettingsBody.parse({ contactUrl: null })).toEqual({ contactUrl: null });
  });

  it.each([
    'http://example.com',
    'javascript:alert(1)',
    'mailto:nobody',
    'example.com',
    'https://',
  ])('refuses %s', (contactUrl) => {
    expect(partnerSettingsBody.safeParse({ contactUrl }).success).toBe(false);
  });
});

describe('svg logos', () => {
  it('lets a plain drawing through', () => {
    expect(
      isUnsafeSvg('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10v10z"/></svg>'),
    ).toBe(false);
  });

  it.each([
    '<svg><script>alert(1)</script></svg>',
    '<svg onload="alert(1)"></svg>',
    '<svg><foreignObject><div/></foreignObject></svg>',
    '<svg><a href="javascript:alert(1)"><path/></a></svg>',
  ])('stops %s', (svg) => {
    expect(isUnsafeSvg(svg)).toBe(true);
  });
});

describe('partner translations', () => {
  it('has text for every problem, kind and icon, in both languages', () => {
    for (const messages of [en, fr]) {
      for (const problem of PARTNER_PROBLEMS) {
        expect(messages.admin.partners.errors).toHaveProperty(problem);
      }
      for (const kind of PARTNER_KINDS) {
        expect(messages.partners.kinds).toHaveProperty(kind);
        expect(PARTNER_KIND_ICONS[kind]).toMatch(/^i-lucide-/);
      }
    }
  });
});
