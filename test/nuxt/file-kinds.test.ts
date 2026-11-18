import { describe, expect, it } from 'vitest';

import { defaultFileKind } from '~/utils/files';

describe('the default kind of an uploaded file', () => {
  it('sends installers to the download kind', () => {
    expect(defaultFileKind('PrismLauncher-Setup.EXE')).toBe('download');
    expect(defaultFileKind('PrismLauncher.AppImage')).toBe('download');
    expect(defaultFileKind('prism.dmg')).toBe('download');
    expect(defaultFileKind('prism-linux.tar.gz')).toBe('download');
  });

  it('keeps jars as mods and the rest as assets', () => {
    expect(defaultFileKind('sodium.jar')).toBe('mod');
    expect(defaultFileKind('pack.zip')).toBe('asset');
    expect(defaultFileKind('notes.txt')).toBe('asset');
  });
});
