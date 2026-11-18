import { describe, expect, it } from 'vitest';

import {
  DOWNLOAD_OSES,
  PACKAGE_COMMANDS,
  PACKAGE_DISTROS,
  VENDOR_LINKS,
  downloadSlotBody,
} from '../../shared/schemas/downloads.ts';
import { detectOs } from '../../shared/utils/os.ts';

describe('detecting the visitor’s system', () => {
  it.each([
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130', 'windows'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605', 'macos'],
    ['Mozilla/5.0 (X11; Linux x86_64) Firefox/132', 'linux'],
    ['Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) Chrome/130', 'linux'],
  ])('%s is %s', (agent, os) => {
    expect(detectOs(agent)).toBe(os);
  });

  it('counts phones, tablets and unknown agents as Windows', () => {
    expect(detectOs('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe('windows');
    expect(detectOs('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe('windows');
    expect(detectOs(undefined)).toBe('windows');
  });
});

describe('the vendor links', () => {
  it('are https and cover every system', () => {
    for (const vendor of Object.values(VENDOR_LINKS)) {
      for (const os of DOWNLOAD_OSES) {
        expect(vendor[os].startsWith(`https://${vendor.host}/`)).toBe(true);
      }
    }
  });
});

describe('the package manager commands', () => {
  it('cover every distribution for Java and Prism', () => {
    for (const tool of Object.values(PACKAGE_COMMANDS)) {
      expect(tool.macos).toMatch(/^brew install/);
      for (const distro of PACKAGE_DISTROS) {
        expect(tool.linux[distro].command.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('a download slot body', () => {
  const fileId = '2d1f2b0e-6a43-4d3a-9c4e-0f6d3f1c9a11';

  it('trims the version and turns an empty one into null', () => {
    expect(downloadSlotBody.parse({ fileId, version: ' 1.4.0 ' }).version).toBe('1.4.0');
    expect(downloadSlotBody.parse({ fileId, version: '' }).version).toBeNull();
    expect(downloadSlotBody.parse({ fileId }).version).toBeNull();
  });

  it('needs a file id', () => {
    expect(downloadSlotBody.safeParse({ fileId: 'nope' }).success).toBe(false);
  });
});
