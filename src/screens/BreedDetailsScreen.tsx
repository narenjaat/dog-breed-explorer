/**
 * Breed detail: Overview | Traits | Gallery.
 *
 * Every field here is nullable in the source data, so the screen renders
 * through the formatters in `utils/format`, which substitute an em-dash
 * rather than letting "null"/"undefined" reach the UI.
 */

import { StyleSheet, Text, View, Pressable, RefreshControl, ScrollView } from 'react-native';
import { useTheme, MIN_TOUCH_TARGET } from '@/theme';
import { TRAIT_SCORE_MAX, SCORED_TRAIT_KEYS } from '@/types';
import {
  UNKNOWN_PLACEHOLDER,
  formatExerciseMinutes,
  formatGroupName,
  formatHypoallergenic,
  formatLifespan,
  formatList,
  formatOrigin,
  formatRange,
} from '@/format';
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BreedGallery } from '@/components/BreedGallery';
import { ErrorBoundary, EmptyState } from '@/components/States';
import { useBreedDetails } from '@/hooks/useBreedDetails';
import { useAppSelector } from '@/store';
import { selectGroupsById, selectIsOnline } from '@/store/selectors';
import type { Theme } from '@/theme';
import type { Breed, ScoredTraitKey } from '@/types';
import type { BreedDetailsScreenProps } from '@/navigation';

export interface TraitScaleProps {
  label: string;
  /** 1-5 score, or null when the API did not rate this trait. */
  score: number | null;
}

function TraitScaleComponent({ label, score }: TraitScaleProps) {
  const theme = useTheme();
  const styles = useMemo(() => createTraitStyles(theme), [theme]);

  const hasScore = score !== null;
  const rounded = hasScore ? Math.max(0, Math.min(TRAIT_SCORE_MAX, Math.round(score))) : 0;

  return (
    <View
      style={styles.container}
      accessible
      accessibilityRole="progressbar"
      // Announces "Energy, 3 of 5" rather than reading five anonymous bars.
      accessibilityLabel={
        hasScore ? `${label}, ${rounded} out of ${TRAIT_SCORE_MAX}` : `${label}, not rated`
      }
      accessibilityValue={hasScore ? { min: 0, max: TRAIT_SCORE_MAX, now: rounded } : undefined}
    >
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.value, !hasScore && styles.valueMuted]}>
          {hasScore ? `${rounded}/${TRAIT_SCORE_MAX}` : UNKNOWN_PLACEHOLDER}
        </Text>
      </View>

      <View style={styles.track} importantForAccessibility="no-hide-descendants">
        {Array.from({ length: TRAIT_SCORE_MAX }, (_, index) => (
          <View
            key={index}
            style={[styles.segment, index < rounded ? styles.segmentFilled : styles.segmentEmpty]}
          />
        ))}
      </View>
    </View>
  );
}

export const TraitScale = memo(TraitScaleComponent);

export interface ExerciseScaleProps {
  minutes: number | null;
}

/** Upper bound of the observed `exercise_minutes` range, used for the bar. */
const EXERCISE_MAX_MINUTES = 120;

function ExerciseScaleComponent({ minutes }: ExerciseScaleProps) {
  const theme = useTheme();
  const styles = useMemo(() => createTraitStyles(theme), [theme]);

  const hasValue = minutes !== null;
  const ratio = hasValue ? Math.max(0, Math.min(1, minutes / EXERCISE_MAX_MINUTES)) : 0;
  // RN types percentages as `${number}%`, so build it as a typed literal.
  const fillWidth: `${number}%` = `${Math.round(ratio * 100)}%`;

  return (
    <View
      style={styles.container}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={
        hasValue
          ? `Daily exercise, ${formatExerciseMinutes(minutes)}`
          : 'Daily exercise, not recorded'
      }
    >
      <View style={styles.header}>
        <Text style={styles.label}>Daily exercise</Text>
        <Text style={[styles.value, !hasValue && styles.valueMuted]}>
          {formatExerciseMinutes(minutes)}
        </Text>
      </View>

      <View style={styles.continuousTrack} importantForAccessibility="no-hide-descendants">
        <View style={[styles.continuousFill, { width: fillWidth }]} />
      </View>
    </View>
  );
}

export const ExerciseScale = memo(ExerciseScaleComponent);

function createTraitStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      marginBottom: theme.spacing.lg,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: theme.spacing.sm,
    },
    label: {
      fontSize: theme.typography.body.fontSize,
      color: theme.colors.textPrimary,
      fontWeight: '500',
      flexShrink: 1,
    },
    value: {
      fontSize: theme.typography.label.fontSize,
      fontWeight: '700',
      color: theme.colors.accentText,
      marginLeft: theme.spacing.sm,
    },
    valueMuted: {
      color: theme.colors.textMuted,
      fontWeight: '400',
    },
    track: {
      flexDirection: 'row',
      gap: theme.spacing.xs,
    },
    segment: {
      flex: 1,
      height: 8,
      borderRadius: theme.radius.sm,
    },
    segmentFilled: {
      backgroundColor: theme.colors.accent,
    },
    segmentEmpty: {
      backgroundColor: theme.colors.border,
    },
    continuousTrack: {
      height: 8,
      borderRadius: theme.radius.sm,
      backgroundColor: theme.colors.border,
      overflow: 'hidden',
    },
    continuousFill: {
      height: '100%',
      borderRadius: theme.radius.sm,
      backgroundColor: theme.colors.accent,
    },
  });
}

type TabName = 'Overview' | 'Traits' | 'Gallery';
const TABS: TabName[] = ['Overview', 'Traits', 'Gallery'];

/** Human labels for the trait rows, in the order the brief lists them. */
const TRAIT_LABELS: Record<ScoredTraitKey, string> = {
  energy: 'Energy',
  barking: 'Barking',
  drooling: 'Drooling',
  grooming: 'Grooming needs',
  shedding: 'Shedding',
  trainability: 'Trainability',
  good_with_dogs: 'Good with dogs',
  apartment_friendly: 'Apartment friendly',
  good_with_children: 'Good with children',
  good_with_strangers: 'Good with strangers',
};

interface FactRowProps {
  label: string;
  value: string;
}

function FactRow({ label, value }: FactRowProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const isUnknown = value === UNKNOWN_PLACEHOLDER;

  return (
    <View
      style={styles.factRow}
      accessible
      accessibilityLabel={`${label}: ${isUnknown ? 'not recorded' : value}`}
    >
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={[styles.factValue, isUnknown && styles.factValueUnknown]}>{value}</Text>
    </View>
  );
}

function OverviewTab({ breed }: { breed: Breed }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const groupsById = useAppSelector(selectGroupsById);

  const group = breed.groupId === null ? undefined : groupsById.get(breed.groupId);

  return (
    <View style={styles.tabContent}>
      {breed.description === null ? null : (
        <Text style={styles.description}>{breed.description}</Text>
      )}

      <Text style={styles.sectionTitle}>Key facts</Text>
      <View style={styles.card}>
        <FactRow
          label="Breed group"
          value={group === undefined ? UNKNOWN_PLACEHOLDER : formatGroupName(group.name)}
        />
        <FactRow label="Life span" value={formatLifespan(breed.life)} />
        <FactRow label="Hypoallergenic" value={formatHypoallergenic(breed.hypoallergenic)} />
        <FactRow label="Origin" value={formatOrigin(breed.origin)} />
      </View>

      <Text style={styles.sectionTitle}>Size</Text>
      <View style={styles.card}>
        <FactRow label="Weight (male)" value={formatRange(breed.maleWeight, 'kg')} />
        <FactRow label="Weight (female)" value={formatRange(breed.femaleWeight, 'kg')} />
        <FactRow label="Height (male)" value={formatRange(breed.maleHeight, 'cm')} />
        <FactRow label="Height (female)" value={formatRange(breed.femaleHeight, 'cm')} />
      </View>

      <Text style={styles.sectionTitle}>Coat</Text>
      <View style={styles.card}>
        <FactRow label="Type" value={breed.coat.type ?? UNKNOWN_PLACEHOLDER} />
        <FactRow label="Length" value={breed.coat.length ?? UNKNOWN_PLACEHOLDER} />
        <FactRow label="Colours" value={formatList(breed.coat.colors)} />
      </View>

      <Text style={styles.sectionTitle}>Also known as</Text>
      <View style={styles.card}>
        <Text style={[styles.cardText, breed.otherNames.length === 0 && styles.factValueUnknown]}>
          {formatList(breed.otherNames)}
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Recognised by</Text>
      <View style={styles.card}>
        <Text style={[styles.cardText, breed.recognizedBy.length === 0 && styles.factValueUnknown]}>
          {formatList(breed.recognizedBy)}
        </Text>
      </View>
    </View>
  );
}

function TraitsTab({ breed }: { breed: Breed }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const hasAnyScore = SCORED_TRAIT_KEYS.some((key) => breed.traits.scores[key] !== null);

  return (
    <View style={styles.tabContent}>
      {!hasAnyScore && breed.traits.exerciseMinutes === null ? (
        <EmptyState
          title="No trait data"
          message={`The Dog API does not publish trait scores for ${breed.name}.`}
        />
      ) : (
        <>
          <Text style={styles.sectionTitle}>Trait scores</Text>
          <View style={styles.card}>
            {SCORED_TRAIT_KEYS.map((key) => (
              <TraitScale key={key} label={TRAIT_LABELS[key]} score={breed.traits.scores[key]} />
            ))}
            <ExerciseScale minutes={breed.traits.exerciseMinutes} />
          </View>
        </>
      )}

      <Text style={styles.sectionTitle}>Temperament</Text>
      {breed.traits.temperament.length === 0 ? (
        <View style={styles.card}>
          <Text style={[styles.cardText, styles.factValueUnknown]}>{UNKNOWN_PLACEHOLDER}</Text>
        </View>
      ) : (
        <View style={styles.tagRow}>
          {breed.traits.temperament.map((tag) => (
            <View key={tag} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

interface TabButtonProps {
  tab: TabName;
  isActive: boolean;
  onPress: (tab: TabName) => void;
}

function TabButton({ tab, isActive, onPress }: TabButtonProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const handlePress = useCallback(() => {
    onPress(tab);
  }, [onPress, tab]);

  return (
    <Pressable
      onPress={handlePress}
      style={[styles.tab, isActive && styles.tabActive]}
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={tab}
    >
      <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{tab}</Text>
    </Pressable>
  );
}

export function BreedDetailsScreen({ route }: BreedDetailsScreenProps) {
  const { breedId, breedName } = route.params;
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<TabName>('Overview');
  const isOnline = useAppSelector(selectIsOnline);
  const { breed, isLoading, isRefreshing, refreshError, refresh } = useBreedDetails(breedId);

  // Show cached content first, then refresh it from the network. `refresh`
  // changes identity with connectivity, so this also re-runs on the
  // offline -> online edge while the screen is open.
  useEffect(() => {
    if (isOnline) refresh();
  }, [isOnline, refresh]);

  const handleTabPress = useCallback((tab: TabName) => {
    setActiveTab(tab);
  }, []);

  // Not cached but a fetch is underway: still loading, not "unavailable".
  if (isLoading || (breed === null && isRefreshing)) {
    return (
      <View style={styles.container}>
        <EmptyState title="Loading…" message={`Fetching details for ${breedName}.`} />
      </View>
    );
  }

  if (breed === null) {
    return (
      <View style={styles.container}>
        <EmptyState
          title="Breed unavailable"
          message={
            isOnline
              ? `${breedName} is not in the local cache, and it could not be fetched.`
              : `${breedName} is not in the local cache. Reconnect to load it.`
          }
          actionLabel={isOnline ? 'Retry' : undefined}
          onAction={isOnline ? refresh : undefined}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {refreshError === null ? null : (
        <View style={styles.noticeBar} accessibilityRole="alert">
          <Text style={styles.noticeText}>{refreshError}</Text>
          {isOnline ? (
            <Pressable
              onPress={refresh}
              style={styles.noticeAction}
              accessibilityRole="button"
              accessibilityLabel="Retry refreshing this breed"
              hitSlop={8}
            >
              <Text style={styles.noticeActionText}>Retry</Text>
            </Pressable>
          ) : null}
        </View>
      )}

      <View style={styles.tabBar} accessibilityRole="tablist">
        {TABS.map((tab) => (
          <TabButton key={tab} tab={tab} isActive={activeTab === tab} onPress={handleTabPress} />
        ))}
      </View>

      {/* The gallery is the most failure-prone area (remote images, decoding),
          so it gets its own boundary and cannot take the screen down. */}
      {activeTab === 'Gallery' ? (
        <ErrorBoundary featureName="the photo gallery">
          <BreedGallery images={breed.images} breedName={breed.name} />
        </ErrorBoundary>
      ) : (
        <ScrollView
          style={styles.scroll}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={refresh}
              tintColor={theme.colors.accent}
              colors={[theme.colors.accent]}
              progressBackgroundColor={theme.colors.surface}
            />
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + theme.spacing.xxl }}
        >
          {activeTab === 'Overview' ? <OverviewTab breed={breed} /> : <TraitsTab breed={breed} />}
        </ScrollView>
      )}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    scroll: {
      flex: 1,
    },
    noticeBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.sm,
      backgroundColor: theme.colors.warningSurface,
    },
    noticeText: {
      flex: 1,
      fontSize: theme.typography.caption.fontSize,
      color: theme.colors.warningText,
    },
    noticeAction: {
      minHeight: MIN_TOUCH_TARGET,
      justifyContent: 'center',
      paddingHorizontal: theme.spacing.sm,
    },
    noticeActionText: {
      fontSize: theme.typography.caption.fontSize,
      fontWeight: '700',
      color: theme.colors.warningText,
      textDecorationLine: 'underline',
    },
    tabBar: {
      flexDirection: 'row',
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.sm,
      gap: theme.spacing.sm,
      backgroundColor: theme.colors.background,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    tab: {
      flex: 1,
      minHeight: MIN_TOUCH_TARGET,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    tabActive: {
      backgroundColor: theme.colors.accentMuted,
      borderColor: theme.colors.accent,
    },
    tabText: {
      fontSize: theme.typography.label.fontSize,
      fontWeight: '600',
      color: theme.colors.textSecondary,
    },
    tabTextActive: {
      color: theme.colors.accentText,
      fontWeight: '700',
    },
    tabContent: {
      padding: theme.spacing.lg,
    },
    description: {
      fontSize: theme.typography.body.fontSize,
      lineHeight: 22,
      color: theme.colors.textPrimary,
      marginBottom: theme.spacing.lg,
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
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.md,
      padding: theme.spacing.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
    },
    cardText: {
      fontSize: theme.typography.body.fontSize,
      color: theme.colors.textPrimary,
      lineHeight: 21,
    },
    factRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      paddingVertical: theme.spacing.sm,
      gap: theme.spacing.lg,
    },
    factLabel: {
      fontSize: theme.typography.body.fontSize,
      color: theme.colors.textSecondary,
      flexShrink: 0,
    },
    factValue: {
      fontSize: theme.typography.body.fontSize,
      color: theme.colors.textPrimary,
      fontWeight: '600',
      flexShrink: 1,
      textAlign: 'right',
    },
    factValueUnknown: {
      color: theme.colors.textMuted,
      fontWeight: '400',
    },
    tagRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.sm,
    },
    tag: {
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.accentMuted,
    },
    tagText: {
      fontSize: theme.typography.caption.fontSize,
      color: theme.colors.accentText,
      fontWeight: '600',
    },
  });
}
