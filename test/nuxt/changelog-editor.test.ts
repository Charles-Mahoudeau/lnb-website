import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime';
import type { VueWrapper } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Editor from '~/components/admin/changelog/Editor.vue';

import type { ChangelogDetail } from '#shared/schemas/changelog';

let available = true;
registerEndpoint('/api/admin/changelog/translation', () => ({ available }));
registerEndpoint('/api/admin/changelog/preview', () => ({ html: '<p>Rendered</p>' }));

const post: ChangelogDetail = {
  id: '5c2a7a3e-0000-4000-8000-00000000c10a',
  slug: 'season',
  status: 'draft',
  publishedAt: null,
  versionTag: 'Season 4.2',
  sourceLang: 'en',
  translationUnreviewed: false,
  texts: {
    en: { title: 'Season 4.2', summary: 'A summary', body: '## News' },
    fr: { title: '', summary: '', body: '' },
  },
  updatedAt: '2026-11-20T10:00:00.000Z',
};

const translateButton = (view: VueWrapper) =>
  view.findAll('button').find((button) => button.text().startsWith('Translate to'));

describe('changelog editor', () => {
  beforeEach(() => {
    clearNuxtData('changelog-translation');
    available = true;
  });

  it('translates to the other language of the post', async () => {
    const view = await mountSuspended(Editor, { props: { post } });
    const button = translateButton(view);
    expect(button?.text()).toBe('Translate to French');
    expect(button?.attributes('disabled')).toBeUndefined();
  });

  it('turns the button off, with a note, when DeepL is not set up', async () => {
    available = false;
    const view = await mountSuspended(Editor, { props: { post } });
    expect(translateButton(view)?.attributes('disabled')).toBeDefined();
    expect(view.text()).toContain('Translation isn’t set up on this site');
  });

  it('turns the button off while the source has no body', async () => {
    const empty = { ...post, texts: { ...post.texts, en: { ...post.texts.en, body: '' } } };
    const view = await mountSuspended(Editor, { props: { post: empty } });
    expect(translateButton(view)?.attributes('disabled')).toBeDefined();
  });

  it('has no Translate button for a new post, and Save is its one action', async () => {
    const view = await mountSuspended(Editor);
    expect(translateButton(view)).toBeUndefined();
    const buttons = view.findAll('button').map((button) => button.text());
    expect(buttons).toContain('Save');
    expect(buttons).not.toContain('Publish');
  });

  it('marks a machine translation as not reviewed', async () => {
    const view = await mountSuspended(Editor, {
      props: {
        post: {
          ...post,
          translationUnreviewed: true,
          texts: { ...post.texts, fr: { title: 'Saison 4.2', summary: '', body: '## Nouveautés' } },
        },
      },
    });
    expect(view.text()).toContain('Not reviewed');
  });

  it('offers Publish on a draft and Unpublish on a published post', async () => {
    const draft = (await mountSuspended(Editor, { props: { post } })).findAll('button');
    expect(draft.map((button) => button.text())).toEqual(
      expect.arrayContaining(['Save', 'Publish']),
    );
    const live = await mountSuspended(Editor, {
      props: { post: { ...post, status: 'published', publishedAt: '2026-11-20T10:00:00.000Z' } },
    });
    const labels = live.findAll('button').map((button) => button.text());
    expect(labels).toEqual(expect.arrayContaining(['Unpublish', 'Save']));
    expect(labels).not.toContain('Publish');
  });
});

describe('changelog editor images', () => {
  it('inserts the image as Markdown at the cursor and selects the alt text', async () => {
    registerEndpoint('/api/admin/changelog/images', {
      method: 'POST',
      handler: () => ({
        key: 'changelog-a.webp',
        url: '/api/media/changelog-a.webp',
        width: 4,
        height: 4,
      }),
    });
    const view = await mountSuspended(Editor, { props: { post }, attachTo: document.body });
    const area = view.find('textarea').element;
    area.setSelectionRange(3, 3);
    const input = view.find('input[type="file"]');
    const file = new File(['x'], 'new-map.png', { type: 'image/png' });
    Object.defineProperty(input.element, 'files', { value: [file] });
    await input.trigger('change');
    await vi.waitFor(() => {
      expect(area.value).toContain('![new map](/api/media/changelog-a.webp)');
    });
    expect(area.value).toBe('## ![new map](/api/media/changelog-a.webp)News');
    expect(area.value.slice(area.selectionStart, area.selectionEnd)).toBe('new map');
    view.unmount();
  });

  it('refuses a file that is not an image, without calling the server', async () => {
    const view = await mountSuspended(Editor, { props: { post } });
    const input = view.find('input[type="file"]');
    Object.defineProperty(input.element, 'files', {
      value: [new File(['x'], 'notes.txt', { type: 'text/plain' })],
    });
    await input.trigger('change');
    expect(view.find('textarea').element.value).toBe('## News');
  });
});
