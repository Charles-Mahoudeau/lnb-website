import { steamGridDb } from './steamgriddb';
import type { ImageProvider } from './types';

export const IMAGE_PROVIDERS = { steamgriddb: steamGridDb } satisfies Record<string, ImageProvider>;
export type ImageProviderName = keyof typeof IMAGE_PROVIDERS;

export { ProviderUnavailableError } from './steamgriddb';
