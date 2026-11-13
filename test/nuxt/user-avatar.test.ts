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
});
