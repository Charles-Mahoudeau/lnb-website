import type { LinkProblem } from '#shared/schemas/link';
import { LINK_PROBLEMS } from '#shared/schemas/link';
import type { WardenLinkPreview } from '#shared/schemas/warden';

export class LinkCodeError extends Error {
  constructor(readonly problem: LinkProblem) {
    super(`Link code refused: ${problem}`);
  }
}

function fromAuthClient(error: { status: number; error?: string }): LinkCodeError {
  if (error.status === 429) return new LinkCodeError('tooManyAttempts');
  if (error.error === 'expired_token') return new LinkCodeError('expired');
  if (error.error === 'invalid_request') return new LinkCodeError('unknown');
  return new LinkCodeError('failed');
}

function fromApi(error: unknown): LinkCodeError {
  const problem = (error as { data?: { data?: { problem?: unknown } } }).data?.data?.problem;
  return new LinkCodeError(
    LINK_PROBLEMS.includes(problem as LinkProblem) ? (problem as LinkProblem) : 'failed',
  );
}

/** Links an app to the signed-in account with the 6-digit code it shows (Better Auth's device authorization). */
export function useLinkCode() {
  /**
   * Checks the code and claims it for the signed-in user, so only they can approve it.
   * Returns the app asking to link.
   */
  async function check(code: string): Promise<{ appId: string }> {
    const { data, error } = await authClient().device({ query: { user_code: code } });
    if (error) throw fromAuthClient(error);
    if (data.status !== 'pending') throw new LinkCodeError('used');
    // Better Auth refuses codes from unknown apps, so this only guards against a removed app.
    if (!isLinkApp(data.client_id)) throw new LinkCodeError('unknown');
    return { appId: data.client_id };
  }

  /** With a redirect URI, returns the URL to send the person back to, with the app's token. */
  async function approve(
    code: string,
    redirect?: { uri: string; state?: string },
  ): Promise<{ redirectTo?: string }> {
    try {
      return await $fetch('/api/link/approve', {
        method: 'POST',
        body: { userCode: code, redirectUri: redirect?.uri, state: redirect?.state },
      });
    } catch (error) {
      throw fromApi(error);
    }
  }

  async function deny(code: string) {
    try {
      await $fetch('/api/link/deny', { method: 'POST', body: { userCode: code } });
    } catch (error) {
      throw fromApi(error);
    }
  }

  /** What a Warden code the user just checked stands for: a device, or a Minecraft account and their slots. */
  async function wardenPreview(code: string): Promise<WardenLinkPreview> {
    try {
      return await $fetch<WardenLinkPreview>(`/api/warden/link-requests/${code}`);
    } catch (error) {
      throw fromApi(error);
    }
  }

  return { check, approve, deny, wardenPreview };
}
