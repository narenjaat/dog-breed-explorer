/**
 * Search input with a filter button.
 *
 * The input is uncontrolled-by-debounce: it renders `value` from the store on
 * every keystroke (so typing feels instant) while the *query* that drives
 * filtering is committed separately after a debounce.
 */

import React, { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import type { Theme } from '@/theme';
import { MIN_TOUCH_TARGET } from '@/theme';

export interface SearchBarProps {
  readonly value: string;
  readonly onChangeText: (text: string) => void;
  readonly onClear: () => void;
  readonly onOpenFilters: () => void;
  readonly activeFilterCount: number;
  readonly resultCount: number;
}

function SearchBarComponent({
  value,
  onChangeText,
  onClear,
  onOpenFilters,
  activeFilterCount,
  resultCount,
}: SearchBarProps): React.ReactElement {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.container}>
      <View style={styles.inputRow}>
        <View style={styles.inputWrapper}>
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder="Search breeds or other names"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.input}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            clearButtonMode="never"
            accessibilityLabel="Search breeds"
            accessibilityHint="Searches breed names and alternate names"
          />
          {value.length > 0 ? (
            <Pressable
              onPress={onClear}
              style={styles.clearButton}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={8}
            >
              <Text style={styles.clearIcon}>✕</Text>
            </Pressable>
          ) : null}
        </View>

        <Pressable
          onPress={onOpenFilters}
          style={({ pressed }) => [
            styles.filterButton,
            activeFilterCount > 0 && styles.filterButtonActive,
            pressed && styles.filterButtonPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={
            activeFilterCount > 0 ? `Filters, ${String(activeFilterCount)} active` : 'Filters'
          }
        >
          <Text
            style={[
              styles.filterButtonText,
              activeFilterCount > 0 && styles.filterButtonTextActive,
            ]}
          >
            Filters{activeFilterCount > 0 ? ` (${String(activeFilterCount)})` : ''}
          </Text>
        </Pressable>
      </View>

      <Text style={styles.resultCount} accessibilityLiveRegion="polite">
        {resultCount === 1 ? '1 breed' : `${String(resultCount)} breeds`}
      </Text>
    </View>
  );
}

export const SearchBar = memo(SearchBarComponent);

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.sm,
      paddingBottom: theme.spacing.sm,
      backgroundColor: theme.colors.background,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
    },
    inputWrapper: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: theme.spacing.md,
      minHeight: MIN_TOUCH_TARGET,
    },
    input: {
      flex: 1,
      fontSize: theme.typography.body.fontSize,
      color: theme.colors.textPrimary,
      paddingVertical: theme.spacing.sm,
    },
    clearButton: {
      padding: theme.spacing.xs,
      marginLeft: theme.spacing.xs,
    },
    clearIcon: {
      fontSize: 14,
      color: theme.colors.textMuted,
      fontWeight: '600',
    },
    filterButton: {
      paddingHorizontal: theme.spacing.lg,
      minHeight: MIN_TOUCH_TARGET,
      justifyContent: 'center',
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    filterButtonActive: {
      backgroundColor: theme.colors.accentMuted,
      borderColor: theme.colors.accent,
    },
    filterButtonPressed: {
      opacity: 0.7,
    },
    filterButtonText: {
      fontSize: theme.typography.label.fontSize,
      fontWeight: '600',
      color: theme.colors.textSecondary,
    },
    filterButtonTextActive: {
      color: theme.colors.accentText,
    },
    resultCount: {
      marginTop: theme.spacing.sm,
      fontSize: theme.typography.caption.fontSize,
      color: theme.colors.textMuted,
    },
  });
}
