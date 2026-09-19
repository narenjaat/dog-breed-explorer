/**
 * Loading, empty and error states shared across screens.
 */

import React, { memo, useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import type { Theme } from '@/theme';
import { BREED_ROW_HEIGHT } from '@/theme';

/** A single shimmering placeholder row, matching the real row's geometry. */
function SkeletonRowComponent(): React.ReactElement {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    // useNativeDriver keeps the pulse on the UI thread, so the skeleton does
    // not itself cost frames while the first sync is running.
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.85,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.4,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => {
      animation.stop();
    };
  }, [opacity]);

  return (
    <View style={styles.skeletonRow} accessible={false}>
      <Animated.View style={[styles.skeletonThumb, { opacity }]} />
      <View style={styles.skeletonBody}>
        <Animated.View style={[styles.skeletonLine, styles.skeletonLineWide, { opacity }]} />
        <Animated.View style={[styles.skeletonLine, styles.skeletonLineNarrow, { opacity }]} />
      </View>
    </View>
  );
}

const SkeletonRow = memo(SkeletonRowComponent);

export interface ListSkeletonProps {
  readonly rowCount?: number;
}

/** Placeholder list shown during the very first load, before any cache. */
function ListSkeletonComponent({ rowCount = 8 }: ListSkeletonProps): React.ReactElement {
  return (
    <View accessibilityLabel="Loading breeds" accessibilityRole="progressbar">
      {Array.from({ length: rowCount }, (_, index) => (
        <SkeletonRow key={index} />
      ))}
    </View>
  );
}

export const ListSkeleton = memo(ListSkeletonComponent);

export interface EmptyStateProps {
  readonly title: string;
  readonly message: string;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
}

function EmptyStateComponent({
  title,
  message,
  actionLabel,
  onAction,
}: EmptyStateProps): React.ReactElement {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.stateContainer}>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateMessage}>{message}</Text>
      {actionLabel !== undefined && onAction !== undefined ? (
        <Pressable
          onPress={onAction}
          style={styles.stateButton}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text style={styles.stateButtonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export const EmptyState = memo(EmptyStateComponent);

function createStyles(theme: Theme) {
  return StyleSheet.create({
    skeletonRow: {
      height: BREED_ROW_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: theme.spacing.lg,
      backgroundColor: theme.colors.surface,
    },
    skeletonThumb: {
      width: 64,
      height: 64,
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.skeleton,
    },
    skeletonBody: {
      flex: 1,
      marginLeft: theme.spacing.lg,
    },
    skeletonLine: {
      height: 12,
      borderRadius: theme.radius.sm,
      backgroundColor: theme.colors.skeleton,
      marginBottom: theme.spacing.sm,
    },
    skeletonLineWide: { width: '65%' },
    skeletonLineNarrow: { width: '40%' },
    stateContainer: {
      paddingVertical: theme.spacing.xxl,
      paddingHorizontal: theme.spacing.xl,
      alignItems: 'center',
    },
    stateTitle: {
      fontSize: theme.typography.subheading.fontSize,
      fontWeight: '700',
      color: theme.colors.textPrimary,
      marginBottom: theme.spacing.sm,
      textAlign: 'center',
    },
    stateMessage: {
      fontSize: theme.typography.body.fontSize,
      color: theme.colors.textSecondary,
      textAlign: 'center',
      lineHeight: 21,
    },
    stateButton: {
      marginTop: theme.spacing.xl,
      paddingHorizontal: theme.spacing.xl,
      paddingVertical: theme.spacing.md,
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.accent,
      minHeight: 44,
      justifyContent: 'center',
    },
    stateButtonText: {
      color: theme.colors.textInverse,
      fontWeight: '700',
      fontSize: theme.typography.body.fontSize,
    },
  });
}
