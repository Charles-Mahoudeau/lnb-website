import { FILE_PROBLEMS } from '#shared/schemas/files';
import type { FileKind, FileList, FileProblem, FileView } from '#shared/schemas/files';

// The Files library of the admin area. Writes throw a FileError with the API's problem.

/** A refused Files request, with the reason the API gave. */
export class FileError extends Error {
  constructor(readonly problem: FileProblem | 'failed') {
    super(`Files request refused: ${problem}`);
  }
}

function problemOf(value: unknown): FileProblem | 'failed' {
  return FILE_PROBLEMS.includes(value as FileProblem) ? (value as FileProblem) : 'failed';
}

/** Every file of the library. */
export function useAdminFiles() {
  return useFetch<FileList>('/api/admin/files', { key: 'files-admin' });
}

/**
 * Sends a file as the raw request body, which the server streams to disk. XMLHttpRequest and not
 * fetch, because it is the one that reports the upload's progress.
 */
function upload(
  file: File,
  kind: FileKind,
  onProgress: (ratio: number) => void,
): Promise<FileView> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const query = new URLSearchParams({ name: file.name, kind });
    request.open('POST', `/api/admin/files?${query.toString()}`);
    request.setRequestHeader('Content-Type', 'application/octet-stream');
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onerror = () => {
      reject(new FileError('failed'));
    };
    request.onload = () => {
      let body: unknown;
      try {
        body = JSON.parse(request.responseText);
      } catch {
        body = undefined;
      }
      if (request.status === 201 && body) {
        resolve(body as FileView);
        return;
      }
      const problem = (body as { data?: { problem?: unknown } } | undefined)?.data?.problem;
      reject(new FileError(problemOf(problem)));
    };
    request.send(file);
  });
}

/** What admins can do to the library. Each throws a FileError when refused. */
export const fileActions = {
  upload,
  setKind: async (id: string, kind: FileKind) => {
    try {
      return await $fetch<FileView>(`/api/admin/files/${id}`, { method: 'PATCH', body: { kind } });
    } catch (error) {
      throw new FileError(
        problemOf((error as { data?: { data?: { problem?: unknown } } }).data?.data?.problem),
      );
    }
  },
  remove: async (id: string) => {
    try {
      await $fetch(`/api/admin/files/${id}`, { method: 'DELETE' });
    } catch (error) {
      throw new FileError(
        problemOf((error as { data?: { data?: { problem?: unknown } } }).data?.data?.problem),
      );
    }
  },
};
