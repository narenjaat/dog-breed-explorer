/**
 * Connectivity / freshness banner.
 *
 * Deliberately non-blocking: it is a slim strip above the list, never a modal
 * or a full-screen error, so a failed refresh never stops the user browsing
 * the cached data.
 */

import React, { memo, useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme';
import type { Theme } from '@/theme';
import type { SyncStatus } from '@/types';
import { formatRelativeTime } from '@/format';

export interface SyncBannerProps {
  status: SyncStatus;
  isOnline: boolean;
  lastSyncedAt: number | null;
  errorMessage: string | null;
  cachedBreedCount: number;
  onRetry: () => void;
}

type BannerTone = 'info' | 'warning' | 'danger' | 'muted';

interface BannerContent {
  message: string;
  tone: BannerTone;
  showSpinner: boolean;
  showRetry: boolean;
}

/**
 * Decides which single message the banner shows. A plain function (no React),
 * so the tests can check every case without rendering anything.
 */
export function resolveBannerContent(props: {
  status: SyncStatus;
  isOnline: boolean;
  lastSyncedAt: number | null;
  errorMessage: string | null;
  cachedBreedCount: number;
  now?: number;
}): BannerContent | null {
  const { status, isOnline, lastSyncedAt, errorMessage, cachedBreedCount, now } = props;
  const freshness = formatRelativeTime(lastSyncedAt, now);

  if (status === 'syncing') {
    return {
      message: cachedBreedCount > 0 ? 'Syncing breeds…' : 'Loading breeds…',
      tone: 'info',
      showSpinner: true,
      showRetry: false,
    };
  }

  // Offline outranks a stale error: "you are offline" explains the situation
  // better than the network error that offline state caused.
  if (!isOnline) {
    return {
      message:
        cachedBreedCount > 0
          ? `Offline — showing cached breeds · Last synced ${freshness}`
          : 'Offline — connect to load breeds',
      tone: 'muted',
      showSpinner: false,
      showRetry: false,
    };
  }

  if (status === 'error') {
    return {
      message:
        cachedBreedCount > 0
          ? `${errorMessage ?? 'Could not refresh.'} Showing cached data from ${freshness}.`
          : (errorMessage ?? 'Could not load breeds.'),
      tone: 'danger',
      showSpinner: false,
      showRetry: true,
    };
  }

  if (status === 'partial') {
    return {
      message: errorMessage ?? 'Some data could not be refreshed. Showing cached data.',
      tone: 'warning',
      showSpinner: false,
      showRetry: true,
    };
  }

  // All good (this run, or a previous launch): just show how fresh the data is.
  if (lastSyncedAt !== null) {
    return {
      message: `Last synced ${freshness}`,
      tone: 'info',
      showSpinner: false,
      showRetry: false,
    };
  }

  return null;
}

function SyncBannerComponent({
  status,
  isOnline,
  lastSyncedAt,
  errorMessage,
  cachedBreedCount,
  onRetry,
}: SyncBannerProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const content = resolveBannerContent({
    status,
    isOnline,
    lastSyncedAt,
    errorMessage,
    cachedBreedCount,
  });

  if (content === null) return null;

  const toneStyle = styles[content.tone];
  const toneTextStyle = {
    info: styles.infoText,
    warning: styles.warningText,
    danger: styles.dangerText,
    muted: styles.mutedText,
  }[content.tone];

  return (
    <View
      style={[styles.container, toneStyle]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      {content.showSpinner ? (
        <ActivityIndicator size="small" color={theme.colors.accent} style={styles.spinner} />
      ) : null}

      <Text style={[styles.message, toneTextStyle]} numberOfLines={2}>
        {content.message}
      </Text>

      {content.showRetry ? (
        <Pressable
          onPress={onRetry}
          style={styles.retry}
          accessibilityRole="button"
          accessibilityLabel="Retry sync"
          hitSlop={8}
        >
          <Text style={[styles.retryText, toneTextStyle]}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export const SyncBanner = memo(SyncBannerComponent);

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    spinner: {
      marginRight: theme.spacing.sm,
    },
    message: {
      flex: 1,
      fontSize: theme.typography.caption.fontSize,
    },
    retry: {
      marginLeft: theme.spacing.md,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
    },
    retryText: {
      fontSize: theme.typography.caption.fontSize,
      fontWeight: '700',
      textDecorationLine: 'underline',
    },
    info: { backgroundColor: theme.colors.surfaceElevated },
    infoText: { color: theme.colors.textSecondary },
    warning: { backgroundColor: theme.colors.warningSurface },
    warningText: { color: theme.colors.warningText },
    danger: { backgroundColor: theme.colors.dangerSurface },
    dangerText: { color: theme.colors.dangerText },
    muted: { backgroundColor: theme.colors.offlineSurface },
    mutedText: { color: theme.colors.offlineText },
  });
}
