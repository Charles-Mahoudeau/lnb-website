import { describe, expect, it } from 'vitest';

import { mapSettingsBody } from '../../shared/schemas/map.ts';

describe('map settings body', () => {
  it('accepts an https address and trims it', () => {
    expect(mapSettingsBody.parse({ url: '  https://map.example.com/world  ' }).url).toBe(
      'https://map.example.com/world',
    );
  });

  it('turns an empty value or null into the default (null)', () => {
    expect(mapSettingsBody.parse({ url: '' }).url).toBeNull();
    expect(mapSettingsBody.parse({ url: null }).url).toBeNull();
  });

  it('refuses anything that is not an https address', () => {
    for (const url of [
      'http://map.example.com',
      'javascript:alert(1)',
      'map.example.com',
      'https://',
      'https://a b.com',
    ]) {
      expect(mapSettingsBody.safeParse({ url }).success, url).toBe(false);
    }
  });
});
