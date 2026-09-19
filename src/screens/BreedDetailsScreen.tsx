/**
 * Breed detail: Overview | Traits | Gallery.
 *
 * Every field here is nullable in the source data, so the screen renders
 * through the formatters in `utils/format`, which substitute an em-dash
 * rather than letting "null"/"undefined" reach the UI.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BreedGallery } from '@/components/BreedGallery';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { EmptyState } from '@/components/States';
import { ExerciseScale, TraitScale } from '@/components/TraitScale';
import { useBreedDetails } from '@/hooks/useBreedDetails';
import { useAppSelector } from '@/store';
import { selectGroupsById } from '@/store/selectors';
import { MIN_TOUCH_TARGET } from '@/theme';
import type { Theme } from '@/theme';
import { useTheme } from '@/theme/ThemeProvider';
import type { Breed, ScoredTraitKey } from '@/types/domain';
import { SCORED_TRAIT_KEYS } from '@/types/domain';
import type { BreedDetailsScreenProps } from '@/navigation/types';
import {
  UNKNOWN_PLACEHOLDER,
  formatGroupName,
  formatHypoallergenic,
  formatLifespan,
  formatList,
  formatOrigin,
  formatRange,
} from '@/utils/format';

const TABS = ['Overview', 'Traits', 'Gallery'] as const;
type TabName = (typeof TABS)[number];

/** Human labels for the trait rows, in the order the brief lists them. */
const TRAIT_LABELS: Readonly<Record<ScoredTraitKey, string>> = {
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
  readonly label: string;
  readonly value: string;
}

function FactRow({ label, value }: FactRowProps): React.ReactElement {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const isUnknown = value === UNKNOWN_PLACEHOLDER;

  return (
    <View style={styles.factRow} accessible accessibilityLabel={`${label}: ${isUnknown ? 'not recorded' : value}`}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={[styles.factValue, isUnknown && styles.factValueUnknown]}>{value}</Text>
    </View>
  );
}

function OverviewTab({ breed }: { readonly breed: Breed }): React.ReactElement {
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

function TraitsTab({ breed }: { readonly breed: Breed }): React.ReactElement {
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
  readonly tab: TabName;
  readonly isActive: boolean;
  readonly onPress: (tab: TabName) => void;
}

function TabButton({ tab, isActive, onPress }: TabButtonProps): React.ReactElement {
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

export function BreedDetailsScreen({ route }: BreedDetailsScreenProps): React.ReactElement {
  const { breedId, breedName } = route.params;
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<TabName>('Overview');
  const { breed, isLoading, refreshError } = useBreedDetails(breedId);

  const handleTabPress = useCallback((tab: TabName) => {
    setActiveTab(tab);
  }, []);

  if (isLoading) {
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
          message={`${breedName} is not in the local cache, and it could not be fetched. Reconnect and refresh the list.`}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {refreshError === null ? null : (
        <View style={styles.noticeBar} accessibilityRole="alert">
          <Text style={styles.noticeText}>{refreshError}</Text>
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
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.sm,
      backgroundColor: theme.colors.warningSurface,
    },
    noticeText: {
      fontSize: theme.typography.caption.fontSize,
      color: theme.colors.warningText,
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
