import { describe, expect, it } from 'vitest';

import { decodePhotoDataUrl, saveProfilePhoto, setAvatarStore } from '../../server/lib/avatars.ts';

const photo = Buffer.from('jpeg bytes');
// Better Auth's Microsoft provider puts a space after the comma.
const dataUrl = `data:image/jpeg;base64, ${photo.toString('base64')}`;

describe('decodePhotoDataUrl', () => {
  it('reads the data URL Better Auth builds', () => {
    expect(decodePhotoDataUrl(dataUrl)).toEqual(photo);
  });

  it('refuses anything else', () => {
    expect(decodePhotoDataUrl(undefined)).toBeUndefined();
    expect(decodePhotoDataUrl('https://example.com/a.jpg')).toBeUndefined();
    expect(decodePhotoDataUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBeUndefined();
    expect(decodePhotoDataUrl('data:image/jpeg;base64,')).toBeUndefined();
  });

  it('refuses photos over 256 KB', () => {
    const big = Buffer.alloc(256 * 1024 + 1).toString('base64');
    expect(decodePhotoDataUrl(`data:image/jpeg;base64,${big}`)).toBeUndefined();
  });
});

describe('saveProfilePhoto', () => {
  it('stores the bytes and returns the URL', async () => {
    setAvatarStore((bytes) => Promise.resolve(`/api/avatars/${bytes.toString()}`));
    await expect(saveProfilePhoto(dataUrl)).resolves.toBe('/api/avatars/jpeg bytes');
  });

  it('returns undefined without a photo', async () => {
    await expect(saveProfilePhoto(undefined)).resolves.toBeUndefined();
  });

  it('returns undefined when storing fails, so the sign-in still goes through', async () => {
    setAvatarStore(() => Promise.reject(new Error('disk full')));
    await expect(saveProfilePhoto(dataUrl)).resolves.toBeUndefined();
  });
});
