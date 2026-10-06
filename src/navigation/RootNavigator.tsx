/**
 * Root navigation stack.
 *
 * Two screens, both typed through `RootStackParamList`, so navigation params
 * are checked at compile time.
 */

import React, { useMemo } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import type { Theme as NavigationTheme } from '@react-navigation/native';
import { DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { BreedDetailsScreen } from '@/screens/BreedDetailsScreen';
import { BreedListScreen } from '@/screens/BreedListScreen';
import { useTheme } from '@/theme/ThemeProvider';
import type { RootStackParamList } from '@/navigation/types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator(): React.ReactElement {
  const theme = useTheme();

  // Hand React Navigation our palette so its own chrome (headers, card
  // backgrounds) matches the app rather than fighting it.
  const navigationTheme = useMemo<NavigationTheme>(() => {
    const base = theme.isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: theme.colors.accent,
        background: theme.colors.background,
        card: theme.colors.surface,
        text: theme.colors.textPrimary,
        border: theme.colors.border,
      },
    };
  }, [theme]);

  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTintColor: theme.colors.textPrimary,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      >
        <Stack.Screen name="BreedList" options={{ title: 'Dog Breeds', headerShown: false }}>
          {(props) => (
            <ErrorBoundary featureName="the breed list">
              <BreedListScreen {...props} />
            </ErrorBoundary>
          )}
        </Stack.Screen>

        <Stack.Screen
          name="BreedDetails"
          // Header title comes from the param, so it is correct before the
          // breed is loaded from cache.
          options={({ route }) => ({ title: route.params.breedName })}
        >
          {(props) => (
            <ErrorBoundary featureName="this breed's details">
              <BreedDetailsScreen {...props} />
            </ErrorBoundary>
          )}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}
