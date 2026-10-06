/**
 * Multi-select filter sheet.
 *
 * Every facet composes with the others (group AND size AND coat AND ...),
 * while values inside a facet are OR-ed, which is what makes
 * "Sporting + Large + Hypoallergenic + good_with_children >= 4" expressible.
 */

import React, { memo, useCallback, useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import type { Theme } from '@/theme';
import { MIN_TOUCH_TARGET } from '@/theme';
import type { BreedGroup, CoatCategory, FilterableTraitKey, SizeBand } from '@/types/domain';
import { COAT_CATEGORIES, SIZE_BANDS, TRAIT_SCORE_MAX } from '@/types/domain';
import type { FiltersState } from '@/store/slices/filtersSlice';
import { formatGroupName, humanizeKey } from '@/utils/format';

export interface FilterSheetProps {
  readonly visible: boolean;
  readonly filters: FiltersState;
  readonly groups: readonly BreedGroup[];
  readonly resultCount: number;
  readonly onClose: () => void;
  readonly onToggleGroup: (groupId: string) => void;
  readonly onToggleSize: (size: SizeBand) => void;
  readonly onToggleCoat: (coat: CoatCategory) => void;
  readonly onToggleHypoallergenic: (value: boolean) => void;
  readonly onToggleTrait: (trait: FilterableTraitKey) => void;
  readonly onChangeTraitScore: (score: number) => void;
  readonly onClearAll: () => void;
}

const SIZE_LABELS: Readonly<Record<SizeBand, string>> = {
  small: 'Small (≤10kg)',
  medium: 'Medium (≤25kg)',
  large: 'Large (≤45kg)',
  giant: 'Giant (>45kg)',
};

const COAT_LABELS: Readonly<Record<CoatCategory, string>> = {
  short: 'Short',
  medium: 'Medium',
  long: 'Long',
  wire: 'Wire',
  curly: 'Curly',
  hairless: 'Hairless',
};

const TRAIT_OPTIONS: readonly FilterableTraitKey[] = [
  'good_with_children',
  'good_with_dogs',
  'good_with_strangers',
];

interface ChipProps {
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
}

function ChipComponent({ label, selected, onPress }: ChipProps): React.ReactElement {
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

const Chip = memo(ChipComponent);

/** Wraps a chip so the parent passes a stable callback per value. */
function GroupChip({
  group,
  selected,
  onToggle,
}: {
  readonly group: BreedGroup;
  readonly selected: boolean;
  readonly onToggle: (groupId: string) => void;
}): React.ReactElement {
  const handlePress = useCallback(() => {
    onToggle(group.id);
  }, [onToggle, group.id]);
  return <Chip label={formatGroupName(group.name)} selected={selected} onPress={handlePress} />;
}

function SizeChip({
  size,
  selected,
  onToggle,
}: {
  readonly size: SizeBand;
  readonly selected: boolean;
  readonly onToggle: (size: SizeBand) => void;
}): React.ReactElement {
  const handlePress = useCallback(() => {
    onToggle(size);
  }, [onToggle, size]);
  return <Chip label={SIZE_LABELS[size]} selected={selected} onPress={handlePress} />;
}

function CoatChip({
  coat,
  selected,
  onToggle,
}: {
  readonly coat: CoatCategory;
  readonly selected: boolean;
  readonly onToggle: (coat: CoatCategory) => void;
}): React.ReactElement {
  const handlePress = useCallback(() => {
    onToggle(coat);
  }, [onToggle, coat]);
  return <Chip label={COAT_LABELS[coat]} selected={selected} onPress={handlePress} />;
}

function TraitChip({
  trait,
  selected,
  onToggle,
}: {
  readonly trait: FilterableTraitKey;
  readonly selected: boolean;
  readonly onToggle: (trait: FilterableTraitKey) => void;
}): React.ReactElement {
  const handlePress = useCallback(() => {
    onToggle(trait);
  }, [onToggle, trait]);
  return <Chip label={humanizeKey(trait)} selected={selected} onPress={handlePress} />;
}

function ScoreChip({
  score,
  selected,
  onSelect,
}: {
  readonly score: number;
  readonly selected: boolean;
  readonly onSelect: (score: number) => void;
}): React.ReactElement {
  const handlePress = useCallback(() => {
    onSelect(score);
  }, [onSelect, score]);
  return <Chip label={`${String(score)}+`} selected={selected} onPress={handlePress} />;
}

function FilterSheetComponent(props: FilterSheetProps): React.ReactElement {
  const {
    visible,
    filters,
    groups,
    resultCount,
    onClose,
    onToggleGroup,
    onToggleSize,
    onToggleCoat,
    onToggleHypoallergenic,
    onToggleTrait,
    onChangeTraitScore,
    onClearAll,
  } = props;

  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const handleHypoYes = useCallback(() => {
    onToggleHypoallergenic(true);
  }, [onToggleHypoallergenic]);
  const handleHypoNo = useCallback(() => {
    onToggleHypoallergenic(false);
  }, [onToggleHypoallergenic]);

  const scoreOptions = useMemo(
    () => Array.from({ length: TRAIT_SCORE_MAX }, (_, index) => index + 1),
    [],
  );

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
              onPress={onClearAll}
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
                <GroupChip
                  key={group.id}
                  group={group}
                  selected={filters.groupIds.includes(group.id)}
                  onToggle={onToggleGroup}
                />
              ))}
              {groups.length === 0 ? (
                <Text style={styles.emptyHint}>Groups load with the first sync.</Text>
              ) : null}
            </View>

            <Text style={styles.sectionTitle}>Size</Text>
            <View style={styles.chipRow}>
              {SIZE_BANDS.map((size) => (
                <SizeChip
                  key={size}
                  size={size}
                  selected={filters.sizeBands.includes(size)}
                  onToggle={onToggleSize}
                />
              ))}
            </View>

            <Text style={styles.sectionTitle}>Coat</Text>
            <View style={styles.chipRow}>
              {COAT_CATEGORIES.map((coat) => (
                <CoatChip
                  key={coat}
                  coat={coat}
                  selected={filters.coatCategories.includes(coat)}
                  onToggle={onToggleCoat}
                />
              ))}
            </View>

            <Text style={styles.sectionTitle}>Hypoallergenic</Text>
            <View style={styles.chipRow}>
              <Chip
                label="Yes"
                selected={filters.hypoallergenic === true}
                onPress={handleHypoYes}
              />
              <Chip label="No" selected={filters.hypoallergenic === false} onPress={handleHypoNo} />
            </View>

            <Text style={styles.sectionTitle}>Trait threshold</Text>
            <View style={styles.chipRow}>
              {TRAIT_OPTIONS.map((trait) => (
                <TraitChip
                  key={trait}
                  trait={trait}
                  selected={filters.traitKey === trait}
                  onToggle={onToggleTrait}
                />
              ))}
            </View>

            {filters.traitKey !== null ? (
              <>
                <Text style={styles.subSectionTitle}>
                  Minimum score for {humanizeKey(filters.traitKey).toLowerCase()}
                </Text>
                <View style={styles.chipRow}>
                  {scoreOptions.map((score) => (
                    <ScoreChip
                      key={score}
                      score={score}
                      selected={filters.traitMinScore === score}
                      onSelect={onChangeTraitScore}
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
            accessibilityLabel={`Show ${String(resultCount)} breeds`}
          >
            <Text style={styles.applyButtonText}>
              Show {resultCount === 1 ? '1 breed' : `${String(resultCount)} breeds`}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export const FilterSheet = memo(FilterSheetComponent);

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
