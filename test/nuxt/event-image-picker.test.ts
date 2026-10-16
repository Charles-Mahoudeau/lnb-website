import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';

import { UApp } from '#components';
import EventsAdminImagePicker from '~/components/events/admin/ImagePicker.vue';

let steamgriddb = true;
registerEndpoint('/api/admin/events/images/providers', () => ({ steamgriddb }));

/**
 * The picker inside UApp, as app.vue renders it: modals need its portal. `open` is what
 * useOverlay() passes; it falls through to the UModal.
 */
function mountPicker(props: Record<string, unknown>, onClose?: (image: unknown) => void) {
  return mountSuspended(
    defineComponent({
      render: () =>
        h(UApp, null, () =>
          h(EventsAdminImagePicker, { title: 'Choose the banner', open: true, ...props, onClose }),
        ),
    }),
  );
}

const pageText = () => document.body.textContent;
const tabs = () =>
  [...document.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent.trim());

describe('event image picker', () => {
  it('offers SteamGridDB first when it is set up', async () => {
    steamgriddb = true;
    const picker = await mountPicker({});
    expect(tabs()).toEqual(['SteamGridDB', 'Upload', 'From a link']);
    expect(document.querySelector('input[placeholder^="Search a game"]')).not.toBeNull();
    picker.unmount();
  });

  it('offers uploads and links only without it', async () => {
    steamgriddb = false;
    const picker = await mountPicker({});
    expect(tabs()).toEqual(['Upload', 'From a link']);
    expect(pageText()).not.toContain('SteamGridDB');
    expect(pageText()).toContain('Drop an image here');
    picker.unmount();
  });

  it('opens on the focal point for an image already picked, and gives it back', async () => {
    const image = {
      key: `${'a'.repeat(64)}.webp`,
      url: '/api/media/x.webp',
      focusX: 0.3,
      focusY: 0.6,
    };
    let closed: unknown;
    const picker = await mountPicker({ image }, (value) => (closed = value));
    expect(pageText()).toContain('Set the focal point');
    for (const crop of ['Event page and home', 'Agenda', 'Discord, X and the BDE']) {
      expect(pageText()).toContain(crop);
    }
    const use = [...document.querySelectorAll('button')].find((b) =>
      b.textContent.includes('Use this image'),
    );
    use?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(closed).toEqual(image);
    picker.unmount();
  });
});
