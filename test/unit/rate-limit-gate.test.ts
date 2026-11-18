import { afterEach, describe, expect, it } from 'vitest';

import { isRateLimitOff, setRateLimitModeReader } from '../../server/lib/rate-limit-gate.ts';

describe('isRateLimitOff', () => {
  afterEach(() => {
    setRateLimitModeReader(() => Promise.resolve('normal'));
  });

  it('is false until a reader is plugged in, and follows the mode after', async () => {
    setRateLimitModeReader(() => Promise.resolve('off'));
    expect(await isRateLimitOff()).toBe(true);
    setRateLimitModeReader(() => Promise.resolve('event'));
    expect(await isRateLimitOff()).toBe(false);
    setRateLimitModeReader(() => Promise.resolve('normal'));
    expect(await isRateLimitOff()).toBe(false);
  });
});
