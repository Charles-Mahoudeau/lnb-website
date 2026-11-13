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
    expect(tints.size).toBe(8);
  });

  it('pairs each background with its own wolf color', () => {
    for (let i = 0; i < 50; i++) {
      const tint = avatarTint(`user-${String(i)}`);
      expect(tint.wolf).toBe(tint.root.replace('bg-avatar-', 'text-avatar-ink-'));
    }
  });
});
