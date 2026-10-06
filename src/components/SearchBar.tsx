/**
 * Search input with a filter button.
 *
 * Typing updates `searchInput` on every keystroke, so the field feels instant,
 * while `searchQuery`, which re-filters the list, is committed only after a
 * 250ms pause (`useDebouncedSearch`).
 */

import { useCallback, useEffect, useRef } from 'react';
import {
  useAppDispatch,
  useAppSelector,
  searchCleared,
  searchInputChanged,
  searchQueryCommitted,
} from '@/store';
import { selectActiveFilterCount, selectFilteredCount, selectSearchInput } from '@/store/selectors';
import React, { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme, MIN_TOUCH_TARGET } from '@/theme';
import type { Theme } from '@/theme';

/** 250ms: long enough to skip intermediate keystrokes, short enough to feel live. */
const SEARCH_DEBOUNCE_MS = 250;

interface UseDebouncedSearchResult {
  value: string;
  onChangeText: (text: string) => void;
  onClear: () => void;
}

function useDebouncedSearch(debounceMs: number = SEARCH_DEBOUNCE_MS): UseDebouncedSearchResult {
  const dispatch = useAppDispatch();
  const value = useAppSelector(selectSearchInput);
  // Holds the pending debounce timer (whatever type setTimeout returns).
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onChangeText = useCallback(
    (text: string) => {
      dispatch(searchInputChanged(text));
      clearTimer();
      timerRef.current = setTimeout(() => {
        dispatch(searchQueryCommitted(text));
        timerRef.current = null;
      }, debounceMs);
    },
    [dispatch, debounceMs, clearTimer],
  );

  const onClear = useCallback(() => {
    // Clearing is intentional and immediate: waiting 250ms to restore the
    // full list after tapping ✕ feels broken.
    clearTimer();
    dispatch(searchCleared());
  }, [dispatch, clearTimer]);

  // Cancel a pending commit if the screen unmounts mid-debounce.
  useEffect(() => clearTimer, [clearTimer]);

  return { value, onChangeText, onClear };
}

export interface SearchBarProps {
  onOpenFilters: () => void;
}

function SearchBarComponent({ onOpenFilters }: SearchBarProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { value, onChangeText, onClear } = useDebouncedSearch();
  const activeFilterCount = useAppSelector(selectActiveFilterCount);
  const resultCount = useAppSelector(selectFilteredCount);

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
            activeFilterCount > 0 ? `Filters, ${activeFilterCount} active` : 'Filters'
          }
        >
          <Text
            style={[
              styles.filterButtonText,
              activeFilterCount > 0 && styles.filterButtonTextActive,
            ]}
          >
            Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </Text>
        </Pressable>
      </View>

      <Text style={styles.resultCount} accessibilityLiveRegion="polite">
        {resultCount === 1 ? '1 breed' : `${resultCount} breeds`}
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
