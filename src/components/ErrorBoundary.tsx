/**
 * Error boundary for major feature areas.
 *
 * A render crash in one feature (say, the gallery) should cost the user that
 * feature, not the whole app — so boundaries wrap each screen and the gallery
 * separately, each with its own retry.
 */

import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { reportError } from '@/services/crashReporter';
import { lightTheme } from '@/theme';

export interface ErrorBoundaryProps {
  readonly children: ReactNode;
  /** Shown in the fallback, e.g. "the breed gallery". */
  readonly featureName?: string;
  /** Custom fallback; receives a reset callback to retry the subtree. */
  readonly fallback?: (error: Error, reset: () => void) => ReactNode;
  readonly onError?: (error: Error, info: ErrorInfo) => void;
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
    this.props.onError?.(error, info);
  }

  private readonly handleReset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    const { children, fallback, featureName } = this.props;

    if (error === null) return children;
    if (fallback !== undefined) return fallback(error, this.handleReset);

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
