/**
 * Application root.
 *
 * Provider order matters: SafeArea -> Redux -> Theme -> ErrorBoundary ->
 * Navigation, so every screen can read insets, state and
 * theme, and a crash anywhere below the boundary is contained.
 */

import React from 'react';
import { StatusBar } from 'react-native';
import { Provider as ReduxProvider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ErrorBoundary } from '@/components/States';
import { RootNavigator } from '@/navigation';
import { store } from '@/store';
import { ThemeProvider, useTheme } from '@/theme';

/** Keeps the status bar legible against whichever theme is active. */
function ThemedStatusBar(): React.ReactElement {
  const theme = useTheme();
  // Android draws edge-to-edge (gradle.properties), so only the icon colour
  // needs setting; screens pad themselves with safe-area insets.
  return <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />;
}

export default function App(): React.ReactElement {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ReduxProvider store={store}>
          <ThemeProvider>
            <ThemedStatusBar />
            <ErrorBoundary featureName="the application">
              <RootNavigator />
            </ErrorBoundary>
          </ThemeProvider>
        </ReduxProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
