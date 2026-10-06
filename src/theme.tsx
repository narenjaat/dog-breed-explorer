/** Design tokens, light/dark palettes, and the theme context. */

import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

export interface ThemeColors {
  readonly background: string;
  readonly surface: string;
  readonly surfaceElevated: string;
  readonly border: string;
  readonly borderStrong: string;
  readonly textPrimary: string;
  readonly textSecondary: string;
  readonly textMuted: string;
  readonly textInverse: string;
  readonly accent: string;
  readonly accentMuted: string;
  readonly accentText: string;
  readonly success: string;
  readonly warning: string;
  readonly warningSurface: string;
  readonly warningText: string;
  readonly danger: string;
  readonly dangerSurface: string;
  readonly dangerText: string;
  readonly offlineSurface: string;
  readonly offlineText: string;
  readonly skeleton: string;
  readonly overlay: string;
}

/**
 * Light palette. Text/background pairs are chosen to clear WCAG AA (4.5:1)
 * for body text, since a breed list is dense reading.
 */
const LIGHT_COLORS: ThemeColors = {
  background: '#F5F7FA',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#64748B',
  textInverse: '#FFFFFF',
  accent: '#2563EB',
  accentMuted: '#DBEAFE',
  accentText: '#1D4ED8',
  success: '#15803D',
  warning: '#B45309',
  warningSurface: '#FEF3C7',
  warningText: '#92400E',
  danger: '#B91C1C',
  dangerSurface: '#FEE2E2',
  dangerText: '#991B1B',
  offlineSurface: '#E2E8F0',
  offlineText: '#334155',
  skeleton: '#E2E8F0',
  overlay: 'rgba(15, 23, 42, 0.55)',
};

/** Dark palette, using elevated surfaces rather than pure black. */
const DARK_COLORS: ThemeColors = {
  background: '#0B1220',
  surface: '#141C2B',
  surfaceElevated: '#1B2538',
  border: '#243046',
  borderStrong: '#334155',
  textPrimary: '#F1F5F9',
  textSecondary: '#CBD5E1',
  textMuted: '#94A3B8',
  textInverse: '#0B1220',
  accent: '#60A5FA',
  accentMuted: '#1E3A5F',
  accentText: '#BFDBFE',
  success: '#4ADE80',
  warning: '#FBBF24',
  warningSurface: '#422006',
  warningText: '#FDE68A',
  danger: '#F87171',
  dangerSurface: '#450A0A',
  dangerText: '#FECACA',
  offlineSurface: '#243046',
  offlineText: '#CBD5E1',
  skeleton: '#1E293B',
  overlay: 'rgba(0, 0, 0, 0.65)',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  pill: 999,
} as const;

export const typography = {
  title: { fontSize: 28, fontWeight: '700' },
  heading: { fontSize: 20, fontWeight: '700' },
  subheading: { fontSize: 16, fontWeight: '600' },
  body: { fontSize: 15, fontWeight: '400' },
  label: { fontSize: 13, fontWeight: '600' },
  caption: { fontSize: 12, fontWeight: '400' },
} as const;

/**
 * Minimum touch target. 44pt is Apple's HIG floor and comfortably above
 * Android's 48dp guidance once padding is included.
 */
export const MIN_TOUCH_TARGET = 44;

/** Fixed row height for the breed list — see `getItemLayout` in BreedList. */
export const BREED_ROW_HEIGHT = 92;
export const SECTION_HEADER_HEIGHT = 40;

export interface Theme {
  readonly colors: ThemeColors;
  readonly isDark: boolean;
  readonly spacing: typeof spacing;
  readonly radius: typeof radius;
  readonly typography: typeof typography;
}

export function createTheme(isDark: boolean): Theme {
  return {
    colors: isDark ? DARK_COLORS : LIGHT_COLORS,
    isDark,
    spacing,
    radius,
    typography,
  };
}

export const lightTheme = createTheme(false);
export const darkTheme = createTheme(true);

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
