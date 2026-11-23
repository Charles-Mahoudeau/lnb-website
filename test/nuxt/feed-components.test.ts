import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime';
import type { VueWrapper } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';
import type { Ref } from 'vue';

import { UApp } from '#components';
import AnnouncerBadge from '~/components/feed/AnnouncerBadge.vue';
import AnonymousAvatar from '~/components/feed/AnonymousAvatar.vue';
import Aside from '~/components/feed/Aside.vue';
import Composer from '~/components/feed/Composer.vue';
import Empty from '~/components/feed/Empty.vue';
import Post from '~/components/feed/Post.vue';
import ReplyComposer from '~/components/feed/ReplyComposer.vue';
import StateBand from '~/components/feed/StateBand.vue';

import {
  ALEX,
  ALEX_ALT,
  MAIN_ID,
  announcer,
  clearPortals,
  clearToasts,
  deferred,
  inApp,
  inDocument,
  me,
  noLink,
  post,
  settle,
  toastTitles,
  twoAccounts,
  words,
} from './feed-fixtures';

import type { FeedMe, FeedName, FeedPostView } from '#shared/schemas/feed';

// The Feed's components in each state docs/feed.md ("The Feed page") lists: every form of post,
// the composer for a player and an announcer, the account choice, the counter and its aria-live
// rule, the bands, the empty states, and a draft's idempotency key.

registerEndpoint('/api/auth/get-session', () => ({
  user: { id: 'u1', name: 'Alexandre Martin', tenantId: '901cb4ca-b862-4029-9306-e5cd0f6d9f86' },
  session: {},
}));

// Mounting the app around a component is slow on a busy machine.
vi.setConfig({ testTimeout: 30_000 });

beforeEach(() => {
  clearNuxtData();
  vi.restoreAllMocks();
  clearToasts();
  clearPortals();
});

const NOW = Date.now();
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

describe('a post', () => {
  it('shows the head, the name, the handle, the age and the text of a plain post', async () => {
    const view = await mountSuspended(Post, {
      props: { post: post({ createdAt: minutesAgo(12), text: 'Bonjour' }) },
    });
    expect(view.find('article').attributes('aria-label')).toBe('Post by Alexandre M.');
    expect(view.find('img').attributes('src')).toBe(`/api/warden/heads/${ALEX}`);
    expect(view.text()).toMatch(/Alexandre M\.\s*@Alex_Craft/);
    expect(view.find('time').text()).toMatch(/^12\smin$/);
    expect(view.find('time').attributes('datetime')).toBe(minutesAgo(12));
    expect(view.text()).toContain('Bonjour');
    expect(view.text()).not.toContain('Announcer');
    expect(view.text()).not.toContain('Pinned');
  });

  it('says "now" under a minute, and gives the full date on hover', async () => {
    const view = await mountSuspended(Post, {
      props: { post: post({ createdAt: minutesAgo(0) }) },
    });
    expect(view.find('time').text()).toBe('now');
    expect(view.find('time').attributes('title')).toMatch(/2\d{3}/);
  });

  it('shows the announcer badge only for an author who announces and does not hide behind anonymity', async () => {
    const badged = await mountSuspended(Post, {
      props: { post: post({ author: { ...post().author!, announcer: true } }) },
    });
    expect(badged.text()).toContain('Announcer');

    const hidden = await mountSuspended(Post, {
      props: {
        post: post({
          anonymous: true,
          mine: true,
          author: { ...post().author!, announcer: true },
        }),
      },
    });
    expect(hidden.text()).not.toContain('Announcer');
    expect(hidden.text()).toContain('Anonymous');
    expect(hidden.text()).not.toContain('@Alex_Craft');
    expect(hidden.find('img').exists()).toBe(false);
  });

  it('keeps the label of the badge for screen readers when the screen is narrow', async () => {
    const view = await mountSuspended(AnnouncerBadge);
    expect(view.text()).toBe('Announcer');
    expect(view.html()).toContain('max-sm:sr-only');
  });

  it('prints the username alone, with no handle, when the real name is hidden', async () => {
    const view = await mountSuspended(Post, {
      props: { post: post({ author: { ...post().author!, realName: null } }) },
    });
    expect(words(view.text())).toContain('Alex_Craft');
    expect(view.text()).not.toContain('@');
  });

  it('shows an anonymous post to a stranger with the mask, no head, no handle and no private line', async () => {
    const view = await mountSuspended(Post, {
      props: { post: post({ anonymous: true, author: null }) },
    });
    expect(view.find('article').attributes('aria-label')).toBe('Post by Anonymous');
    expect(view.find('img').exists()).toBe(false);
    expect(view.find('[role="img"]').attributes('aria-label')).toBe('Anonymous');
    expect(view.find('svg, [class*="venetian"]').exists() || view.html().includes('venetian')).toBe(
      true,
    );
    expect(view.text()).not.toContain('Alex');
    expect(view.text()).not.toContain('Posted anonymously');
    expect(view.text()).not.toContain('Author:');
  });

  it('tells the author of an anonymous post, and gives a moderator the real author', async () => {
    const own = await mountSuspended(Post, {
      props: { post: post({ anonymous: true, mine: true }) },
    });
    expect(own.text()).toContain('Posted anonymously by you');
    expect(own.text()).not.toContain('Alexandre');

    const moderator = await mountSuspended(Post, { props: { post: post({ anonymous: true }) } });
    expect(moderator.text()).toMatch(/Author: Alexandre M\.\s*@Alex_Craft/);
    expect(moderator.find('img').exists()).toBe(false);

    const hiddenName = await mountSuspended(Post, {
      props: {
        post: post({ anonymous: true, author: { ...post().author!, realName: null } }),
      },
    });
    expect(words(hiddenName.text())).toContain('Author: Alex_Craft');
    expect(hiddenName.text()).not.toContain('@');
  });

  it('shows the reply-to line, with "Anonymous" when the reply answered an anonymous one', async () => {
    const named = await mountSuspended(Post, {
      props: {
        post: post({
          threadId: MAIN_ID,
          replyTo: { id: 'r', anonymous: false, name: 'Mika L.' },
        }),
        mode: 'reply',
      },
    });
    expect(named.text()).toContain('Replying to Mika L.');
    const anonymous = await mountSuspended(Post, {
      props: {
        post: post({ threadId: MAIN_ID, replyTo: { id: null, anonymous: true, name: null } }),
        mode: 'reply',
      },
    });
    expect(anonymous.text()).toContain('Replying to Anonymous');
    const none = await mountSuspended(Post, { props: { post: post({ replyTo: null }) } });
    expect(none.text()).not.toContain('Replying to');
  });

  it('shows the pinned line on a post of a feed and of its thread, not on a reply', async () => {
    const pinnedAt = minutesAgo(5);
    for (const mode of ['list', 'main'] as const) {
      const view = await mountSuspended(Post, { props: { post: post({ pinnedAt }), mode } });
      expect(view.text(), mode).toContain('Pinned');
    }
    const reply = await mountSuspended(Post, {
      props: { post: post({ pinnedAt, threadId: MAIN_ID }), mode: 'reply' },
    });
    expect(reply.text()).not.toContain('Pinned');
  });

  it('keeps line breaks and shows markup as plain text', async () => {
    const view = await mountSuspended(Post, {
      props: { post: post({ text: 'Ligne 1\nLigne 2 <b>gras</b> <script>alert(1)</script>' }) },
    });
    const text = view.find('p.whitespace-pre-wrap');
    expect(text.text()).toBe('Ligne 1\nLigne 2 <b>gras</b> <script>alert(1)</script>');
    expect(view.find('b').exists()).toBe(false);
    expect(view.find('script').exists()).toBe(false);
  });

  it('links the replies of a post of a feed to its thread, and a reply to the thread it belongs to', async () => {
    const main = await mountSuspended(Post, { props: { post: post({ replies: 3 }) } });
    expect(main.find(`a[href="/minecraft/feed/${MAIN_ID}"]`).exists()).toBe(true);
    const other = '1b1c7e3a-7f2b-4a51-9a63-2f5d8c1b4e71';
    const reply = await mountSuspended(Post, {
      props: { post: post({ id: other, threadId: MAIN_ID }), mode: 'list' },
    });
    expect(reply.find(`a[href="/minecraft/feed/${MAIN_ID}"]`).exists()).toBe(true);
  });

  it('links the replies for a reader who cannot write, too', async () => {
    const view = await mountSuspended(Post, { props: { post: post(), canAct: false } });
    expect(view.find(`a[href="/minecraft/feed/${MAIN_ID}"]`).exists()).toBe(true);
    expect(view.find('button[aria-label^="Like"]').exists()).toBe(false);
  });

  it('counts the replies in the singular, the plural and none, for a screen reader', async () => {
    const label = async (replies: number) =>
      (await mountSuspended(Post, { props: { post: post({ replies }) } }))
        .find(`a[href="/minecraft/feed/${MAIN_ID}"]`)
        .attributes('aria-label');
    expect(await label(0)).toBe('No replies');
    expect(await label(1)).toBe('1 reply');
    expect(await label(7)).toBe('7 replies');
  });

  it('shows the count only when it is not zero, and the same for likes', async () => {
    const none = await mountSuspended(Post, {
      props: { post: post({ replies: 0, likes: 0 }), canAct: true },
    });
    expect(none.find('button[aria-label^="Like"]').text()).toBe('');
    expect(none.find('a').text()).toBe('');
    const some = await mountSuspended(Post, {
      props: { post: post({ replies: 4, likes: 15 }), canAct: true },
    });
    expect(some.find('button[aria-label^="Like"]').text()).toBe('15');
    expect(some.find('a').text()).toBe('4');
  });

  it('shows the unseen-replies pill on a post of a feed, in the singular and the plural', async () => {
    const one = await mountSuspended(Post, {
      props: { post: post({ mine: true, unseenReplies: 1 }) },
    });
    expect(one.text()).toContain('1 new');
    const two = await mountSuspended(Post, {
      props: { post: post({ mine: true, unseenReplies: 2 }) },
    });
    expect(two.text()).toContain('2 new');
    const zero = await mountSuspended(Post, { props: { post: post({ mine: true }) } });
    expect(zero.text()).not.toContain('new');
    const inThread = await mountSuspended(Post, {
      props: { post: post({ mine: true, unseenReplies: 2 }), mode: 'main' },
    });
    expect(inThread.text()).not.toContain('2 new');
  });

  it('shows the full date under the text of the main post of a thread, and no age', async () => {
    const view = await mountSuspended(Post, { props: { post: post(), mode: 'main' } });
    expect(view.findAll('time')).toHaveLength(1);
    expect(view.find('time').text()).toMatch(/\d{4}/);
  });

  describe('its actions', () => {
    it('likes with a toggle that says whether it is pressed, and is disabled while busy', async () => {
      const onLike = vi.fn();
      const view = await mountSuspended(
        inApp(Post, { post: post({ liked: false }), canAct: true, onLike }),
      );
      const button = view.find('button[aria-label^="Like"]');
      expect(button.attributes('aria-pressed')).toBe('false');
      expect(button.attributes('aria-label')).toBe('Like, 12 likes');
      await button.trigger('click');
      expect(onLike).toHaveBeenCalledTimes(1);

      const liked = await mountSuspended(
        inApp(Post, { post: post({ liked: true }), canAct: true, busy: true, onLike }),
      );
      const pressed = liked.find('button[aria-label^="Like"]');
      expect(pressed.attributes('aria-pressed')).toBe('true');
      expect(pressed.attributes('disabled')).toBeDefined();
      await pressed.trigger('click');
      expect(onLike).toHaveBeenCalledTimes(1);
    });

    it('highlights a liked post in neutral colours, never red', async () => {
      const liked = await mountSuspended(
        inApp(Post, { post: post({ liked: true }), canAct: true }),
      );
      const plain = await mountSuspended(
        inApp(Post, { post: post({ liked: false }), canAct: true }),
      );
      expect(liked.find('button[aria-label^="Like"]').classes()).toContain('text-highlighted');
      expect(plain.find('button[aria-label^="Like"]').classes()).toContain('text-muted');
      expect(liked.find('button[aria-label^="Like"]').classes().join(' ')).not.toMatch(
        /error|primary|red|coral/,
      );
    });

    it('offers the pin toggle to announcers on a post of a feed and of a thread, not on a reply', async () => {
      const onPin = vi.fn();
      const listed = await mountSuspended(
        inApp(Post, { post: post({ canPin: true }), canAct: true, onPin }),
      );
      const toggle = listed.find('button[aria-label="Pin"]');
      expect(toggle.attributes('aria-pressed')).toBe('false');
      await toggle.trigger('click');
      expect(onPin).toHaveBeenCalledTimes(1);

      const pinned = await mountSuspended(
        inApp(Post, { post: post({ canPin: true, pinnedAt: minutesAgo(1) }), canAct: true }),
      );
      expect(pinned.find('button[aria-label="Unpin"]').attributes('aria-pressed')).toBe('true');

      const main = await mountSuspended(
        inApp(Post, { post: post({ canPin: true }), canAct: true, mode: 'main' }),
      );
      expect(main.find('button[aria-label="Pin"]').exists()).toBe(true);

      const reply = await mountSuspended(
        inApp(Post, {
          post: post({ canPin: true, threadId: MAIN_ID }),
          canAct: true,
          mode: 'reply',
        }),
      );
      expect(reply.find('button[aria-label="Pin"]').exists()).toBe(false);

      const player = await mountSuspended(
        inApp(Post, { post: post({ canPin: false }), canAct: true }),
      );
      expect(player.find('button[aria-label="Pin"]').exists()).toBe(false);
    });

    it('disables the pin while the post is busy', async () => {
      const view = await mountSuspended(
        inApp(Post, { post: post({ canPin: true }), canAct: true, busy: true }),
      );
      expect(view.find('button[aria-label="Pin"]').attributes('disabled')).toBeDefined();
    });

    it('offers Delete in the menu from canDelete only, and emits it', async () => {
      const onDelete = vi.fn();
      const mine = await mountSuspended(
        inApp(Post, { post: post({ mine: true, canDelete: true }), canAct: true, onDelete }),
      );
      await mine.find('button[aria-label="More actions"]').trigger('click');
      await settle();
      inDocument('[role="menuitem"]', 'Delete')!.click();
      await settle();
      expect(onDelete).toHaveBeenCalledTimes(1);
      expect(onDelete.mock.calls[0]![0]).toMatchObject({ id: MAIN_ID });

      const others = await mountSuspended(
        inApp(Post, { post: post({ canDelete: false }), canAct: true }),
      );
      expect(others.find('button[aria-label="More actions"]').exists()).toBe(false);
    });

    it('offers Delete even to someone who can no longer write, since deleting one’s own never stops', async () => {
      const view = await mountSuspended(
        inApp(Post, { post: post({ mine: true, canDelete: true }), canAct: false }),
      );
      expect(view.find('button[aria-label="More actions"]').exists()).toBe(true);
    });

    it('replies from a thread, and keeps the reply count static for a reader who cannot write', async () => {
      const onReply = vi.fn();
      const reply = post({ threadId: MAIN_ID, replies: 2 });
      const live = await mountSuspended(
        inApp(Post, { post: reply, canAct: true, mode: 'reply', onReply }),
      );
      await live.find('button[aria-label="Reply"]').trigger('click');
      expect(onReply).toHaveBeenCalledTimes(1);
      const quiet = await mountSuspended(
        inApp(Post, { post: reply, canAct: false, mode: 'reply' }),
      );
      expect(quiet.find('button[aria-label="Reply"]').exists()).toBe(false);
      expect(quiet.text()).toContain('2');
    });
  });
});

describe('the anonymous avatar', () => {
  it('is a labelled mask in two sizes', async () => {
    const medium = await mountSuspended(AnonymousAvatar);
    const small = await mountSuspended(AnonymousAvatar, { props: { size: 'sm' } });
    expect(medium.attributes('aria-label')).toBe('Anonymous');
    expect(medium.classes()).toContain('size-10');
    expect(small.classes()).toContain('size-7');
  });
});

describe('the bands that take the composer’s place', () => {
  async function band(person: FeedMe) {
    return mountSuspended(inApp(StateBand, { me: person }));
  }

  it('asks a person with no linked account to link one, with the way to the page', async () => {
    const view = await band(noLink());
    expect(view.text()).toContain('Link your Minecraft account to take part');
    expect(view.find('a[href="/minecraft/account"]').text()).toBe('Link my account');
  });

  it('tells a banned person until when, in the language of the page, and how to read the ban', async () => {
    const view = await band(
      me({
        banned: true,
        banExpiresAt: '2026-12-04T10:00:00.000Z',
        rights: { write: false, announce: false, moderate: false },
      }),
    );
    expect(view.text()).toContain('You are banned from the server until December 4, 2026');
    expect(view.text()).toContain('You can read the Feed, but not post, reply or like');
    expect(view.find('a[href="/minecraft/account"]').text()).toBe('See my ban');
  });

  it('says "banned" with no date for a ban with no end', async () => {
    const view = await band(
      me({
        banned: true,
        banExpiresAt: null,
        rights: { write: false, announce: false, moderate: false },
      }),
    );
    expect(view.text()).toContain('You are banned from the server');
    expect(view.text()).not.toContain('until');
  });

  it('says posting is paused, quietly, with no button', async () => {
    const view = await band(me({ writing: false }));
    expect(view.text()).toContain('Posting is paused for now.');
    expect(view.find('a').exists()).toBe(false);
    expect(view.find('button').exists()).toBe(false);
  });

  it('shows nothing for someone who can write', async () => {
    const view = await band(me());
    expect(view.find('section, p, [role="alert"]').exists()).toBe(false);
  });

  it('asks to link before anything else, and a ban before the pause', async () => {
    const unlinkedAndBanned = await band(noLink({ banned: true }));
    expect(unlinkedAndBanned.text()).toContain('Link your Minecraft account');
    expect(unlinkedAndBanned.text()).not.toContain('banned from the server');
    const bannedAndPaused = await band(
      me({
        banned: true,
        writing: false,
        rights: { write: false, announce: false, moderate: false },
      }),
    );
    expect(bannedAndPaused.text()).toContain('banned from the server');
    expect(bannedAndPaused.text()).not.toContain('paused');
  });

  it('dates the ban in French when the page is in French', async () => {
    const i18n = useNuxtApp().$i18n;
    await i18n.setLocale('fr');
    try {
      const view = await band(
        me({
          banned: true,
          banExpiresAt: '2026-12-04T10:00:00.000Z',
          rights: { write: false, announce: false, moderate: false },
        }),
      );
      expect(view.text()).toMatch(/jusqu.au 4 décembre 2026/);
      expect(view.text()).toContain('Voir mon bannissement');
    } finally {
      await i18n.setLocale('en');
    }
  });
});

describe('the empty states', () => {
  it('says what will show up in Announcements, with no button for a reader who cannot post', async () => {
    const view = await mountSuspended(Empty, { props: { feed: 'announcements', canPost: false } });
    expect(view.attributes('role')).toBe('status');
    expect(view.text()).toContain('No announcements');
    expect(view.text()).toContain('Server announcements will show up here.');
    expect(view.find('button').exists()).toBe(false);
  });

  it('offers "Write a post" in Global to those who can, and emits it', async () => {
    const view = await mountSuspended(Empty, { props: { feed: 'global', canPost: true } });
    expect(view.text()).toContain('No posts yet');
    await view.find('button').trigger('click');
    expect(view.emitted('write')).toHaveLength(1);
    const reader = await mountSuspended(Empty, { props: { feed: 'global', canPost: false } });
    expect(reader.find('button').exists()).toBe(false);
  });

  it('offers it to an announcer in an empty Announcements', async () => {
    const view = await mountSuspended(Empty, { props: { feed: 'announcements', canPost: true } });
    expect(view.text()).toContain('Write a post');
  });
});

describe('the aside', () => {
  it('says what to know: plain text of 280 characters, what anonymous hides, the rules', async () => {
    const view = await mountSuspended(Aside);
    const items = view.findAll('li').map((item) => item.text());
    expect(items).toEqual([
      '280 characters, plain text only.',
      'An anonymous post hides your name from players. Moderators see it.',
      'The Feed follows the server rules.',
    ]);
  });
});

describe('the composer', () => {
  /** The composer inside UApp, with its feed settable from the test. */
  async function mountComposer(
    person: FeedMe = me(),
    feed: FeedName = 'global',
    listeners: Record<string, unknown> = {},
  ) {
    const current = ref<FeedName>(feed);
    const host = defineComponent({
      setup(_, { expose }) {
        expose({ current });
        return () =>
          h(UApp, null, () => h(Composer, { me: person, feed: current.value, ...listeners }));
      },
    });
    const view = await mountSuspended(host);
    return { view, current: current };
  }

  async function open(view: VueWrapper) {
    await view.find('input').trigger('focus');
    await settle(2);
  }

  async function type(view: VueWrapper, text: string) {
    await view.find('textarea').setValue(text);
  }

  async function submit(view: VueWrapper) {
    await view.find('form').trigger('submit');
    await settle();
  }

  const posted = (over: Partial<FeedPostView> = {}) =>
    Promise.resolve({ replayed: false, post: post({ mine: true, ...over }) });

  describe('collapsed and open', () => {
    it('shows the head of the posting account and the prompt, with no text area', async () => {
      const { view } = await mountComposer();
      expect(view.find('img').attributes('src')).toBe(`/api/warden/heads/${ALEX}`);
      expect(view.find('input').attributes('placeholder')).toBe('What’s new on the server?');
      expect(view.find('textarea').exists()).toBe(false);
    });

    it('opens on focus and on click, with the text area focused and the counter at zero', async () => {
      const { view } = await mountComposer();
      await open(view);
      expect(view.find('textarea').exists()).toBe(true);
      expect(view.text()).toContain('0/280');
      expect(view.find('input').exists()).toBe(false);
    });

    it('shows the author row with the name and the handle, or the username alone', async () => {
      const shown = await mountComposer();
      await open(shown.view);
      expect(shown.view.text()).toMatch(/Alexandre M\.\s*@Alex_Craft/);
      const hidden = await mountComposer(
        me({ me: { uuid: ALEX, username: 'Alex_Craft', realName: null, announcer: false } }),
      );
      await open(hidden.view);
      expect(words(hidden.view.text())).toContain('Alex_Craft');
      expect(hidden.view.text()).not.toContain('@Alex_Craft');
    });

    it('swaps the author row for the anonymous one while the switch is on', async () => {
      const { view } = await mountComposer();
      await open(view);
      expect(view.find('img[src*="heads"]').exists()).toBe(true);
      await view.find('button[role="switch"]').trigger('click');
      await settle(2);
      expect(view.find('[aria-label="Anonymous"][role="img"]').exists()).toBe(true);
      expect(view.find('img[src*="heads"]').exists()).toBe(false);
      expect(view.text()).toMatch(/Anonymous\s*Hidden from players/);
      expect(view.text()).not.toContain('@Alex_Craft');
      await view.find('button[role="switch"]').trigger('click');
      await settle(2);
      expect(view.find('img[src*="heads"]').exists()).toBe(true);
    });

    it('offers the anonymous switch to every writer, with its explanation', async () => {
      for (const person of [me(), announcer()]) {
        const { view } = await mountComposer(person);
        await open(view);
        expect(view.text()).toContain('Post anonymously');
        expect(view.text()).toContain('Hidden from players, visible to moderators');
      }
    });
  });

  describe('the account choice', () => {
    it('is not offered with one account', async () => {
      const { view } = await mountComposer(me());
      await open(view);
      expect(view.text()).not.toContain('Change account');
    });

    it('is offered with several accounts, listing each with what it will show, the current one checked', async () => {
      const { view } = await mountComposer(twoAccounts());
      await open(view);
      const button = view.findAll('button').find((b) => b.text() === 'Change account')!;
      await button.trigger('click');
      await settle();
      const items = [...document.querySelectorAll<HTMLElement>('[role^="menuitem"]')];
      expect(items.map((item) => words(item.textContent))).toEqual([
        expect.stringContaining('Alex_Craft'),
        expect.stringContaining('Alex_Alt'),
      ]);
      expect(words(items[1]!.textContent)).toContain('Your posts will show Alexandre M. @Alex_Alt');
      expect(items[0]!.getAttribute('aria-checked')).toBe('true');
      expect(items[1]!.getAttribute('aria-checked')).toBe('false');
      expect(document.body.textContent).toContain('Post with');
    });

    it('picks another account: sends it, tells the page, and says what the posts show now', async () => {
      const updated = twoAccounts({
        postingAccount: ALEX_ALT,
        me: { uuid: ALEX_ALT, username: 'Alex_Alt', realName: 'Alexandre M.', announcer: false },
      });
      const set = vi.spyOn(feedActions, 'setPostingAccount').mockResolvedValue(updated);
      const onAccount = vi.fn();
      const { view } = await mountComposer(twoAccounts(), 'global', { onAccount });
      await open(view);
      await view
        .findAll('button')
        .find((b) => b.text() === 'Change account')!
        .trigger('click');
      await settle();
      inDocument('[role^="menuitem"]', 'Alex_Alt')!.click();
      await settle(15);
      expect(set).toHaveBeenCalledWith(ALEX_ALT);
      expect(onAccount).toHaveBeenCalledWith(updated);
      expect(toastTitles()).toEqual(['Your posts now show Alexandre M. @Alex_Alt']);
    });

    it('does nothing for the account already in use', async () => {
      const set = vi.spyOn(feedActions, 'setPostingAccount');
      const { view } = await mountComposer(twoAccounts());
      await open(view);
      await view
        .findAll('button')
        .find((b) => b.text() === 'Change account')!
        .trigger('click');
      await settle();
      inDocument('[role^="menuitem"]', 'Alex_Craft')!.click();
      await settle();
      expect(set).not.toHaveBeenCalled();
    });

    it('says why when the site refuses the account, and does not tell the page', async () => {
      vi.spyOn(feedActions, 'setPostingAccount').mockRejectedValue(new FeedError('notLinked'));
      const onAccount = vi.fn();
      const { view } = await mountComposer(twoAccounts(), 'global', { onAccount });
      await open(view);
      await view
        .findAll('button')
        .find((b) => b.text() === 'Change account')!
        .trigger('click');
      await settle();
      inDocument('[role^="menuitem"]', 'Alex_Alt')!.click();
      await settle();
      expect(onAccount).not.toHaveBeenCalled();
      expect(toastTitles()).toEqual([
        'Link a Minecraft account first, on your Minecraft account page.',
      ]);
    });
  });

  describe('the counter', () => {
    async function counter(text: string) {
      const { view } = await mountComposer();
      await open(view);
      await type(view, text);
      const element = view.find('[aria-live]');
      return {
        text: element.text(),
        live: element.attributes('aria-live'),
        over: element.classes().includes('text-error'),
        disabled: view.find('button[type="submit"]').attributes('disabled') !== undefined,
      };
    }

    it('reads 0/280 and keeps Post off for an empty text', async () => {
      expect(await counter('')).toEqual({
        text: '0/280',
        live: 'off',
        over: false,
        disabled: true,
      });
    });

    it('keeps Post off for a text of spaces and line breaks, which counts as 0', async () => {
      expect(await counter('  \n \t ')).toEqual({
        text: '0/280',
        live: 'off',
        over: false,
        disabled: true,
      });
    });

    it('reads 280/280 at the limit, quietly red-free, with Post on and the counter announced', async () => {
      expect(await counter('a'.repeat(280))).toEqual({
        text: '280/280',
        live: 'polite',
        over: false,
        disabled: false,
      });
    });

    it('reads 281/280 past the limit, in the error colour, announced, with Post off', async () => {
      expect(await counter('a'.repeat(281))).toEqual({
        text: '281/280',
        live: 'polite',
        over: true,
        disabled: true,
      });
    });

    it('announces from 20 characters before the limit, not before', async () => {
      expect((await counter('a'.repeat(259))).live).toBe('off');
      expect((await counter('a'.repeat(260))).live).toBe('polite');
    });

    it('counts as the site does: trimmed, CRLF as one, controls and § dropped, emoji as one', async () => {
      expect((await counter('  salut  ')).text).toBe('5/280');
      expect((await counter('a\r\nb')).text).toBe('3/280');
      expect((await counter('a§b\u0000c')).text).toBe('3/280');
      expect((await counter('😀😀')).text).toBe('2/280');
      expect((await counter('x\n\n\n\n\ny')).text).toBe('4/280');
    });

    it('also counts a post that would be too long once cleaned as ok when cleaning shortens it', async () => {
      const result = await counter(`${'a'.repeat(280)}${' '.repeat(50)}`);
      expect(result).toMatchObject({ text: '280/280', over: false, disabled: false });
    });
  });

  describe('where to post', () => {
    it('gives a player no choice of feed', async () => {
      const { view } = await mountComposer(me());
      await open(view);
      expect(view.find('[role="tablist"]').exists()).toBe(false);
    });

    it('gives an announcer the choice, starting from the tab shown', async () => {
      for (const feed of ['announcements', 'global'] as const) {
        const { view } = await mountComposer(announcer(), feed);
        await open(view);
        const tabs = view.findAll('[role="tab"]');
        expect(tabs.map((tab) => tab.text())).toEqual(['Announcements', 'Global']);
        const active = tabs.find((tab) => tab.attributes('aria-selected') === 'true');
        expect(active?.text()).toBe(feed === 'global' ? 'Global' : 'Announcements');
      }
    });

    it('follows the tab shown while the text is empty, and stays put once there is a draft', async () => {
      const { view, current } = await mountComposer(announcer(), 'global');
      await open(view);
      const shown = () =>
        view
          .findAll('[role="tab"]')
          .find((tab) => tab.attributes('aria-selected') === 'true')!
          .text();
      current.value = 'announcements';
      await settle(2);
      expect(shown()).toBe('Announcements');
      await type(view, 'Un brouillon');
      current.value = 'global';
      await settle(2);
      expect(shown()).toBe('Announcements');
    });

    it('sends the destination chosen, and Global for a player whatever the tab', async () => {
      const send = vi.spyOn(feedActions, 'post').mockImplementation(() => posted());
      const asAnnouncer = await mountComposer(announcer(), 'announcements');
      await open(asAnnouncer.view);
      await type(asAnnouncer.view, 'Annonce');
      await submit(asAnnouncer.view);
      const global = await mountComposer(announcer(), 'announcements');
      await open(global.view);
      await global.view
        .findAll('[role="tab"]')
        .find((tab) => tab.text() === 'Global')!
        .trigger('mousedown', { button: 0 });
      await settle(2);
      await type(global.view, 'Plutôt ici');
      await submit(global.view);
      const player = await mountComposer(me(), 'announcements');
      await open(player.view);
      await type(player.view, 'Joueur');
      await submit(player.view);
      expect(send.mock.calls.map(([body]) => [body.feed, body.text])).toEqual([
        ['announcements', 'Annonce'],
        ['global', 'Plutôt ici'],
        ['global', 'Joueur'],
      ]);
    });
  });

  describe('sending', () => {
    it('does not send an empty or too long text', async () => {
      const send = vi.spyOn(feedActions, 'post').mockImplementation(() => posted());
      const { view } = await mountComposer();
      await open(view);
      await submit(view);
      await type(view, '   ');
      await submit(view);
      await type(view, 'a'.repeat(281));
      await submit(view);
      expect(send).not.toHaveBeenCalled();
      expect(view.text()).toMatch(/A post is 280 characters at most/);
    });

    it('sends the text as typed and the anonymous flag, with a UUID key', async () => {
      const send = vi.spyOn(feedActions, 'post').mockImplementation(() => posted());
      const { view } = await mountComposer();
      await open(view);
      await type(view, '  Salut \n');
      await view.find('button[role="switch"]').trigger('click');
      await submit(view);
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0]![0]).toMatchObject({
        feed: 'global',
        text: '  Salut \n',
        anonymous: true,
      });
      expect(send.mock.calls[0]![0].idempotencyKey).toMatch(/^[\da-f-]{36}$/);
    });

    it('on success tells the page, clears and closes the composer, and says "Posted"', async () => {
      vi.spyOn(feedActions, 'post').mockImplementation(() => posted({ id: 'new' }));
      const onPosted = vi.fn();
      const { view } = await mountComposer(me(), 'global', { onPosted });
      await open(view);
      await type(view, 'Salut');
      await view.find('button[role="switch"]').trigger('click');
      await submit(view);
      expect(onPosted).toHaveBeenCalledWith(expect.objectContaining({ id: 'new' }));
      expect(view.find('textarea').exists()).toBe(false);
      expect(toastTitles()).toEqual(['Posted']);
      await open(view);
      expect((view.find('textarea').element as HTMLTextAreaElement).value).toBe('');
      expect(view.find('button[role="switch"]').attributes('aria-checked')).toBe('false');
    });

    it('sends once for a double click while the first is running', async () => {
      const slow = deferred<{ replayed: boolean; post: FeedPostView }>();
      const send = vi.spyOn(feedActions, 'post').mockImplementation(() => slow.promise);
      const { view } = await mountComposer();
      await open(view);
      await type(view, 'Salut');
      await view.find('form').trigger('submit');
      await view.find('form').trigger('submit');
      await settle(2);
      expect(send).toHaveBeenCalledTimes(1);
      slow.resolve({ replayed: false, post: post() });
      await settle();
    });

    it('treats a replayed answer as a post that went through', async () => {
      vi.spyOn(feedActions, 'post').mockResolvedValue({
        replayed: true,
        post: post({ mine: true }),
      });
      const onPosted = vi.fn();
      const { view } = await mountComposer(me(), 'global', { onPosted });
      await open(view);
      await type(view, 'Salut');
      await submit(view);
      expect(onPosted).toHaveBeenCalledTimes(1);
      expect(toastTitles()).toEqual(['Posted']);
    });

    describe('the idempotency key', () => {
      function keysOf(send: { mock: { calls: unknown[][] } }) {
        return send.mock.calls.map(([body]) => (body as { idempotencyKey: string }).idempotencyKey);
      }

      async function failing(error: Error = new FeedError('failed')) {
        const send = vi.spyOn(feedActions, 'post').mockImplementation(() => Promise.reject(error));
        send.mockClear();
        const host = await mountComposer(announcer(), 'global');
        await open(host.view);
        return { send, ...host };
      }

      it('is reused when the text is sent again after a failure, the draft staying', async () => {
        const { send, view } = await failing();
        await type(view, 'Salut');
        await submit(view);
        await submit(view);
        await submit(view);
        const keys = keysOf(send);
        expect(keys).toHaveLength(3);
        expect(new Set(keys).size).toBe(1);
        expect((view.find('textarea').element as HTMLTextAreaElement).value).toBe('Salut');
      });

      it('is reused after every failure that is not a refusal of the draft: a timeout, a 500, a pause', async () => {
        for (const error of [
          new FeedError('failed'),
          new FeedError('disabled', { flag: 'feed.writing' }),
          new FeedError('rateLimited', { retryAfter: 5 }),
        ]) {
          const { send, view } = await failing(error);
          await type(view, 'Salut');
          await submit(view);
          await submit(view);
          expect(new Set(keysOf(send)).size, error.problem).toBe(1);
        }
      });

      it('is renewed after any edit of the text, even a space, and after toggling anonymity', async () => {
        const { send, view } = await failing();
        await type(view, 'Salut');
        await submit(view);
        await type(view, 'Salut ');
        await submit(view);
        await type(view, 'Salut !');
        await submit(view);
        await view.find('button[role="switch"]').trigger('click');
        await submit(view);
        const keys = keysOf(send);
        expect(keys).toHaveLength(4);
        expect(new Set(keys).size).toBe(4);
      });

      it('is renewed after a change of destination', async () => {
        const { send, view } = await failing();
        await type(view, 'Salut');
        await submit(view);
        await view
          .findAll('[role="tab"]')
          .find((tab) => tab.text() === 'Announcements')!
          .trigger('mousedown', { button: 0 });
        await settle(2);
        await submit(view);
        const keys = keysOf(send);
        expect(keys).toHaveLength(2);
        expect(keys[0]).not.toBe(keys[1]);
        expect((send.mock.calls[1]![0] as { feed: string }).feed).toBe('announcements');
      });

      it('is reused when the same text is sent again after toggling anonymity back', async () => {
        const { send, view } = await failing();
        await type(view, 'Salut');
        await submit(view);
        await view.find('button[role="switch"]').trigger('click');
        await view.find('button[role="switch"]').trigger('click');
        await submit(view);
        expect(new Set(keysOf(send)).size).toBe(1);
      });

      it('is new after a post that went through', async () => {
        const send = vi
          .spyOn(feedActions, 'post')
          .mockImplementationOnce(() => posted())
          .mockImplementation(() => Promise.reject(new FeedError('failed')));
        const { view } = await mountComposer();
        await open(view);
        await type(view, 'Salut');
        await submit(view);
        await open(view);
        await type(view, 'Salut');
        await submit(view);
        const keys = keysOf(send);
        expect(keys).toHaveLength(2);
        expect(keys[0]).not.toBe(keys[1]);
      });

      it('is cleared with the draft when the answer is notFound, and the next send takes a new one', async () => {
        const send = vi
          .spyOn(feedActions, 'post')
          .mockImplementationOnce(() => Promise.reject(new FeedError('notFound')))
          .mockImplementation(() => posted());
        const { view } = await mountComposer();
        await open(view);
        await type(view, 'Déjà parti');
        await submit(view);
        expect(view.find('textarea').exists()).toBe(false);
        expect(toastTitles()).toEqual([expect.stringContaining('went through earlier')]);
        await open(view);
        await type(view, 'Déjà parti');
        await submit(view);
        const keys = keysOf(send);
        expect(keys[0]).not.toBe(keys[1]);
      });

      it('is kept across a change of posting account, so the retry replays the earlier post (docs/feed.md)', async () => {
        const send = vi
          .spyOn(feedActions, 'post')
          .mockImplementationOnce(() => Promise.reject(new FeedError('failed')))
          .mockImplementation(() => posted());
        const updated = twoAccounts({
          postingAccount: ALEX_ALT,
          me: { uuid: ALEX_ALT, username: 'Alex_Alt', realName: 'Alexandre M.', announcer: false },
        });
        vi.spyOn(feedActions, 'setPostingAccount').mockResolvedValue(updated);
        const { view } = await mountComposer(twoAccounts());
        await open(view);
        await type(view, 'Salut');
        await submit(view);
        await view
          .findAll('button')
          .find((b) => b.text() === 'Change account')!
          .trigger('click');
        await settle();
        inDocument('[role^="menuitem"]', 'Alex_Alt')!.click();
        await settle();
        await submit(view);
        const keys = keysOf(send);
        expect(keys).toHaveLength(2);
        expect(keys[1]).toBe(keys[0]);
      });
    });

    describe('a refusal', () => {
      it.each([
        ['banned', new FeedError('banned'), 'You can’t post, reply or like while you are banned.'],
        [
          'not linked',
          new FeedError('notLinked'),
          'Link a Minecraft account first, on your Minecraft account page.',
        ],
        ['not allowed', new FeedError('notAllowed'), 'Only announcers can do that.'],
        [
          'a pause',
          new FeedError('disabled', { flag: 'feed.writing' }),
          'Posting is paused for now. Try again later.',
        ],
        [
          'the Feed off',
          new FeedError('disabled', { flag: 'feed' }),
          'The Feed is unavailable for now. Try again later.',
        ],
        [
          'a rate limit',
          new FeedError('rateLimited', { retryAfter: 12 }),
          'You’re going a bit fast. Try again in 12 s.',
        ],
        [
          'too long',
          new FeedError('tooLong'),
          'A post is 280 characters at most. Shorten it a little.',
        ],
        [
          'a failure',
          new FeedError('failed'),
          'That didn’t go through. Check your connection and send it again: it won’t be posted twice.',
        ],
      ])('says %s in a toast, and keeps the draft', async (_name, error, message) => {
        vi.spyOn(feedActions, 'post').mockRejectedValue(error);
        const { view } = await mountComposer();
        await open(view);
        await type(view, 'Salut');
        await submit(view);
        expect(toastTitles()).toEqual([message]);
        expect((view.find('textarea').element as HTMLTextAreaElement).value).toBe('Salut');
      });
    });
  });
});

describe('the reply composer', () => {
  const THREAD = MAIN_ID;
  const REPLY = '1b1c7e3a-7f2b-4a51-9a63-2f5d8c1b4e71';

  async function mountReply(
    props: { target?: { id: string; name: string } | null; mainName?: string } = {},
    listeners: Record<string, unknown> = {},
  ) {
    const target: Ref<{ id: string; name: string } | null> = ref(props.target ?? null);
    const host = defineComponent({
      setup(_, { expose }) {
        expose({ target });
        return () =>
          h(UApp, null, () =>
            h(ReplyComposer, {
              threadId: THREAD,
              mainName: props.mainName ?? 'Alexandre M.',
              target: target.value,
              ...listeners,
            }),
          );
      },
    });
    return { view: await mountSuspended(host), target };
  }

  const type = (view: VueWrapper, text: string) => view.find('textarea').setValue(text);
  async function submit(view: VueWrapper) {
    await view.find('form').trigger('submit');
    await settle();
  }
  const replied = () => Promise.resolve({ replayed: false, post: post({ threadId: THREAD }) });

  it('says whom it answers: the main post, then a reply, with a cross to go back', async () => {
    const { view, target } = await mountReply();
    expect(view.text()).toContain('Replying to Alexandre M.');
    expect(view.find('button[aria-label="Reply to the main post instead"]').exists()).toBe(false);
    target.value = { id: REPLY, name: 'Mika L.' };
    await settle(2);
    expect(view.text()).toContain('Replying to Mika L.');
    expect(view.find('button[aria-label="Reply to the main post instead"]').exists()).toBe(true);
  });

  it('answers "Anonymous" for an anonymous main post', async () => {
    const { view } = await mountReply({ mainName: 'Anonymous' });
    expect(view.text()).toContain('Replying to Anonymous');
  });

  it('emits clear from the cross', async () => {
    const onClear = vi.fn();
    const { view } = await mountReply({ target: { id: REPLY, name: 'Mika L.' } }, { onClear });
    await view.find('button[aria-label="Reply to the main post instead"]').trigger('click');
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('has its own labels: the text area, "Reply anonymously", and Reply', async () => {
    const { view } = await mountReply();
    expect(view.find('textarea').attributes('placeholder')).toBe('Write a reply');
    expect(view.text()).toContain('Reply anonymously');
    expect(view.find('button[type="submit"]').text()).toBe('Reply');
  });

  it('counts as the composer does, with the same aria-live rule', async () => {
    const { view } = await mountReply();
    const read = () => ({
      text: view.find('[aria-live]').text(),
      live: view.find('[aria-live]').attributes('aria-live'),
      over: view.find('[aria-live]').classes().includes('text-error'),
      disabled: view.find('button[type="submit"]').attributes('disabled') !== undefined,
    });
    expect(read()).toEqual({ text: '0/280', live: 'off', over: false, disabled: true });
    await type(view, 'a'.repeat(259));
    expect(read().live).toBe('off');
    await type(view, 'a'.repeat(260));
    expect(read().live).toBe('polite');
    await type(view, 'a'.repeat(280));
    expect(read()).toEqual({ text: '280/280', live: 'polite', over: false, disabled: false });
    await type(view, 'a'.repeat(281));
    expect(read()).toEqual({ text: '281/280', live: 'polite', over: true, disabled: true });
  });

  it('sends to the thread, answering the main post or the reply chosen', async () => {
    const send = vi.spyOn(feedActions, 'reply').mockImplementation(() => replied());
    const { view, target } = await mountReply();
    await type(view, 'Un');
    await submit(view);
    target.value = { id: REPLY, name: 'Mika L.' };
    await settle(2);
    await type(view, 'Deux');
    await view.find('button[role="switch"]').trigger('click');
    await submit(view);
    expect(
      send.mock.calls.map(([thread, body]) => [thread, body.replyTo, body.text, body.anonymous]),
    ).toEqual([
      [THREAD, null, 'Un', false],
      [THREAD, REPLY, 'Deux', true],
    ]);
  });

  it('on success tells the page, and clears the text and the anonymous switch', async () => {
    vi.spyOn(feedActions, 'reply').mockImplementation(() => replied());
    const onPosted = vi.fn();
    const { view } = await mountReply({}, { onPosted });
    await type(view, 'Un');
    await view.find('button[role="switch"]').trigger('click');
    await submit(view);
    expect(onPosted).toHaveBeenCalledTimes(1);
    expect((view.find('textarea').element as HTMLTextAreaElement).value).toBe('');
    expect(view.find('button[role="switch"]').attributes('aria-checked')).toBe('false');
    expect(toastTitles()).toEqual(['Reply posted']);
  });

  it('sends once for a double click, and not at all for an empty text', async () => {
    const slow = deferred<{ replayed: boolean; post: FeedPostView }>();
    const send = vi.spyOn(feedActions, 'reply').mockImplementation(() => slow.promise);
    const { view } = await mountReply();
    await submit(view);
    expect(send).not.toHaveBeenCalled();
    await type(view, 'Un');
    await view.find('form').trigger('submit');
    await view.find('form').trigger('submit');
    await settle(2);
    expect(send).toHaveBeenCalledTimes(1);
    slow.resolve({ replayed: false, post: post() });
    await settle();
  });

  describe('the idempotency key', () => {
    const keys = (send: { mock: { calls: unknown[][] } }) =>
      send.mock.calls.map(([, body]) => (body as { idempotencyKey: string }).idempotencyKey);

    it('is reused when the same reply is sent again after a failure, and renewed by any edit or another target', async () => {
      const send = vi.spyOn(feedActions, 'reply').mockRejectedValue(new FeedError('failed'));
      const { view, target } = await mountReply();
      await type(view, 'Un');
      await submit(view);
      await submit(view);
      await type(view, 'Un ');
      await submit(view);
      await view.find('button[role="switch"]').trigger('click');
      await submit(view);
      target.value = { id: REPLY, name: 'Mika L.' };
      await settle(2);
      await submit(view);
      const sent = keys(send);
      expect(sent).toHaveLength(5);
      expect(sent[1]).toBe(sent[0]);
      expect(new Set(sent).size).toBe(4);
      expect((view.find('textarea').element as HTMLTextAreaElement).value).toBe('Un ');
    });

    it('says a failed send can be sent again, and keeps the draft', async () => {
      vi.spyOn(feedActions, 'reply').mockRejectedValue(new FeedError('failed'));
      const { view } = await mountReply();
      await type(view, 'Un');
      await submit(view);
      expect(toastTitles()).toEqual([expect.stringContaining('won’t be posted twice')]);
      expect((view.find('textarea').element as HTMLTextAreaElement).value).toBe('Un');
    });

    it('keeps the text but not the key when the thread, the reply answered or the post is gone: gone is emitted', async () => {
      const send = vi
        .spyOn(feedActions, 'reply')
        .mockImplementationOnce(() => Promise.reject(new FeedError('notFound')))
        .mockImplementation(() => replied());
      const onGone = vi.fn();
      const { view } = await mountReply({}, { onGone });
      await type(view, 'Un');
      await submit(view);
      expect(onGone).toHaveBeenCalledTimes(1);
      // The text stays: only the reply answered may be gone, and the page decides by reading the
      // thread again (a thread that is gone takes the composer away).
      expect((view.find('textarea').element as HTMLTextAreaElement).value).toBe('Un');
      expect(toastTitles()).toEqual(['This post was deleted.']);
      clearToasts();
      await submit(view);
      const sent = keys(send);
      expect(sent[0]).not.toBe(sent[1]);
    });
  });

  it('can be focused from outside', async () => {
    const focus = vi.spyOn(HTMLTextAreaElement.prototype, 'focus');
    const { view } = await mountReply();
    const host = view.findComponent(ReplyComposer as unknown as object) as unknown as {
      vm: { focus: () => void };
    };
    host.vm.focus();
    expect(focus).toHaveBeenCalled();
  });
});
