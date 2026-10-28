import { API_KEY_PROBLEMS } from '#shared/schemas/api-keys';
import type {
  ApiKeyBody,
  ApiKeyCreated,
  ApiKeyDetail,
  ApiKeyList,
  ApiKeyProblem,
  ApiKeyRotateBody,
} from '#shared/schemas/api-keys';

// The API keys section of the admin area. Writes throw an ApiKeyError with the API's problem.

/** A refused API key request, with the reason the API gave. */
export class ApiKeyError extends Error {
  constructor(readonly problem: ApiKeyProblem | 'failed') {
    super(`API key request refused: ${problem}`);
  }
}

async function call<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    const problem = (error as { data?: { data?: { problem?: unknown } } }).data?.data?.problem;
    throw new ApiKeyError(
      API_KEY_PROBLEMS.includes(problem as ApiKeyProblem) ? (problem as ApiKeyProblem) : 'failed',
    );
  }
}

/** Every API key. */
export function useAdminApiKeys() {
  return useFetch<ApiKeyList>('/api/admin/api-keys', { key: 'api-keys-admin' });
}

/** One API key with the routes it called. */
export function useAdminApiKey(id: string) {
  return useFetch<ApiKeyDetail>(`/api/admin/api-keys/${id}`, { key: `api-key-admin-${id}` });
}

/** What admins can do to the API keys. Each throws an ApiKeyError when refused. */
export const apiKeyActions = {
  create: (body: ApiKeyBody) =>
    call(() => $fetch<ApiKeyCreated>('/api/admin/api-keys', { method: 'POST', body })),
  rotate: (id: string, body: ApiKeyRotateBody) =>
    call(() => $fetch<ApiKeyCreated>(`/api/admin/api-keys/${id}/rotate`, { method: 'POST', body })),
  revoke: (id: string) =>
    call(() => $fetch(`/api/admin/api-keys/${id}/revoke`, { method: 'POST' })),
};
