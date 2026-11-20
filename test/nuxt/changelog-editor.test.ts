import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime';
import type { VueWrapper } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';

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
