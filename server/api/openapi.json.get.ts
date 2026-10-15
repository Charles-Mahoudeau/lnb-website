import { defineEventHandler } from 'nuxt/server';

import { auth } from '~~/server/lib/auth';
import { buildOpenApiDocument } from '~~/server/lib/openapi';

// Built once: the routes only change with a deploy.
let document: Promise<ReturnType<typeof buildOpenApiDocument>> | undefined;

export default defineEventHandler(() => {
  document ??= auth.api.generateOpenAPISchema().then(buildOpenApiDocument);
  return document;
});
