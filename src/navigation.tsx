/**
 * Navigation: the typed param list and the root stack.
 *
 * `RootStackParamList` is the single source of truth, so a param rename is a
 * compile error at every call site rather than a runtime undefined.
 */

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useMemo } from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import type { Theme as NavigationTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ErrorBoundary } from '@/components/States';
import { BreedDetailsScreen } from '@/screens/BreedDetailsScreen';
import { BreedListScreen } from '@/screens/BreedListScreen';
import { useTheme } from '@/theme';

export type RootStackParamList = {
  BreedList: undefined;
  BreedDetails: {
    breedId: string;
    /** Passed so the header can render before the breed is read from cache. */
    breedName: string;
  };
};

// Props each screen receives (navigation + route), typed from the list above.
export type BreedListScreenProps = NativeStackScreenProps<RootStackParamList, 'BreedList'>;
export type BreedDetailsScreenProps = NativeStackScreenProps<RootStackParamList, 'BreedDetails'>;

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
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
