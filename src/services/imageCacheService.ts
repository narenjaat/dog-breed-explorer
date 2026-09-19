/**
 * Image caching policy.
 *
 * The dataset holds ~2,400 images (283 breeds x up to 10) in four variants.
 * Caching all of them to disk would be several hundred MB for data the user
 * will mostly never look at, so the policy is tiered by where an image is
 * shown:
 *
 *   list    -> thumb   , disk-cached : 283 small images, every one of which
 *                                      the user scrolls past. Worth persisting.
 *   detail  -> medium  , disk-cached : one hero image per visited breed.
 *   gallery -> medium  , memory-only : upgraded to `large` only for the slide
 *                                      actually on screen, so swiping through
 *                                      9 images does not write 9 large files.
 *
 * `expo-image` owns the eviction; this module decides *policy* (which variant,
 * which cache tier) and exposes the one lever the OS cannot infer: clearing
 * the cache on request.
 */

import { Image } from 'expo-image';

import type { BreedImage } from '@/types/domain';

/** Where an image is being rendered, which determines the caching policy. */
export type ImageContext = 'list' | 'detail' | 'gallery' | 'galleryActive';

/** expo-image cache policies used by this app. */
export type CachePolicy = 'memory-disk' | 'memory' | 'none';

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
export function resolveImageRequest(
  image: BreedImage | null,
  context: ImageContext,
): ImageRequest {
  if (image === null) return { uri: null, cachePolicy: 'none' };

  switch (context) {
    case 'list':
      // Small, frequently re-shown: persist so an offline relaunch has art.
      return { uri: image.thumbUrl, cachePolicy: 'memory-disk' };
    case 'detail':
      return { uri: image.mediumUrl ?? image.thumbUrl, cachePolicy: 'memory-disk' };
    case 'gallery':
      // Off-screen slides: memory only, so a long swipe session does not
      // fill the disk cache with images seen once.
      return { uri: image.mediumUrl ?? image.thumbUrl, cachePolicy: 'memory' };
    case 'galleryActive':
      return { uri: image.largeUrl ?? image.mediumUrl ?? image.thumbUrl, cachePolicy: 'memory' };
    default:
      return { uri: image.thumbUrl, cachePolicy: 'memory' };
  }
}

/**
 * Number of gallery slides to keep mounted either side of the active one.
 * Two is enough to make a swipe feel instant without holding 9 decoded
 * bitmaps in memory at once.
 */
export const GALLERY_WINDOW_SIZE = 2;

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
  const urls = thumbnailUrls
    .filter((url): url is string => url !== null)
    .slice(0, limit);
  if (urls.length === 0) return;

  try {
    await Image.prefetch(urls, { cachePolicy: 'memory-disk' });
  } catch {
    // Prefetching is an optimisation; failing it must never surface to the
    // user or fail the sync that triggered it.
  }
}

/** Clears both cache tiers. Exposed for a user-initiated "free up space". */
export async function clearImageCache(): Promise<void> {
  await Promise.allSettled([Image.clearMemoryCache(), Image.clearDiskCache()]);
}
