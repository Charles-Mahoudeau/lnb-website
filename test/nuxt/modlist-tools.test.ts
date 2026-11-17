import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';
import type { Component } from 'vue';

import { AdminModlistTools, UApp } from '#components';

import type { ModpackToolView } from '#shared/schemas/modpack';

const launcher: ModpackToolView = {
  tool: 'launcher',
  version: '1.4.0',
  notes: 'Checks the updater first.',
  fileId: '3f2a8c9e-1b7d-4c55-9a21-0d8e6f4b7a10',
  fileName: 'lnb-modsync-launcher.jar',
  size: 93_000,
  sha256: '7f3a1e0b'.repeat(8),
  sha512: 'a'.repeat(128),
  url: '/api/files/x/lnb-modsync-launcher.jar',
  publishedAt: '2026-11-14T10:00:00.000Z',
  publishedBy: 'Charles',
};

async function mountTools(tools: ModpackToolView[]) {
  // `unknown`: ESLint's type service doesn't resolve .vue components, so they'd read as errors.
  const component = AdminModlistTools as unknown as Component;
  return mountSuspended(
    defineComponent({ render: () => h(UApp, null, () => h(component, { tools })) }),
  );
}

describe('AdminModlistTools', () => {
  it('shows the published launcher and the updater waiting for its first version', async () => {
    const wrapper = await mountTools([launcher]);
    const text = wrapper.text();
    expect(text).toContain('lnb-modsync-launcher');
    expect(text).toContain('1.4.0');
    expect(text).toContain('Charles');
    expect(text).toContain('Checks the updater first.');
    expect(text).toContain('lnb-modsync-updater');
    expect(text).toContain('Nothing published yet');
    expect(wrapper.findAll('button').map((button) => button.text())).toEqual([
      'Publish a new version',
      'Publish a version',
    ]);
  });
});
