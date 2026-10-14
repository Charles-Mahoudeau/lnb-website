import { describe, expect, it } from 'vitest';

import { safeRedirect } from '../../app/utils/redirect.ts';

describe('safeRedirect', () => {
  it('keeps a same-site path', () => {
    expect(safeRedirect('/account?tab=push')).toBe('/account?tab=push');
  });

  it('falls back for anything that could leave the site', () => {
    for (const value of [
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      'account',
      '',
    ]) {
      expect(safeRedirect(value)).toBe('/');
    }
  });

  it('falls back for a missing or repeated query value', () => {
    expect(safeRedirect(undefined)).toBe('/');
    expect(safeRedirect(['/a', '/b'])).toBe('/');
  });
});
