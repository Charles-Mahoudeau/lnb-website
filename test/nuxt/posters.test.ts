import { mountSuspended } from '@nuxt/test-utils/runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';

import PostersFitTitle from '~/components/posters/FitTitle.vue';

// happy-dom doesn't lay text out: the title's width is faked from its font size and longest line,
// in a 600px wide box.
function fakeLayout() {
  const width = vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get');
  width.mockImplementation(function (this: HTMLElement) {
    const longest = Math.max(...this.textContent.split('\n').map((line) => line.length));
    return longest * parseFloat(this.style.fontSize) * 0.6;
  });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    const lines = this.textContent.split('\n').length;
    return lines * parseFloat(this.style.fontSize);
  });
}

async function settle() {
  for (let i = 0; i < 5; i++) await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** Mounts a title whose text can be changed, and reads the size it settled on. */
async function mountTitle(initial: string, maxHeight: number) {
  const text = ref(initial);
  const wrapper = await mountSuspended(
    defineComponent({
      render: () => h(PostersFitTitle, { text: text.value, max: 132, min: 56, maxHeight }),
    }),
  );
  await settle();
  const title = () => wrapper.element as HTMLElement;
  return {
    size: () => parseFloat(title().style.fontSize),
    lines: () => title().textContent,
    async setText(value: string) {
      text.value = value;
      await settle();
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('poster title', () => {
  it('stays at its largest size when it fits', async () => {
    fakeLayout();
    const title = await mountTitle('Smash\nBros', 400);
    expect(title.size()).toBe(132);
  });

  it('shrinks a long line to fit the width, within its bounds', async () => {
    fakeLayout();
    const title = await mountTitle('Werewolf & Among\nUs', 400);
    // 16 characters × 0.6 × size ≤ 600, so 62px.
    expect(title.size()).toBe(62);

    await title.setText('A title far too long for any poster to hold');
    expect(title.size()).toBe(56);
  });

  it('shrinks to fit its height, and keeps the line breaks it was given', async () => {
    fakeLayout();
    const title = await mountTitle('One\n  Two \nSix', 240);
    expect(title.size()).toBe(80);
    expect(title.lines()).toBe('One\nTwo\nSix');
  });
});
