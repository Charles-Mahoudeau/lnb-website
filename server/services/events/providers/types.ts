// An image provider for the event picker. Adding one (stock photos, IGDB...) is a file like
// steamgriddb.ts, an entry in index.ts, and a tab in the picker.

export interface ProviderGame {
  id: string;
  name: string;
  year: number | null;
}

export interface ProviderImage {
  /** The full image, fetched by the server when picked. */
  url: string;
  /** A small preview, shown through the site's thumbnail route. */
  thumb: string;
  width: number;
  height: number;
  author: string | null;
}

export interface ImageProvider {
  /** Whether it's set up, such as with an API key. */
  available: () => boolean;
  searchGames: (term: string) => Promise<ProviderGame[]>;
  listImages: (gameId: string, kind: 'banners' | 'covers') => Promise<ProviderImage[]>;
  /** The only hosts its images and thumbnails may come from. */
  hosts: ReadonlySet<string>;
}
