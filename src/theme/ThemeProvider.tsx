/**
 * Theme context, following the OS colour scheme.
 */

import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

import type { Theme } from '@/theme';
import { createTheme, darkTheme } from '@/theme';

const ThemeContext = createContext<Theme>(darkTheme);

export interface ThemeProviderProps {
  readonly children: React.ReactNode;
  /** Forces a scheme. Used by tests and by the dark-mode screenshot pass. */
  readonly forcedScheme?: 'light' | 'dark';
}

export function ThemeProvider({ children, forcedScheme }: ThemeProviderProps): React.ReactElement {
  const systemScheme = useColorScheme();
  const scheme = forcedScheme ?? systemScheme ?? 'light';

  // Memoised so a re-render does not hand every consumer a new object and
  // invalidate their StyleSheet memoisation.
  const theme = useMemo(() => createTheme(scheme === 'dark'), [scheme]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
