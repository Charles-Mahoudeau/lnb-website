import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';

import PartnersKind from '~/components/partners/Kind.vue';

import type { PartnerPublicKind } from '#shared/schemas/partners';

const group: PartnerPublicKind = {
  kind: 'game',
  partners: [
    {
      id: '1',
      name: 'Pixelforge Studio',
      description: { en: 'Gave 20 game keys.', fr: '' },
      url: 'https://www.pixelforge.example/about',
      logo: '/api/partners/logos/a.svg',
    },
    {
      id: '2',
      name: 'Lumen Café',
      description: { en: 'A free coffee.', fr: '' },
      url: null,
      logo: '/api/partners/logos/b.webp',
    },
  ],
};

describe('partners kind', () => {
  it('shows the kind, its intro and every partner with its description', async () => {
    const text = (await mountSuspended(PartnersKind, { props: { group } })).text();
    expect(text).toContain('Game partners');
    expect(text).toContain('game keys for prizes');
    expect(text).toContain('Pixelforge Studio');
    expect(text).toContain('Gave 20 game keys.');
    expect(text).toContain('Lumen Café');
    expect(text).toContain('A free coffee.');
  });

  it('shows the link as its host, and makes the logo the link only when there is one', async () => {
    const view = await mountSuspended(PartnersKind, { props: { group } });
    expect(view.text()).toContain('pixelforge.example');
    expect(view.text()).not.toContain('www.');
    const plates = view.findAll('li a[aria-label]');
    expect(plates).toHaveLength(1);
    expect(plates[0]!.attributes('aria-label')).toBe('Pixelforge Studio');
    expect(plates[0]!.attributes('rel')).toContain('noopener');
    // Without a link the logo keeps its alt text, so it reads as the partner's name.
    expect(view.findAll('img')[1]!.attributes('alt')).toBe('Lumen Café logo');
  });
});
