import { describe, expect, it } from 'vitest';

import { offlineUuid, uuidMatchesAccount } from '../../server/lib/minecraft.ts';

describe('offlineUuid', () => {
  it('matches what offline-mode servers give', () => {
    expect(offlineUuid('Notch')).toBe('b50ad385-829d-3141-a216-7e7d7539ba7f');
  });
});

describe('uuidMatchesAccount', () => {
  it('wants the offline UUID for cracked accounts', () => {
    const uuid = offlineUuid('Steve');
    expect(uuidMatchesAccount({ uuid, username: 'Steve', cracked: true })).toBe(true);
    expect(uuidMatchesAccount({ uuid, username: 'Alex', cracked: true })).toBe(false);
  });

  it('wants a version 4 UUID for premium accounts', () => {
    const notch = '069a79f4-44e9-4726-a5be-fca90e38aaf5';
    expect(uuidMatchesAccount({ uuid: notch, username: 'Notch', cracked: false })).toBe(true);
    expect(
      uuidMatchesAccount({ uuid: offlineUuid('Notch'), username: 'Notch', cracked: false }),
    ).toBe(false);
  });
});
