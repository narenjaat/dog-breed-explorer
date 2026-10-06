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
import { RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import type { SectionListData, SectionListRenderItemInfo } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BreedListItem } from '@/components/BreedListItem';
import { EmptyState, ListSkeleton } from '@/components/States';
import { FilterSheet } from '@/components/FilterSheet';
import { SearchBar } from '@/components/SearchBar';
import { SyncBanner } from '@/components/SyncBanner';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { useAppDispatch, useAppSelector, allFiltersCleared } from '@/store';
import {
  selectBreedTotal,
  selectSearchQuery,
  selectGroupedBreeds,
  selectHasActiveFilters,
  selectIsHydrating,
  selectIsOnline,
  selectSyncState,
} from '@/store/selectors';
import type { BreedSection } from '@/store/selectors';
import { BREED_ROW_HEIGHT, SECTION_HEADER_HEIGHT, useTheme } from '@/theme';
import type { Theme } from '@/theme';
import type { Breed } from '@/types';
import type { BreedListScreenProps } from '@/navigation';
import { formatGroupName } from '@/format';

export function BreedListScreen({ navigation }: BreedListScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();

  const [filtersVisible, setFiltersVisible] = useState(false);

  const sections = useAppSelector(selectGroupedBreeds);
  const searchQuery = useAppSelector(selectSearchQuery);
  const totalCount = useAppSelector(selectBreedTotal);
  const hasActiveFilters = useAppSelector(selectHasActiveFilters);
  const isHydrating = useAppSelector(selectIsHydrating);
  const isOnline = useAppSelector(selectIsOnline);
  const sync = useAppSelector(selectSyncState);

  const { refresh } = useOfflineSync();

  // useCallback keeps these functions the same between renders, so the
  // memoised rows do not re-render for no reason.
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

  const handleClearAll = useCallback(() => {
    dispatch(allFiltersCleared());
  }, [dispatch]);

  const renderItem = useCallback(
    ({ item }: SectionListRenderItemInfo<Breed, BreedSection>) => (
      <BreedListItem breed={item} onPress={handleBreedPress} />
    ),
    [handleBreedPress],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: SectionListData<Breed, BreedSection> }) => (
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{formatGroupName(section.title)}</Text>
        <Text style={styles.sectionCount}>{section.data.length}</Text>
      </View>
    ),
    [styles],
  );

  const keyExtractor = useCallback((item: Breed) => item.id, []);

  /**
   * Every row and header has a fixed height, so we can calculate where item
   * N sits instead of letting the list measure it. That keeps scrolling smooth.
   *
   * SectionList counts items like this (each section adds a header AND an
   * empty footer):  [header, row, row, ..., footer, header, row, ...]
   */
  const getItemLayout = useCallback(
    (data: SectionListData<Breed, BreedSection>[] | null, index: number) => {
      let offset = 0; // pixels from the top of the list
      let itemsLeft = index; // how far into the list item N is

      for (const section of data ?? []) {
        if (itemsLeft === 0) return { length: SECTION_HEADER_HEIGHT, offset, index };
        offset += SECTION_HEADER_HEIGHT;
        itemsLeft -= 1;

        const rowCount = section.data.length;
        if (itemsLeft < rowCount) {
          return { length: BREED_ROW_HEIGHT, offset: offset + itemsLeft * BREED_ROW_HEIGHT, index };
        }
        offset += rowCount * BREED_ROW_HEIGHT;
        itemsLeft -= rowCount;

        if (itemsLeft === 0) return { length: 0, offset, index }; // footer
        itemsLeft -= 1;
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
    () => <SearchBar onOpenFilters={handleOpenFilters} />,
    [handleOpenFilters],
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
          onAction={isOnline ? refresh : undefined}
        />
      );
    }

    const hasSearch = searchQuery.trim().length > 0;
    return (
      <EmptyState
        title="No matching breeds"
        message={
          hasSearch
            ? `No breeds match "${searchQuery.trim()}"${
                hasActiveFilters ? ' with the current filters' : ''
              }.`
            : 'No breeds match the current filters.'
        }
        actionLabel={hasActiveFilters ? 'Clear filters' : undefined}
        onAction={hasActiveFilters ? handleClearAll : undefined}
      />
    );
  }, [isHydrating, totalCount, isOnline, refresh, searchQuery, hasActiveFilters, handleClearAll]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <SyncBanner
        status={sync.status}
        isOnline={isOnline}
        lastSyncedAt={sync.lastSyncedAt}
        errorMessage={sync.lastError}
        cachedBreedCount={totalCount}
        onRetry={refresh}
      />

      <SectionList
        sections={sections as SectionListData<Breed, BreedSection>[]}
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
        // `removeClippedSubviews` is deliberately NOT set. On the New
        // Architecture it detaches native views behind Fabric's back and
        // crashes the mount ("addViewAt: failed to insert view ... index=N
        // count=1") once a section re-renders. Fabric already recycles views,
        // so it buys nothing here.
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + theme.spacing.xl },
        ]}
        style={styles.list}
        testID="breed-list"
      />

      <FilterSheet visible={filtersVisible} onClose={handleCloseFilters} />
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
