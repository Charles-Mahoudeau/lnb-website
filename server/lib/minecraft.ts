import { createHash } from 'node:crypto';

/** The UUID an offline-mode (cracked) server gives a username: a version 3 UUID of "OfflinePlayer:<name>". */
export function offlineUuid(username: string): string {
  const hash = createHash('md5').update(`OfflinePlayer:${username}`, 'utf8').digest();
  hash[6] = (hash[6]! & 0x0f) | 0x30;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const hex = hash.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Whether the UUID fits the account type: cracked accounts have the offline UUID of their name,
 * and premium (Mojang) accounts have a random version 4 UUID.
 */
export function uuidMatchesAccount(input: { uuid: string; username: string; cracked: boolean }) {
  if (input.cracked) return input.uuid === offlineUuid(input.username);
  return input.uuid[14] === '4';
}
