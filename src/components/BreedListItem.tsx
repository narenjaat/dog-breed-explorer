/**
 * One breed row.
 *
 * This is the component that runs 283 times, so it is memoised and takes a
 * stable `onPress(breedId, breedName)` callback rather than a per-row closure
 * — an inline arrow in the parent would give every row a new prop identity on
 * each render and defeat `memo` entirely.
 */

import React, { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import FastImage from '@d11/react-native-fast-image';

import { useTheme, BREED_ROW_HEIGHT } from '@/theme';
import type { Theme } from '@/theme';
import type { Breed } from '@/types';
import { formatRange, initialsFor } from '@/format';

export interface BreedListItemProps {
  breed: Breed;
  onPress: (breedId: string, breedName: string) => void;
}

const SIZE_LABELS: Record<string, string> = {
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
  giant: 'Giant',
};

function BreedListItemComponent({ breed, onPress }: BreedListItemProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  // Stable per-row callback: depends only on values that change when the row
  // changes, so scrolling does not churn props.
  const handlePress = useCallback(() => {
    onPress(breed.id, breed.name);
  }, [onPress, breed.id, breed.name]);

  const sizeLabel = breed.sizeBand === null ? null : (SIZE_LABELS[breed.sizeBand] ?? null);
  const weight = formatRange(breed.maleWeight, 'kg');

  const uri = breed.thumbnailUrl;

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${breed.name}${sizeLabel === null ? '' : `, ${sizeLabel}`}`}
      accessibilityHint="Opens breed details"
    >
      <View style={styles.thumbnailWrapper}>
        {uri === null ? (
          <View style={styles.thumbnailFallback}>
            <Text style={styles.thumbnailInitials}>{initialsFor(breed.name)}</Text>
          </View>
        ) : (
          <FastImage
            // `immutable`: list thumbnails are cached to disk by URL and never
            // revalidated, so an offline relaunch still has art.
            source={{ uri, cache: FastImage.cacheControl.immutable }}
            style={styles.thumbnail}
            resizeMode={FastImage.resizeMode.cover}
            transition={FastImage.transition.fade}
            accessible={false}
          />
        )}
      </View>

      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {breed.name}
        </Text>

        {breed.otherNames.length > 0 ? (
          <Text style={styles.otherNames} numberOfLines={1}>
            {breed.otherNames.join(', ')}
          </Text>
        ) : null}

        <View style={styles.metaRow}>
          {sizeLabel === null ? null : (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{sizeLabel}</Text>
            </View>
          )}
          {breed.hypoallergenic === true ? (
            <View style={[styles.badge, styles.badgeAccent]}>
              <Text style={[styles.badgeText, styles.badgeAccentText]}>Hypoallergenic</Text>
            </View>
          ) : null}
          <Text style={styles.weight} numberOfLines={1}>
            {weight}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

/**
 * Custom comparator: rows are re-rendered only when a field this component
 * actually displays has changed. Without it, any new object identity from the
 * store would re-render every visible row.
 */
function arePropsEqual(previous: BreedListItemProps, next: BreedListItemProps): boolean {
  if (previous.onPress !== next.onPress) return false;
  const a = previous.breed;
  const b = next.breed;
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.thumbnailUrl === b.thumbnailUrl &&
    a.sizeBand === b.sizeBand &&
    a.hypoallergenic === b.hypoallergenic &&
    a.otherNames === b.otherNames &&
    a.maleWeight === b.maleWeight
  );
}

export const BreedListItem = memo(BreedListItemComponent, arePropsEqual);

function createStyles(theme: Theme) {
  return StyleSheet.create({
    row: {
      height: BREED_ROW_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: theme.spacing.lg,
      backgroundColor: theme.colors.surface,
    },
    rowPressed: {
      backgroundColor: theme.colors.accentMuted,
    },
    thumbnailWrapper: {
      width: 64,
      height: 64,
      borderRadius: theme.radius.md,
      overflow: 'hidden',
      backgroundColor: theme.colors.skeleton,
    },
    thumbnail: {
      width: '100%',
      height: '100%',
    },
    thumbnailFallback: {
      width: '100%',
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.accentMuted,
    },
    thumbnailInitials: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.colors.accentText,
    },
    body: {
      flex: 1,
      marginLeft: theme.spacing.lg,
      justifyContent: 'center',
    },
    name: {
      fontSize: theme.typography.subheading.fontSize,
      fontWeight: '600',
      color: theme.colors.textPrimary,
    },
    otherNames: {
      fontSize: theme.typography.caption.fontSize,
      color: theme.colors.textMuted,
      marginTop: 2,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: theme.spacing.sm,
      gap: theme.spacing.sm,
    },
    badge: {
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: 2,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.border,
    },
    badgeAccent: {
      backgroundColor: theme.colors.accentMuted,
    },
    badgeText: {
      fontSize: 11,
      fontWeight: '600',
      color: theme.colors.textSecondary,
    },
    badgeAccentText: {
      color: theme.colors.accentText,
    },
    weight: {
      fontSize: theme.typography.caption.fontSize,
      color: theme.colors.textMuted,
      flexShrink: 1,
    },
  });
}
