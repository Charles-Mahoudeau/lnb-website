import { readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { buildOpenApiDocument, documentedRoutes } from '../../server/lib/openapi.ts';

const API_DIR = new URL('../../server/api/', import.meta.url);

/** `METHOD /path` for each file in server/api/, as Nitro routes it. */
function routeFiles(): string[] {
  return readdirSync(API_DIR, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.ts'))
    .map((file) => {
      const match = /^(.*?)(?:\.(get|post|put|patch|delete))?\.ts$/.exec(file);
      const [, name = '', method = 'all'] = match ?? [];
      const path = name
        .replace(/(^|\/)index$/, '')
        .replace(/\[\.\.\.\w+\]/g, '**')
        .replace(/\[(\w+)\]/g, '{$1}');
      return `${method.toUpperCase()} /api/${path}`.replace(/\/$/, '');
    });
}

const authDocument = {
  paths: {
    '/get-session': {
      get: { tags: ['Default'], description: 'Get the current session.', security: [{}] },
    },
  },
  components: {
    schemas: {
      User: { type: 'object', properties: { image: { type: 'string', nullable: true } } },
    },
  },
};

describe('OpenAPI document', () => {
  it('documents every route in server/api/, and nothing else', () => {
    // Better Auth's catch-all is documented from Better Auth's own schema.
    const files = routeFiles().filter((route) => route !== 'ALL /api/auth/**');
    expect(routeFiles()).toContain('ALL /api/auth/**');
    expect(documentedRoutes().sort()).toEqual(files.sort());
  });

  it('puts every tag in a sidebar group, or Scalar hides its routes', () => {
    const document = buildOpenApiDocument(authDocument);
    const grouped = new Set(document['x-tagGroups'].flatMap((group) => group.tags));
    const used = Object.values(document.paths).flatMap((operations) =>
      Object.values(operations as Record<string, { tags?: string[] }>).flatMap(
        (op) => op.tags ?? [],
      ),
    );
    expect([...new Set(used)].filter((tag) => !grouped.has(tag))).toEqual([]);
  });

  it('resolves every schema reference', () => {
    const document = buildOpenApiDocument(authDocument);
    const refs = JSON.stringify(document).matchAll(/"\$ref":"#\/components\/schemas\/([^"]+)"/g);
    for (const [, name] of refs) expect(document.components.schemas).toHaveProperty(name!);
  });

  it("adds Better Auth's routes under /api/auth, with our tags and session cookie", () => {
    const document = buildOpenApiDocument(authDocument);
    expect(document.paths['/api/auth/get-session']).toEqual({
      get: {
        tags: ['Auth'],
        summary: 'Get the current session',
        description: 'Get the current session.',
        security: [{ session: [] }],
      },
    });
    expect(document.components.schemas.User).toEqual({
      type: 'object',
      properties: { image: { type: ['string', 'null'] } },
    });
  });
});
