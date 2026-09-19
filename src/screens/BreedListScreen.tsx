/**
 * Breed Explorer — the sectioned, filterable list of all breeds.
 *
 * Performance notes (see docs/PERFORMANCE.md):
 *  - `SectionList` virtualises; rows are fixed-height so `getItemLayout`
 *    lets it skip measurement and jump directly to any offset.
 *  - Filtering/grouping happen in memoised selectors, not here, so a scroll
 *    frame never re-filters 283 records.
 *  - `renderItem` and `onPress` are stable across renders, keeping the
 *    memoised rows genuinely memoised.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { SectionListData, SectionListRenderItemInfo } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BreedListItem } from '@/components/BreedListItem';
import { EmptyState, ListSkeleton } from '@/components/States';
import { FilterSheet } from '@/components/FilterSheet';
import { SearchBar } from '@/components/SearchBar';
import { SyncBanner } from '@/components/SyncBanner';
import { useDebouncedSearch } from '@/hooks/useDebouncedSearch';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  selectActiveFilterCount,
  selectAllGroups,
  selectBreedTotal,
  selectFilteredCount,
  selectFilters,
  selectGroupedBreeds,
  selectHasActiveFilters,
  selectIsHydrating,
  selectIsOnline,
  selectSyncState,
} from '@/store/selectors';
import type { BreedSection } from '@/store/selectors';
import {
  allFiltersCleared,
  coatCategoryToggled,
  groupToggled,
  hypoallergenicToggled,
  sizeBandToggled,
  traitKeyToggled,
  traitMinScoreChanged,
} from '@/store/slices/filtersSlice';
import { BREED_ROW_HEIGHT, SECTION_HEADER_HEIGHT } from '@/theme';
import type { Theme } from '@/theme';
import { useTheme } from '@/theme/ThemeProvider';
import type { Breed, CoatCategory, FilterableTraitKey, SizeBand } from '@/types/domain';
import type { BreedListScreenProps } from '@/navigation/types';
import { formatGroupName } from '@/utils/format';

export function BreedListScreen({ navigation }: BreedListScreenProps): React.ReactElement {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();

  const [filtersVisible, setFiltersVisible] = useState(false);

  const sections = useAppSelector(selectGroupedBreeds);
  const groups = useAppSelector(selectAllGroups);
  const filters = useAppSelector(selectFilters);
  const filteredCount = useAppSelector(selectFilteredCount);
  const totalCount = useAppSelector(selectBreedTotal);
  const activeFilterCount = useAppSelector(selectActiveFilterCount);
  const hasActiveFilters = useAppSelector(selectHasActiveFilters);
  const isHydrating = useAppSelector(selectIsHydrating);
  const isOnline = useAppSelector(selectIsOnline);
  const sync = useAppSelector(selectSyncState);

  const { refresh, retry } = useOfflineSync();
  const search = useDebouncedSearch();

  // --- Stable callbacks ---------------------------------------------------

  const handleBreedPress = useCallback(
    (breedId: string, breedName: string) => {
      navigation.navigate('BreedDetails', { breedId, breedName });
    },
    [navigation],
  );

  const handleOpenFilters = useCallback(() => {
    setFiltersVisible(true);
  }, []);
  const handleCloseFilters = useCallback(() => {
    setFiltersVisible(false);
  }, []);

  const handleToggleGroup = useCallback(
    (groupId: string) => {
      dispatch(groupToggled(groupId));
    },
    [dispatch],
  );
  const handleToggleSize = useCallback(
    (size: SizeBand) => {
      dispatch(sizeBandToggled(size));
    },
    [dispatch],
  );
  const handleToggleCoat = useCallback(
    (coat: CoatCategory) => {
      dispatch(coatCategoryToggled(coat));
    },
    [dispatch],
  );
  const handleToggleHypoallergenic = useCallback(
    (value: boolean) => {
      dispatch(hypoallergenicToggled(value));
    },
    [dispatch],
  );
  const handleToggleTrait = useCallback(
    (trait: FilterableTraitKey) => {
      dispatch(traitKeyToggled(trait));
    },
    [dispatch],
  );
  const handleChangeTraitScore = useCallback(
    (score: number) => {
      dispatch(traitMinScoreChanged(score));
    },
    [dispatch],
  );
  const handleClearAll = useCallback(() => {
    dispatch(allFiltersCleared());
  }, [dispatch]);

  // --- List rendering -----------------------------------------------------

  const renderItem = useCallback(
    ({ item }: SectionListRenderItemInfo<Breed, BreedSection>): React.ReactElement => (
      <BreedListItem breed={item} onPress={handleBreedPress} />
    ),
    [handleBreedPress],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: SectionListData<Breed, BreedSection> }): React.ReactElement => (
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{formatGroupName(section.title)}</Text>
        <Text style={styles.sectionCount}>{String(section.data.length)}</Text>
      </View>
    ),
    [styles],
  );

  const keyExtractor = useCallback((item: Breed): string => item.id, []);

  /**
   * Rows and headers are fixed-height, so offsets are computable without
   * measuring — this is what makes scrolling to an arbitrary index cheap.
   * SectionList interleaves header/footer entries, hence the +2 per section.
   */
  const getItemLayout = useCallback(
    (
      data: readonly SectionListData<Breed, BreedSection>[] | null,
      index: number,
    ): { length: number; offset: number; index: number } => {
      if (data === null) {
        return { length: BREED_ROW_HEIGHT, offset: BREED_ROW_HEIGHT * index, index };
      }

      let offset = 0;
      let remaining = index;

      for (const section of data) {
        // Section header
        if (remaining === 0) return { length: SECTION_HEADER_HEIGHT, offset, index };
        offset += SECTION_HEADER_HEIGHT;
        remaining -= 1;

        if (remaining < section.data.length) {
          return {
            length: BREED_ROW_HEIGHT,
            offset: offset + remaining * BREED_ROW_HEIGHT,
            index,
          };
        }
        offset += section.data.length * BREED_ROW_HEIGHT;
        remaining -= section.data.length;

        // Section footer (zero-height here, but it still consumes an index)
        if (remaining === 0) return { length: 0, offset, index };
        remaining -= 1;
      }

      return { length: BREED_ROW_HEIGHT, offset, index };
    },
    [],
  );

  const isRefreshing = sync.status === 'syncing' && sync.isManualRefresh;

  const refreshControl = useMemo(
    () => (
      <RefreshControl
        refreshing={isRefreshing}
        onRefresh={refresh}
        tintColor={theme.colors.accent}
        colors={[theme.colors.accent]}
        progressBackgroundColor={theme.colors.surface}
      />
    ),
    [isRefreshing, refresh, theme.colors.accent, theme.colors.surface],
  );

  const listHeader = useMemo(
    () => (
      <SearchBar
        value={search.value}
        onChangeText={search.onChangeText}
        onClear={search.onClear}
        onOpenFilters={handleOpenFilters}
        activeFilterCount={activeFilterCount}
        resultCount={filteredCount}
      />
    ),
    [
      search.value,
      search.onChangeText,
      search.onClear,
      handleOpenFilters,
      activeFilterCount,
      filteredCount,
    ],
  );

  const emptyComponent = useMemo(() => {
    // Distinguish "still loading" from "genuinely nothing matches" — they
    // need different messages and different actions.
    if (isHydrating && totalCount === 0) return <ListSkeleton />;

    if (totalCount === 0) {
      return (
        <EmptyState
          title={isOnline ? 'No breeds yet' : 'No cached breeds'}
          message={
            isOnline
              ? 'Pull down to fetch the breed catalogue from the Dog API.'
              : 'Connect to the internet once to download the catalogue. After that the app works offline.'
          }
          actionLabel={isOnline ? 'Retry' : undefined}
          onAction={isOnline ? retry : undefined}
        />
      );
    }

    const hasSearch = filters.searchQuery.trim().length > 0;
    return (
      <EmptyState
        title="No matching breeds"
        message={
          hasSearch
            ? `No breeds match "${filters.searchQuery.trim()}"${
                hasActiveFilters ? ' with the current filters' : ''
              }.`
            : 'No breeds match the current filters.'
        }
        actionLabel={hasActiveFilters ? 'Clear filters' : undefined}
        onAction={hasActiveFilters ? handleClearAll : undefined}
      />
    );
  }, [
    isHydrating,
    totalCount,
    isOnline,
    retry,
    filters.searchQuery,
    hasActiveFilters,
    handleClearAll,
  ]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <SyncBanner
        status={sync.status}
        isOnline={isOnline}
        lastSyncedAt={sync.lastSyncedAt}
        errorMessage={sync.lastError}
        cachedBreedCount={totalCount}
        onRetry={retry}
      />

      <SectionList
        sections={sections as readonly SectionListData<Breed, BreedSection>[]}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        getItemLayout={getItemLayout}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={emptyComponent}
        refreshControl={refreshControl}
        stickySectionHeadersEnabled
        // Virtualisation tuning: a small window keeps memory flat, and
        // batching 12 rows per frame avoids long render bursts on scroll.
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        updateCellsBatchingPeriod={50}
        windowSize={9}
        removeClippedSubviews
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + theme.spacing.xl },
        ]}
        style={styles.list}
        testID="breed-list"
      />

      <FilterSheet
        visible={filtersVisible}
        filters={filters}
        groups={groups}
        resultCount={filteredCount}
        onClose={handleCloseFilters}
        onToggleGroup={handleToggleGroup}
        onToggleSize={handleToggleSize}
        onToggleCoat={handleToggleCoat}
        onToggleHypoallergenic={handleToggleHypoallergenic}
        onToggleTrait={handleToggleTrait}
        onChangeTraitScore={handleChangeTraitScore}
        onClearAll={handleClearAll}
      />
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    list: {
      flex: 1,
    },
    listContent: {
      flexGrow: 1,
    },
    sectionHeader: {
      height: SECTION_HEADER_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.spacing.lg,
      backgroundColor: theme.colors.background,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    sectionTitle: {
      fontSize: theme.typography.label.fontSize,
      fontWeight: '700',
      color: theme.colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    sectionCount: {
      fontSize: theme.typography.caption.fontSize,
      color: theme.colors.textMuted,
      fontVariant: ['tabular-nums'],
    },
  });
}
