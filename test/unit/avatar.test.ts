import { describe, expect, it } from 'vitest';

import { avatarTint } from '../../app/utils/avatar.ts';

describe('avatarTint', () => {
  it('gives the same ID the same tint', () => {
    expect(avatarTint('user-42')).toBe(avatarTint('user-42'));
  });

  it('spreads IDs over every tint', () => {
    const tints = new Set(
      Array.from({ length: 50 }, (_, i) => avatarTint(`user-${String(i)}`).root),
    );
    expect(tints.size).toBe(5);
  });
});
