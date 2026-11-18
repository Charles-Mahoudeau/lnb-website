import { defineEventHandler } from 'nuxt/server';

import { ruleService } from '~~/server/services/rules';

// Public: the rules show without signing in. With the `rules` flag off the answer is still 200,
// with `enabled: false`, so the page can say they are being rewritten.
export default defineEventHandler(() => ruleService.listPublic());
