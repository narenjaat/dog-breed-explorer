/**
 * Swipeable image gallery with per-image attribution.
 *
 * The API ships author/license/source for every image; those are licence terms
 * for CC-BY material, not decoration, so they are rendered under each slide
 * rather than dropped.
 *
 * Only the active slide loads the `large` variant; the rest stay on `medium`,
 * which keeps memory flat while swiping. Slides use `web` caching (HTTP cache
 * headers) so a long swipe session does not pin every image to disk.
 */

import React, { memo, useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import type { ListRenderItemInfo, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import FastImage from '@d11/react-native-fast-image';

import { useTheme } from '@/theme';
import type { Theme } from '@/theme';
import type { BreedImage } from '@/types';
import { EmptyState } from '@/components/States';
import { toSafeExternalUrl } from '@/format';

export interface BreedGalleryProps {
  images: BreedImage[];
  breedName: string;
}

interface SlideProps {
  image: BreedImage;
  width: number;
  isActive: boolean;
  breedName: string;
  index: number;
  total: number;
}

/** Opens a vetted web URL. A device with no browser rejects; that is not a crash. */
function openExternal(url: string): void {
  Linking.openURL(url).catch(() => undefined);
}

function AttributionRow({ image }: { image: BreedImage }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { author, license, source } = image.attribution;
  // API-supplied links are untrusted: anything but http(s) renders as plain text.
  const sourceUrl = toSafeExternalUrl(image.attribution.sourceUrl);
  const licenseUrl = toSafeExternalUrl(image.attribution.licenseUrl);

  const handleOpenSource = useCallback(() => {
    if (sourceUrl !== null) openExternal(sourceUrl);
  }, [sourceUrl]);

  const handleOpenLicense = useCallback(() => {
    if (licenseUrl !== null) openExternal(licenseUrl);
  }, [licenseUrl]);

  // Nothing to attribute (rare, but the field is optional in the schema).
  if (author === null && license === null && source === null) return null;

  return (
    <View style={styles.attribution}>
      {author === null ? null : (
        <Text style={styles.attributionText} numberOfLines={2}>
          <Text style={styles.attributionLabel}>Author: </Text>
          {author}
        </Text>
      )}

      <View style={styles.attributionRow}>
        {license === null ? null : (
          <Pressable
            onPress={handleOpenLicense}
            disabled={licenseUrl === null}
            accessibilityRole={licenseUrl === null ? 'text' : 'link'}
            accessibilityLabel={`Licence ${license}`}
            hitSlop={6}
          >
            <Text style={[styles.attributionText, licenseUrl !== null && styles.attributionLink]}>
              {license}
            </Text>
          </Pressable>
        )}

        {source === null ? null : (
          <Pressable
            onPress={handleOpenSource}
            disabled={sourceUrl === null}
            accessibilityRole={sourceUrl === null ? 'text' : 'link'}
            accessibilityLabel={`Source ${source}`}
            hitSlop={6}
          >
            <Text style={[styles.attributionText, sourceUrl !== null && styles.attributionLink]}>
              {source.replace(/_/gu, ' ')}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function SlideComponent({ image, width, isActive, breedName, index, total }: SlideProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [failed, setFailed] = useState(false);

  const uri = isActive ? (image.largeUrl ?? image.mediumUrl) : image.mediumUrl;

  const handleError = useCallback(() => {
    setFailed(true);
  }, []);

  return (
    <View style={[styles.slide, { width }]}>
      <View style={styles.imageFrame}>
        {failed || uri === null ? (
          <View style={styles.imageFallback}>
            <Text style={styles.imageFallbackText}>Image unavailable</Text>
          </View>
        ) : (
          <FastImage
            source={{ uri, cache: FastImage.cacheControl.web }}
            style={styles.image}
            resizeMode={FastImage.resizeMode.cover}
            transition={FastImage.transition.fade}
            onError={handleError}
            accessibilityLabel={`${breedName}, photo ${index + 1} of ${total}`}
          />
        )}
      </View>
      <AttributionRow image={image} />
    </View>
  );
}

const Slide = memo(SlideComponent);

function BreedGalleryComponent({ images, breedName }: BreedGalleryProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { width } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(0);

  const slideWidth = width;

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const next = Math.round(offsetX / slideWidth);
      setActiveIndex((current) => (current === next ? current : next));
    },
    [slideWidth],
  );

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<BreedImage>) => (
      <Slide
        image={item}
        width={slideWidth}
        isActive={index === activeIndex}
        breedName={breedName}
        index={index}
        total={images.length}
      />
    ),
    [slideWidth, activeIndex, breedName, images.length],
  );

  const keyExtractor = useCallback((item: BreedImage): string => item.id, []);

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: slideWidth,
      offset: slideWidth * index,
      index,
    }),
    [slideWidth],
  );

  if (images.length === 0) {
    return (
      <EmptyState
        title="No photos"
        message={`The Dog API does not provide any images for ${breedName}.`}
      />
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={images}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemLayout={getItemLayout}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        // Keep only the neighbouring slides mounted: 9 decoded large images
        // would blow the memory budget.
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        windowSize={3}
        // See BreedListScreen: omitted for Fabric mount safety.
        testID="breed-gallery"
      />

      <View style={styles.pagination}>
        <Text style={styles.paginationText}>
          {String(activeIndex + 1)} / {String(images.length)}
        </Text>
      </View>

      <View style={styles.dots}>
        {images.map((image, index) => (
          <View key={image.id} style={[styles.dot, index === activeIndex && styles.dotActive]} />
        ))}
      </View>
    </View>
  );
}

export const BreedGallery = memo(BreedGalleryComponent);

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      paddingTop: theme.spacing.md,
    },
    slide: {
      paddingHorizontal: theme.spacing.lg,
    },
    imageFrame: {
      width: '100%',
      aspectRatio: 4 / 3,
      borderRadius: theme.radius.lg,
      overflow: 'hidden',
      backgroundColor: theme.colors.skeleton,
    },
    image: {
      width: '100%',
      height: '100%',
    },
    imageFallback: {
      width: '100%',
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceElevated,
    },
    imageFallbackText: {
      fontSize: theme.typography.caption.fontSize,
      color: theme.colors.textMuted,
    },
    attribution: {
      marginTop: theme.spacing.md,
      padding: theme.spacing.md,
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
    },
    attributionRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.md,
      marginTop: theme.spacing.xs,
    },
    attributionLabel: {
      fontWeight: '700',
      color: theme.colors.textSecondary,
    },
    attributionText: {
      fontSize: theme.typography.caption.fontSize,
      color: theme.colors.textMuted,
    },
    attributionLink: {
      color: theme.colors.accentText,
      textDecorationLine: 'underline',
    },
    pagination: {
      alignItems: 'center',
      marginTop: theme.spacing.md,
    },
    paginationText: {
      fontSize: theme.typography.caption.fontSize,
      color: theme.colors.textMuted,
      fontVariant: ['tabular-nums'],
    },
    dots: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: theme.spacing.xs,
      marginTop: theme.spacing.sm,
      flexWrap: 'wrap',
      paddingHorizontal: theme.spacing.lg,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: theme.colors.border,
    },
    dotActive: {
      backgroundColor: theme.colors.accent,
      width: 18,
    },
  });
}
