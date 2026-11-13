<script setup lang="ts">
import type { AvatarProps } from '@nuxt/ui';

// A person's avatar: their photo, or the LNB wolf on a tint picked from their account ID
// (avatarTint). Use this everywhere an account is shown, so the fallback is the same on every page.
const props = defineProps<{
  /** The account ID, which picks the tint. */
  userId: string;
  name: string;
  image?: string | null;
  size?: AvatarProps['size'];
  /** An account made by an admin for someone who hasn't signed in yet: a dashed ring. Admin screens only. */
  ghost?: boolean;
}>();

const tint = computed(() => avatarTint(props.userId));
</script>

<template>
  <UAvatar
    :src="image ?? undefined"
    :alt="name"
    :size="size"
    :ui="{
      root: [tint.root, ghost ? 'outline-2 outline-offset-2 outline-default outline-dashed' : ''],
    }"
  >
    <!-- The wolf of the LNB logo, cut out of its canvas so it fills 80% of the avatar's height. -->
    <svg
      viewBox="60 44 392 424"
      aria-hidden="true"
      fill="currentColor"
      class="h-4/5 w-auto"
      :class="tint.wolf"
    >
      <path
        fill-rule="evenodd"
        d="M 212 50.5 C 224 65, 234 80, 242 95 C 259 86.5, 277 78.5, 295.5 72 C 304 99, 308 134, 307 166 C 334 181, 351 211, 355 245 C 361 273, 404 301, 446.5 314 C 440 344, 414 362.5, 372 362.5 C 340 362.5, 310 349, 279 339 C 280 367, 287 390, 299.5 402.5 C 284 400, 270 395, 256 390.5 L 256 438 C 241 434, 227 428, 215 419 C 205 431, 197 445, 191 461.7 C 172 451, 159 424, 155.5 390 C 177 361, 206 335, 247 323.5 C 284 323.5, 334 348.5, 373 348.5 C 400 348.5, 412 336, 415 319.5 C 378 324.5, 348 324, 306 315.5 C 284 311, 270 309.5, 256 309.5 C 186 309.5, 138 363, 116 448 C 97 417, 87 375, 87 332.5 L 66 352.5 C 77 277, 102 221, 137.5 185 C 150 127, 178 77, 212 50.5 Z M 199.5 76 C 176 99, 161 141, 151.5 187.5 L 188 207.5 C 187 164, 191 117, 199.5 76 Z M 246 104.5 C 259 98, 272 92, 284.5 86.5 C 274 100, 265 117, 258.5 135.5 C 254.5 125, 250.5 115, 246 104.5 Z M 276.5 240 C 290 234.5, 312 236.5, 321.5 253 C 305 261, 286 257, 276.5 240 Z"
      />
    </svg>
  </UAvatar>
</template>
