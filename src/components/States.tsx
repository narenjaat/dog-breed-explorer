/**
 * Loading, empty and error states shared across screens, including the
 * error boundary that wraps each feature area.
 */

import React, { memo, useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme, BREED_ROW_HEIGHT, lightTheme } from '@/theme';
import type { Theme } from '@/theme';
import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

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

export interface ErrorContext {
  /** Which feature area failed, e.g. "the photo gallery". */
  readonly feature: string;
  /** React's component stack, when the error came from a render. */
  readonly componentStack?: string | null;
}

export function reportError(error: Error, context: ErrorContext): void {
  if (__DEV__) {
    console.error(`[crash] ${context.feature}`, error, context.componentStack ?? '');
  }
  // Production: forward to the crash reporter here, e.g.
  // Sentry.captureException(error, { tags: { feature: context.feature } });
}

export interface ErrorBoundaryProps {
  readonly children: ReactNode;
  /** Shown in the fallback, e.g. "the breed gallery". */
  readonly featureName?: string;
}

interface ErrorBoundaryState {
  readonly error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    reportError(error, {
      feature: this.props.featureName ?? 'app',
      componentStack: info.componentStack,
    });
  }

  private readonly handleReset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    const { children, featureName } = this.props;

    if (error === null) return children;

    return (
      <View style={styles.container}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.message}>
          {featureName === undefined
            ? 'This part of the app ran into an unexpected problem.'
            : `We could not display ${featureName}.`}
        </Text>
        {/* Raw messages can carry internals (URLs, SQL, file paths); users
            only see them in development builds. */}
        {__DEV__ ? (
          <Text style={styles.detail} numberOfLines={3}>
            {error.message}
          </Text>
        ) : null}
        <Pressable
          onPress={this.handleReset}
          style={styles.button}
          accessibilityRole="button"
          accessibilityLabel="Try again"
        >
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

/**
 * Static styles: a boundary must render even if the theme context is what
 * failed, so it deliberately does not call `useTheme()`.
 */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: lightTheme.spacing.xl,
    backgroundColor: lightTheme.colors.background,
  },
  title: {
    fontSize: lightTheme.typography.heading.fontSize,
    fontWeight: '700',
    color: lightTheme.colors.textPrimary,
    marginBottom: lightTheme.spacing.sm,
    textAlign: 'center',
  },
  message: {
    fontSize: lightTheme.typography.body.fontSize,
    color: lightTheme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: lightTheme.spacing.md,
  },
  detail: {
    fontSize: lightTheme.typography.caption.fontSize,
    color: lightTheme.colors.textMuted,
    textAlign: 'center',
    marginBottom: lightTheme.spacing.xl,
  },
  button: {
    paddingHorizontal: lightTheme.spacing.xl,
    paddingVertical: lightTheme.spacing.md,
    borderRadius: lightTheme.radius.md,
    backgroundColor: lightTheme.colors.accent,
    minHeight: 44,
    justifyContent: 'center',
  },
  buttonText: {
    color: lightTheme.colors.textInverse,
    fontWeight: '700',
    fontSize: lightTheme.typography.body.fontSize,
  },
});
