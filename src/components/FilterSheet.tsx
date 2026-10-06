/**
 * Multi-select filter sheet.
 *
 * Every facet composes with the others (group AND size AND coat AND ...),
 * while values inside a facet are OR-ed, which is what makes
 * "Sporting + Large + Hypoallergenic + good_with_children >= 4" expressible.
 */

import React, { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  useAppDispatch,
  useAppSelector,
  allFiltersCleared,
  coatCategoryToggled,
  groupToggled,
  hypoallergenicToggled,
  sizeBandToggled,
  traitKeyToggled,
  traitMinScoreChanged,
} from '@/store';
import { selectAllGroups, selectFilteredCount, selectFilters } from '@/store/selectors';
import { useTheme, MIN_TOUCH_TARGET } from '@/theme';
import type { Theme } from '@/theme';
import type { CoatCategory, SizeBand } from '@/types';
import { COAT_CATEGORIES, FILTERABLE_TRAIT_KEYS, SIZE_BANDS, TRAIT_SCORE_MAX } from '@/types';
import { formatGroupName, humanizeKey } from '@/format';

export interface FilterSheetProps {
  visible: boolean;
  onClose: () => void;
}

const SIZE_LABELS: Record<SizeBand, string> = {
  small: 'Small (≤10kg)',
  medium: 'Medium (≤25kg)',
  large: 'Large (≤45kg)',
  giant: 'Giant (>45kg)',
};

const COAT_LABELS: Record<CoatCategory, string> = {
  short: 'Short',
  medium: 'Medium',
  long: 'Long',
  wire: 'Wire',
  curly: 'Curly',
  hairless: 'Hairless',
};

const SCORE_OPTIONS = Array.from({ length: TRAIT_SCORE_MAX }, (_, index) => index + 1);

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

function Chip({ label, selected, onPress }: ChipProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && styles.chipPressed,
      ]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

/**
 * Reads and writes the filters slice directly. The sheet holds a couple of
 * dozen chips and the Modal renders them only while open, so inline press handlers cost
 * nothing measurable, and the list screen does not have to relay every
 * facet's callback.
 */
export function FilterSheet({ visible, onClose }: FilterSheetProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const dispatch = useAppDispatch();

  const filters = useAppSelector(selectFilters);
  const groups = useAppSelector(selectAllGroups);
  const resultCount = useAppSelector(selectFilteredCount);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <View style={styles.backdrop}>
        {/* Tapping the dimmed area dismisses, matching platform convention. */}
        <Pressable
          style={styles.backdropTouchable}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close filters"
        />

        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Filters</Text>
            <Pressable
              onPress={() => dispatch(allFiltersCleared())}
              accessibilityRole="button"
              accessibilityLabel="Clear all filters"
              hitSlop={8}
            >
              <Text style={styles.clearAll}>Clear all</Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.sectionTitle}>Breed group</Text>
            <View style={styles.chipRow}>
              {groups.map((group) => (
                <Chip
                  key={group.id}
                  label={formatGroupName(group.name)}
                  selected={filters.groupIds.includes(group.id)}
                  onPress={() => dispatch(groupToggled(group.id))}
                />
              ))}
              {groups.length === 0 ? (
                <Text style={styles.emptyHint}>Groups load with the first sync.</Text>
              ) : null}
            </View>

            <Text style={styles.sectionTitle}>Size</Text>
            <View style={styles.chipRow}>
              {SIZE_BANDS.map((size) => (
                <Chip
                  key={size}
                  label={SIZE_LABELS[size]}
                  selected={filters.sizeBands.includes(size)}
                  onPress={() => dispatch(sizeBandToggled(size))}
                />
              ))}
            </View>

            <Text style={styles.sectionTitle}>Coat</Text>
            <View style={styles.chipRow}>
              {COAT_CATEGORIES.map((coat) => (
                <Chip
                  key={coat}
                  label={COAT_LABELS[coat]}
                  selected={filters.coatCategories.includes(coat)}
                  onPress={() => dispatch(coatCategoryToggled(coat))}
                />
              ))}
            </View>

            <Text style={styles.sectionTitle}>Hypoallergenic</Text>
            <View style={styles.chipRow}>
              <Chip
                label="Yes"
                selected={filters.hypoallergenic === true}
                onPress={() => dispatch(hypoallergenicToggled(true))}
              />
              <Chip
                label="No"
                selected={filters.hypoallergenic === false}
                onPress={() => dispatch(hypoallergenicToggled(false))}
              />
            </View>

            <Text style={styles.sectionTitle}>Trait threshold</Text>
            <View style={styles.chipRow}>
              {FILTERABLE_TRAIT_KEYS.map((trait) => (
                <Chip
                  key={trait}
                  label={humanizeKey(trait)}
                  selected={filters.traitKey === trait}
                  onPress={() => dispatch(traitKeyToggled(trait))}
                />
              ))}
            </View>

            {filters.traitKey !== null ? (
              <>
                <Text style={styles.subSectionTitle}>
                  Minimum score for {humanizeKey(filters.traitKey).toLowerCase()}
                </Text>
                <View style={styles.chipRow}>
                  {SCORE_OPTIONS.map((score) => (
                    <Chip
                      key={score}
                      label={`${score}+`}
                      selected={filters.traitMinScore === score}
                      onPress={() => dispatch(traitMinScoreChanged(score))}
                    />
                  ))}
                </View>
              </>
            ) : null}
          </ScrollView>

          <Pressable
            onPress={onClose}
            style={styles.applyButton}
            accessibilityRole="button"
            accessibilityLabel={`Show ${resultCount} breeds`}
          >
            <Text style={styles.applyButtonText}>
              Show {resultCount === 1 ? '1 breed' : `${resultCount} breeds`}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: theme.colors.overlay,
    },
    backdropTouchable: {
      flex: 1,
    },
    sheet: {
      maxHeight: '82%',
      backgroundColor: theme.colors.background,
      borderTopLeftRadius: theme.radius.lg,
      borderTopRightRadius: theme.radius.lg,
      paddingTop: theme.spacing.lg,
    },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.spacing.lg,
      paddingBottom: theme.spacing.md,
    },
    sheetTitle: {
      fontSize: theme.typography.heading.fontSize,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    clearAll: {
      fontSize: theme.typography.label.fontSize,
      fontWeight: '600',
      color: theme.colors.accentText,
    },
    scroll: {
      flexGrow: 0,
    },
    scrollContent: {
      paddingHorizontal: theme.spacing.lg,
      paddingBottom: theme.spacing.lg,
    },
    sectionTitle: {
      fontSize: theme.typography.label.fontSize,
      fontWeight: '700',
      color: theme.colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: theme.spacing.lg,
      marginBottom: theme.spacing.sm,
    },
    subSectionTitle: {
      fontSize: theme.typography.caption.fontSize,
      color: theme.colors.textMuted,
      marginTop: theme.spacing.md,
      marginBottom: theme.spacing.sm,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.sm,
    },
    chip: {
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.sm,
      minHeight: MIN_TOUCH_TARGET,
      justifyContent: 'center',
      borderRadius: theme.radius.pill,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    chipSelected: {
      backgroundColor: theme.colors.accentMuted,
      borderColor: theme.colors.accent,
    },
    chipPressed: {
      opacity: 0.7,
    },
    chipText: {
      fontSize: theme.typography.label.fontSize,
      color: theme.colors.textSecondary,
      fontWeight: '500',
    },
    chipTextSelected: {
      color: theme.colors.accentText,
      fontWeight: '700',
    },
    emptyHint: {
      fontSize: theme.typography.caption.fontSize,
      color: theme.colors.textMuted,
      paddingVertical: theme.spacing.sm,
    },
    applyButton: {
      margin: theme.spacing.lg,
      paddingVertical: theme.spacing.lg,
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.accent,
      alignItems: 'center',
      minHeight: MIN_TOUCH_TARGET,
      justifyContent: 'center',
    },
    applyButtonText: {
      color: theme.colors.textInverse,
      fontWeight: '700',
      fontSize: theme.typography.body.fontSize,
    },
  });
}
