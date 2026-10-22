import { RateLimiterMemory } from 'rate-limiter-flexible';
import type { RateLimiterRes } from 'rate-limiter-flexible';

// Counters live in the process's memory: the site runs as one container, so there is nothing
// to share, and a deploy only resets them. Swap in `RateLimiterPostgres` here if that changes.

export type RateLimitVerdict = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/** `points` calls per `windowSeconds`, counted per key. */
export function createLimiter(points: number, windowSeconds: number) {
  const limiter = new RateLimiterMemory({ points, duration: windowSeconds });
  return async function consume(key: string): Promise<RateLimitVerdict> {
    try {
      await limiter.consume(key);
      return { allowed: true };
    } catch (error) {
      const { msBeforeNext } = error as RateLimiterRes;
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(msBeforeNext / 1000)) };
    }
  };
}
