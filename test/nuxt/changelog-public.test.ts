import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime';
import { beforeEach, describe, expect, it } from 'vitest';

import Featured from '~/components/changelog/Featured.vue';
import Row from '~/components/changelog/Row.vue';
import PostPage from '~/pages/minecraft/changelog/[slug].vue';
import ListPage from '~/pages/minecraft/changelog/index.vue';

import type { ChangelogPublicPost } from '#shared/schemas/changelog';

const post = (over: Partial<ChangelogPublicPost> = {}): ChangelogPublicPost => ({
  slug: 'the-nether',
  title: 'The Nether wakes',
  summary: 'A new dimension to explore.',
  versionTag: 'Season 4.2',
  publishedAt: '2026-11-18T10:00:00.000Z',
  lang: 'en',
  languages: ['en', 'fr'],
  coverUrl: null,
  ...over,
});

// useFetch keeps its data by key between mounts.
beforeEach(() => {
  clearNuxtData();
});

describe('changelog list', () => {
  it('shows the newest post as a band and the others as rows', async () => {
    registerEndpoint('/api/changelog/posts', () => ({
      posts: [post(), post({ slug: 'older', title: 'Older post', versionTag: null })],
      next: 'cursor',
    }));
    const view = await mountSuspended(ListPage, { route: '/minecraft/changelog' });
    expect(view.find('article h2').text()).toBe('The Nether wakes');
    expect(view.text()).toContain('A new dimension to explore.');
    expect(view.text()).toContain('Read the changelog');
    expect(view.find('ul h3').text()).toBe('Older post');
    expect(view.text()).toContain('Load more');
  });

  it('shows an empty state without posts', async () => {
    registerEndpoint('/api/changelog/posts', () => ({ posts: [], next: null }));
    const view = await mountSuspended(ListPage, { route: '/minecraft/changelog' });
    expect(view.text()).toContain('No post yet');
    expect(view.find('article').exists()).toBe(false);
  });
});

describe('changelog rows', () => {
  it('shows the cover on the band only when there is one', async () => {
    const without = await mountSuspended(Featured, { props: { post: post() } });
    expect(without.find('img').exists()).toBe(false);
    const withCover = await mountSuspended(Featured, {
      props: { post: post({ coverUrl: '/api/media/abc' }) },
    });
    expect(withCover.find('img').attributes('src')).toBe('/api/media/abc');
  });

  it('links a row to its post and shows the version', async () => {
    const row = await mountSuspended(Row, { props: { post: post() } });
    expect(row.find('a').attributes('href')).toBe('/minecraft/changelog/the-nether');
    expect(row.text()).toContain('Season 4.2');
  });
});

describe('changelog post page', () => {
  const detail = (over = {}) => ({
    ...post(),
    html: '<p>Body text</p>',
    older: { slug: 'older', title: 'Older post' },
    newer: null,
    ...over,
  });

  it('shows the text, the older link and the language switch', async () => {
    registerEndpoint('/api/changelog/posts/the-nether', () => detail());
    registerEndpoint('/api/changelog/posts', () => ({ posts: [post()], next: null }));
    const view = await mountSuspended(PostPage, { route: '/minecraft/changelog/the-nether' });
    expect(view.find('h1').text()).toBe('The Nether wakes');
    expect(view.text()).toContain('Body text');
    expect(view.find('a[href="/minecraft/changelog/older"]').text()).toContain('Older');
    expect(view.find('a[href="/minecraft/changelog/older"]').text()).toContain('Older post');
    expect(view.text()).not.toContain('Newer');
    expect(view.text()).not.toContain('Not translated');
    expect(view.find('[role="tablist"]').exists()).toBe(true);
  });

  it('says so when the post has one language', async () => {
    registerEndpoint('/api/changelog/posts/solo', () =>
      detail({ slug: 'solo', languages: ['en'] }),
    );
    registerEndpoint('/api/changelog/posts', () => ({ posts: [], next: null }));
    const view = await mountSuspended(PostPage, { route: '/minecraft/changelog/solo' });
    expect(view.text()).toContain('Not translated');
    expect(view.find('[role="tablist"]').exists()).toBe(false);
  });
});
