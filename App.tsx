/**
 * Application root.
 *
 * Provider order matters: SafeArea -> Redux -> React Query -> Theme ->
 * ErrorBoundary -> Navigation, so every screen can read insets, state and
 * theme, and a crash anywhere below the boundary is contained.
 */

import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { Provider as ReduxProvider } from 'react-redux';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { RootNavigator } from '@/navigation/RootNavigator';
import { store } from '@/store';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * React Query handles the *detail-screen* request lifecycle (retry, dedupe,
 * background refetch). The bulk breed catalogue deliberately does NOT live
 * here: it is owned by the sync service and SQLite, because it must survive
 * process death, which an in-memory query cache does not.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Our API layer already retries with backoff; retrying again here
      // would multiply the attempts.
      retry: false,
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});

/** Keeps the status bar legible against whichever theme is active. */
function ThemedStatusBar(): React.ReactElement {
  const theme = useTheme();
  return <StatusBar style={theme.isDark ? 'light' : 'dark'} />;
}

export default function App(): React.ReactElement {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ReduxProvider store={store}>
          <QueryClientProvider client={queryClient}>
            <ThemeProvider>
              <ThemedStatusBar />
              <ErrorBoundary featureName="the application">
                <RootNavigator />
              </ErrorBoundary>
            </ThemeProvider>
          </QueryClientProvider>
        </ReduxProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
