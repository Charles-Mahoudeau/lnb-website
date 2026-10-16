import { defineEventHandler } from 'nuxt/server';

import { flagService } from '~~/server/services/flags';

// Public: the front page and the header need it before sign-in. It says what is on, nothing more.
export default defineEventHandler(() => flagService.states());
