// @ts-check
import prettier from 'eslint-config-prettier/flat';
import betterTailwindcss from 'eslint-plugin-better-tailwindcss';
import { getDefaultAttributes } from 'eslint-plugin-better-tailwindcss/api/defaults';

import withNuxt from './.nuxt/eslint.config.mjs';

export default withNuxt(
  betterTailwindcss.configs['correctness-error'],
  {
    settings: {
      'better-tailwindcss': {
        entryPoint: 'app/assets/css/main.css',
        attributes: [...getDefaultAttributes(), ['^v-bind:ui$', [{ match: 'objectValues' }]]],
      },
    },
  },
  {
    rules: {
      // Keep styling on the design tokens (docs/design.md).
      'better-tailwindcss/no-restricted-classes': [
        'error',
        {
          restrict: [
            {
              pattern: String.raw`^(?:.*:)?-?[a-z][a-z0-9-]*-\[[^\]]+\]$`,
              message:
                'Arbitrary values bypass the design tokens. Use a theme class instead (docs/design.md).',
            },
            {
              pattern: String.raw`^(?:.*:)?[a-z-]+-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black|night|crimson|dusk)(?:-\d{2,3})?(?:\/\d+)?$`,
              message:
                'Raw palette colors bypass the design tokens. Use a semantic class such as text-muted, bg-elevated or text-primary (docs/design.md).',
            },
            {
              pattern: String.raw`^(?:.*:)?[a-z-]+-(?:primary|secondary|success|info|warning|error)-\d{2,3}(?:\/\d+)?$`,
              message:
                'Use the semantic color without a shade (text-primary, bg-error/10), so light and dark mode stay in sync (docs/design.md).',
            },
          ],
        },
      ],
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index']],
          pathGroups: [
            { pattern: '#*', group: 'internal' },
            { pattern: '~/**', group: 'internal' },
            { pattern: '~~/**', group: 'internal' },
          ],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
    },
  },
  prettier,
);
