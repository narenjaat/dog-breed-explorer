/**
 * Swipeable image gallery with per-image attribution.
 *
 * The API ships author/license/source for every image; those are licence terms
 * for CC-BY material, not decoration, so they are rendered under each slide
 * rather than dropped.
 *
 * Only the active slide is upgraded to the `large` variant (see
 * `imageCacheService`), which keeps memory flat while swiping.
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
import { Image } from 'expo-image';

import { resolveImageRequest } from '@/services/imageCacheService';
import { useTheme } from '@/theme/ThemeProvider';
import type { Theme } from '@/theme';
import type { BreedImage } from '@/types/domain';
import { EmptyState } from '@/components/States';

export interface BreedGalleryProps {
  readonly images: readonly BreedImage[];
  readonly breedName: string;
}

interface SlideProps {
  readonly image: BreedImage;
  readonly width: number;
  readonly isActive: boolean;
  readonly breedName: string;
  readonly index: number;
  readonly total: number;
}

function AttributionRow({ image }: { readonly image: BreedImage }): React.ReactElement | null {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { author, license, source, sourceUrl, licenseUrl } = image.attribution;

  const handleOpenSource = useCallback(() => {
    if (sourceUrl !== null) void Linking.openURL(sourceUrl);
  }, [sourceUrl]);

  const handleOpenLicense = useCallback(() => {
    if (licenseUrl !== null) void Linking.openURL(licenseUrl);
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
            <Text
              style={[styles.attributionText, licenseUrl !== null && styles.attributionLink]}
            >
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
            <Text
              style={[styles.attributionText, sourceUrl !== null && styles.attributionLink]}
            >
              {source.replace(/_/gu, ' ')}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function SlideComponent({
  image,
  width,
  isActive,
  breedName,
  index,
  total,
}: SlideProps): React.ReactElement {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [failed, setFailed] = useState(false);

  // Active slide gets `large`; neighbours stay on `medium`.
  const request = resolveImageRequest(image, isActive ? 'galleryActive' : 'gallery');

  const handleError = useCallback(() => {
    setFailed(true);
  }, []);

  return (
    <View style={[styles.slide, { width }]}>
      <View style={styles.imageFrame}>
        {failed || request.uri === null ? (
          <View style={styles.imageFallback}>
            <Text style={styles.imageFallbackText}>Image unavailable</Text>
          </View>
        ) : (
          <Image
            source={{ uri: request.uri }}
            style={styles.image}
            contentFit="cover"
            cachePolicy={request.cachePolicy}
            transition={200}
            onError={handleError}
            accessibilityLabel={`${breedName}, photo ${String(index + 1)} of ${String(total)}`}
          />
        )}
      </View>
      <AttributionRow image={image} />
    </View>
  );
}

const Slide = memo(SlideComponent);

function BreedGalleryComponent({ images, breedName }: BreedGalleryProps): React.ReactElement {
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
    ({ item, index }: ListRenderItemInfo<BreedImage>): React.ReactElement => (
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
          <View
            key={image.id}
            style={[styles.dot, index === activeIndex && styles.dotActive]}
          />
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
