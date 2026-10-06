/**
 * Image caching policy.
 *
 * The dataset holds ~2,400 images (283 breeds x up to 10) in four variants.
 * Caching all of them to disk would be several hundred MB for data the user
 * will mostly never look at, so the policy is tiered by where an image is
 * shown:
 *
 *   list    -> thumb   , immutable : 283 small images, every one of which
 *                                    the user scrolls past. Cached by URL and
 *                                    never revalidated, so offline works.
 *   detail  -> medium  , immutable : one hero image per visited breed.
 *   gallery -> medium  , web       : upgraded to `large` only for the slide
 *                                    actually on screen, so swiping through 9
 *                                    images does not fetch 9 large files.
 *
 * FastImage (Glide on Android, SDWebImage on iOS) always caches to memory and
 * disk; there is no memory-only tier. `web` is the closest lever: it follows
 * the server's HTTP cache headers, so slides seen once can age out of the
 * disk cache instead of being pinned there like `immutable` entries.
 *
 * FastImage owns the eviction; this module only decides *policy* (which
 * variant, which cache mode).
 */

import FastImage from '@d11/react-native-fast-image';

import type { BreedImage } from '@/types/domain';

/** Where an image is being rendered, which determines the caching policy. */
export type ImageContext = 'list' | 'detail' | 'gallery' | 'galleryActive';

/** FastImage cache modes used by this app. */
export type CachePolicy = 'immutable' | 'web';

export interface ImageRequest {
  readonly uri: string | null;
  readonly cachePolicy: CachePolicy;
}

/**
 * Picks the variant and cache tier for a given usage.
 *
 * `galleryActive` (the visible slide) upgrades to `large`; the neighbouring
 * slides stay on `medium`, which is what keeps memory flat while swiping.
 */
export function resolveImageRequest(image: BreedImage | null, context: ImageContext): ImageRequest {
  if (image === null) return { uri: null, cachePolicy: 'web' };

  switch (context) {
    case 'list':
      // Small, frequently re-shown: persist so an offline relaunch has art.
      return { uri: image.thumbUrl, cachePolicy: 'immutable' };
    case 'detail':
      return { uri: image.mediumUrl ?? image.thumbUrl, cachePolicy: 'immutable' };
    case 'gallery':
      // Off-screen slides: `web`, so a long swipe session does not pin
      // images seen once in the disk cache.
      return { uri: image.mediumUrl ?? image.thumbUrl, cachePolicy: 'web' };
    case 'galleryActive':
      return { uri: image.largeUrl ?? image.mediumUrl ?? image.thumbUrl, cachePolicy: 'web' };
    default:
      return { uri: image.thumbUrl, cachePolicy: 'web' };
  }
}

/**
 * Resolves the list-row thumbnail.
 *
 * The list query deliberately skips the `breed_images` rows (283 rows would
 * otherwise drag ~2,400 image rows with them), so the denormalised
 * `thumbnailUrl` column is the primary source here. It is cached immutably:
 * these are the images the user scrolls past every session.
 */
export function resolveListThumbnail(
  thumbnailUrl: string | null,
  image: BreedImage | null,
): ImageRequest {
  const uri = thumbnailUrl ?? image?.thumbUrl ?? null;
  return { uri, cachePolicy: 'immutable' };
}

/**
 * Warms the disk cache for the first `limit` list thumbnails.
 *
 * Called after a sync so the top of the list has art immediately on the next
 * cold start. Deliberately capped: prefetching all 283 at once would contend
 * with the images actually being scrolled to.
 */
export async function prefetchListThumbnails(
  thumbnailUrls: readonly (string | null)[],
  limit = 24,
): Promise<void> {
  const urls = thumbnailUrls.filter((url): url is string => url !== null).slice(0, limit);
  if (urls.length === 0) return;

  try {
    FastImage.preload(urls.map((uri) => ({ uri, cache: FastImage.cacheControl.immutable })));
  } catch {
    // Prefetching is an optimisation; failing it must never surface to the
    // user or fail the sync that triggered it.
  }
}
