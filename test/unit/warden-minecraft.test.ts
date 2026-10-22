import { describe, expect, it } from 'vitest';

import { offlineUuid, uuidMatchesUsername } from '../../server/lib/minecraft.ts';

describe('offlineUuid', () => {
  it('matches what offline-mode servers give', () => {
    expect(offlineUuid('Notch')).toBe('b50ad385-829d-3141-a216-7e7d7539ba7f');
  });

  it('is case-sensitive, so Steve and steve are two accounts', () => {
    expect(offlineUuid('Steve')).not.toBe(offlineUuid('steve'));
  });
});

describe('uuidMatchesUsername', () => {
  it('wants the offline UUID of the exact username', () => {
    const uuid = offlineUuid('Steve');
    expect(uuidMatchesUsername({ uuid, username: 'Steve' })).toBe(true);
    expect(uuidMatchesUsername({ uuid, username: 'steve' })).toBe(false);
    expect(uuidMatchesUsername({ uuid, username: 'Alex' })).toBe(false);
  });

  it('refuses a premium (version 4) UUID', () => {
    const notch = '069a79f4-44e9-4726-a5be-fca90e38aaf5';
    expect(uuidMatchesUsername({ uuid: notch, username: 'Notch' })).toBe(false);
  });
});
