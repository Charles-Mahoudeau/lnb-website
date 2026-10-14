import { describe, expect, it } from 'vitest';

import { isAllowedTenant, parseAllowedTenants, schoolForTenant } from '../../server/lib/tenants.ts';

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';
const EARTSUP = '791f2edf-38ab-4c6c-b323-ea94dd988fde';
const ISEG = '8dab9574-4b8e-4eec-8e5e-791d6835fdea';
// Microsoft's tenant for personal accounts.
const CONSUMERS = '9188040d-6c67-4c5b-b112-36a304b66dad';

describe('tenant allowlist', () => {
  const allowed = parseAllowedTenants(`${EPITECH},${EARTSUP},${ISEG}`);

  it('accepts an allowed tenant', () => {
    expect(isAllowedTenant(EPITECH, allowed)).toBe(true);
    expect(isAllowedTenant(ISEG.toUpperCase(), allowed)).toBe(true);
  });

  it('refuses any other tenant', () => {
    expect(isAllowedTenant(CONSUMERS, allowed)).toBe(false);
  });

  it('refuses a missing or empty tid', () => {
    expect(isAllowedTenant(undefined, allowed)).toBe(false);
    expect(isAllowedTenant(null, allowed)).toBe(false);
    expect(isAllowedTenant('', allowed)).toBe(false);
    expect(isAllowedTenant(42, allowed)).toBe(false);
  });
});

describe('parseAllowedTenants', () => {
  it('tolerates spaces, case and trailing commas', () => {
    expect(parseAllowedTenants(` ${EPITECH.toUpperCase()} , ${ISEG},`)).toEqual(
      new Set([EPITECH, ISEG]),
    );
  });

  it('rejects anything that is not a tenant ID', () => {
    expect(() => parseAllowedTenants(`${EPITECH},epitech.eu`)).toThrow(/epitech\.eu/);
  });

  it('rejects an empty list', () => {
    expect(() => parseAllowedTenants(' , ')).toThrow(/at least one/);
  });
});

describe('schoolForTenant', () => {
  it('names each school', () => {
    expect(schoolForTenant(EPITECH)).toBe('Epitech');
    expect(schoolForTenant(EARTSUP)).toBe('e-artsup');
    expect(schoolForTenant(ISEG)).toBe('ISEG');
    expect(schoolForTenant(CONSUMERS)).toBeUndefined();
  });
});
