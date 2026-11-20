import { describe, expect, it } from 'vitest';

import {
  centsToInput,
  formatCents,
  formatSignedCents,
  lnbitsToCents,
  parseLnbitsInput,
} from '../../shared/utils/lnbits.ts';

describe('formatCents', () => {
  it('shows cents as LNBits with two decimals, dropping a trailing .00', () => {
    expect(formatCents(0, 'en')).toBe('0');
    expect(formatCents(1, 'en')).toBe('0.01');
    expect(formatCents(5, 'en')).toBe('0.05');
    expect(formatCents(10, 'en')).toBe('0.1');
    expect(formatCents(100, 'en')).toBe('1');
    expect(formatCents(120_000, 'en')).toBe('1,200');
    expect(formatCents(123_456, 'en')).toBe('1,234.56');
    expect(formatCents(100_000_012, 'en')).toBe('1,000,000.12');
  });

  it('uses the separators of the locale', () => {
    // French groups with a narrow no-break space and writes decimals with a comma.
    expect(formatCents(123_456, 'fr')).toMatch(/^1\s234,56$/);
    expect(formatCents(100_000_012, 'fr')).toMatch(/^1\s000\s000,12$/);
    expect(formatCents(5, 'fr')).toBe('0,05');
  });

  it('is exact for the largest amounts, with no floating point drift', () => {
    // 10^12 LNBits, the limit, is 10^14 cents.
    expect(formatCents(100_000_000_000_000, 'en')).toBe('1,000,000,000,000');
    expect(formatCents(100_000_000_000_001, 'en')).toBe('1,000,000,000,000.01');
    expect(formatCents(9_007_199_254_740_991, 'en')).toBe('90,071,992,547,409.91');
  });

  it('writes a movement with a real sign', () => {
    expect(formatSignedCents(150, 'en')).toBe('+1.5');
    expect(formatSignedCents(-25, 'en')).toBe('−0.25');
  });
});

describe('parseLnbitsInput', () => {
  it('reads whole amounts and up to two decimals, with . or ,', () => {
    expect(parseLnbitsInput('0.1')).toEqual({ ok: true, cents: 10 });
    expect(parseLnbitsInput('0.10')).toEqual({ ok: true, cents: 10 });
    expect(parseLnbitsInput('0,1')).toEqual({ ok: true, cents: 10 });
    expect(parseLnbitsInput('12')).toEqual({ ok: true, cents: 1200 });
    expect(parseLnbitsInput('12.34')).toEqual({ ok: true, cents: 1234 });
    expect(parseLnbitsInput(' 12,34 ')).toEqual({ ok: true, cents: 1234 });
    expect(parseLnbitsInput('0.07')).toEqual({ ok: true, cents: 7 });
    // 19.99 * 100 is 1998.9999999999998 in floating point: the parser doesn't multiply decimals.
    expect(parseLnbitsInput('19.99')).toEqual({ ok: true, cents: 1999 });
    expect(parseLnbitsInput('1 234,5')).toEqual({ ok: true, cents: 123_450 });
  });

  it('refuses more than two decimals', () => {
    expect(parseLnbitsInput('12.345')).toEqual({ ok: false, error: 'decimals' });
    expect(parseLnbitsInput('0,001')).toEqual({ ok: false, error: 'decimals' });
  });

  it('refuses a sign, text and an empty value', () => {
    expect(parseLnbitsInput('-1')).toEqual({ ok: false, error: 'format' });
    expect(parseLnbitsInput('+1')).toEqual({ ok: false, error: 'format' });
    expect(parseLnbitsInput('1e3')).toEqual({ ok: false, error: 'format' });
    expect(parseLnbitsInput('abc')).toEqual({ ok: false, error: 'format' });
    expect(parseLnbitsInput('')).toEqual({ ok: false, error: 'format' });
    expect(parseLnbitsInput('1.2.3')).toEqual({ ok: false, error: 'format' });
  });

  it('refuses zero, unless it is allowed', () => {
    expect(parseLnbitsInput('0')).toEqual({ ok: false, error: 'min' });
    expect(parseLnbitsInput('0.00')).toEqual({ ok: false, error: 'min' });
    expect(parseLnbitsInput('0', { allowZero: true })).toEqual({ ok: true, cents: 0 });
  });

  it('refuses more than the limit', () => {
    expect(parseLnbitsInput('1000000000000')).toEqual({ ok: true, cents: 100_000_000_000_000 });
    expect(parseLnbitsInput('1000000000001')).toEqual({ ok: false, error: 'max' });
    expect(parseLnbitsInput('1000000000000.01')).toEqual({ ok: false, error: 'max' });
    expect(parseLnbitsInput('1000.01', { maxLnbits: 1000 })).toEqual({ ok: false, error: 'max' });
  });

  it('round-trips through the text of an input', () => {
    for (const cents of [1, 10, 100, 1234, 100_000_012]) {
      const text = centsToInput(cents);
      expect(parseLnbitsInput(text)).toEqual({ ok: true, cents });
    }
    expect(centsToInput(1250)).toBe('12.5');
    expect(lnbitsToCents(3)).toBe(300);
  });
});
