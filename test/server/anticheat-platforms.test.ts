import { describe, expect, it, vi } from 'vitest';

import {
  mapCurseforgeFile,
  mapCurseforgeMod,
  mapModrinthProject,
  mapModrinthVersion,
} from '~~/server/services/anticheat/platforms';

// The mod catalog, which the platforms share, caches through Nitro.
vi.mock('nitropack/runtime', () => ({
  defineCachedFunction: (fn: unknown) => fn,
}));

describe('platform mapping', () => {
  it('maps a Modrinth version', () => {
    expect(
      mapModrinthVersion({
        id: 'abc',
        project_id: 'proj',
        version_number: '1.2.3',
        loaders: ['fabric'],
        date_published: '2024-01-01T00:00:00Z',
      }),
    ).toEqual({
      versionId: 'abc',
      projectId: 'proj',
      versionNumber: '1.2.3',
      loaders: ['fabric'],
      publishedAt: '2024-01-01T00:00:00Z',
    });
  });

  it('maps a Modrinth project, with the slug falling back to the ID', () => {
    const fetchedAt = new Date('2025-01-01T00:00:00Z');
    expect(
      mapModrinthProject(
        {
          id: 'proj',
          slug: null,
          title: 'Title',
          project_type: 'mod',
          status: 'approved',
          downloads: 12,
          published: '2023-01-01T00:00:00Z',
          server_side: 'optional',
        },
        fetchedAt,
      ),
    ).toEqual({
      id: 'proj',
      slug: 'proj',
      title: 'Title',
      projectType: 'mod',
      status: 'approved',
      downloads: 12,
      publishedAt: '2023-01-01T00:00:00Z',
      serverSide: 'optional',
      fetchedAt: '2025-01-01T00:00:00.000Z',
    });
  });

  it('maps a CurseForge exact match to its file', () => {
    expect(
      mapCurseforgeFile({
        id: 5,
        file: { id: 9, modId: 7, fileDate: '2024-02-02T00:00:00Z', fileFingerprint: 123 },
      }),
    ).toEqual({ fileId: 9, modId: 7, publishedAt: '2024-02-02T00:00:00Z' });
  });

  it('maps a CurseForge mod', () => {
    expect(
      mapCurseforgeMod(
        {
          id: 7,
          slug: 'slug',
          name: 'Name',
          downloadCount: 99,
          dateCreated: '2020-01-01T00:00:00Z',
        },
        new Date('2025-01-01T00:00:00Z'),
      ),
    ).toEqual({
      id: 7,
      slug: 'slug',
      name: 'Name',
      downloadCount: 99,
      dateCreated: '2020-01-01T00:00:00Z',
      fetchedAt: '2025-01-01T00:00:00.000Z',
    });
  });
});
