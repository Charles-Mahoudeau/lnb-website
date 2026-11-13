import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';

import UserAvatar from '../../app/components/UserAvatar.vue';
import { avatarTint } from '../../app/utils/avatar.ts';

describe('UserAvatar', () => {
  it('shows the wolf, tinted from the account ID, when there is no photo', async () => {
    const wrapper = await mountSuspended(UserAvatar, {
      props: { userId: 'user-1', name: 'Alex Laurent' },
    });
    const tint = avatarTint('user-1');
    expect(wrapper.find('svg').exists()).toBe(true);
    expect(wrapper.find('svg').classes()).toContain(tint.wolf);
    expect(wrapper.html()).toContain(tint.root);
    expect(wrapper.text()).not.toContain('AL');
  });

  it('shows the photo, not the wolf, when there is one', async () => {
    const wrapper = await mountSuspended(UserAvatar, {
      props: { userId: 'user-1', name: 'Alex Laurent', image: '/api/avatars/abc' },
    });
    expect(wrapper.find('img').exists()).toBe(true);
    expect(wrapper.find('svg').exists()).toBe(false);
  });

  it('draws a dashed ring only for a ghost', async () => {
    const plain = await mountSuspended(UserAvatar, { props: { userId: 'u', name: 'A B' } });
    const ghost = await mountSuspended(UserAvatar, {
      props: { userId: 'u', name: 'A B', ghost: true },
    });
    expect(plain.html()).not.toContain('outline-dashed');
    expect(ghost.html()).toContain('outline-dashed');
  });
});
