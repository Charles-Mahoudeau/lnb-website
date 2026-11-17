import { describe, expect, it } from 'vitest';

import { neoforgeVersion } from '../../server/services/modpack/loader-version.ts';

describe('neoforgeVersion', () => {
  const versions = ['21.1.266', '21.1.267', '21.2.0-beta', '21.11.5', '26.3.0.109'];

  it('maps 1.21.1 to the 21.1 line', () => {
    expect(neoforgeVersion(versions, '1.21.1')).toBe('21.1.267');
  });
  it('does not mix up 21.1 with 21.11', () => {
    expect(neoforgeVersion(versions, '1.21.11')).toBe('21.11.5');
  });
  it('keeps a beta only when nothing stable exists', () => {
    expect(neoforgeVersion(versions, '1.21.2')).toBe('21.2.0-beta');
  });
  it('handles the new numbering and unknown versions', () => {
    expect(neoforgeVersion(versions, '26.3')).toBe('26.3.0.109');
    expect(neoforgeVersion(versions, '1.19.4')).toBe('');
  });
});
