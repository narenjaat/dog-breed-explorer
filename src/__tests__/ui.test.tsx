/**
 * UI behaviour tests for the pieces most likely to mislead a user:
 * the sync banner's message selection, the trait scale's handling of
 * unrated traits, and the value formatters that stand between null data
 * and the screen.
 */

import React from 'react';
import { render, screen } from '@testing-library/react-native';

import { ExerciseScale, TraitScale } from '@/components/TraitScale';
import { resolveBannerContent } from '@/components/SyncBanner';
import { ThemeProvider } from '@/theme/ThemeProvider';
import {
  UNKNOWN_PLACEHOLDER,
  formatExerciseMinutes,
  formatGroupName,
  formatHypoallergenic,
  formatLifespan,
  formatList,
  formatOrigin,
  formatRange,
  formatRelativeTime,
  humanizeKey,
} from '@/utils/format';
import { initialsFor } from '@/utils/text';

/**
 * RNTL v14 renders asynchronously (React 19 concurrent mode), so `render`
 * returns a promise that must be awaited before querying `screen`.
 */
async function renderWithTheme(element: React.ReactElement): Promise<void> {
  await render(<ThemeProvider forcedScheme="light">{element}</ThemeProvider>);
}

describe('TraitScale', () => {
  it('shows the score out of five', async () => {
    await renderWithTheme(<TraitScale label="Energy" score={4} />);
    expect(screen.getByText('Energy')).toBeTruthy();
    expect(screen.getByText('4/5')).toBeTruthy();
  });

  it('shows a placeholder for an unrated trait instead of 0/5', async () => {
    await renderWithTheme(<TraitScale label="Energy" score={null} />);
    // "0/5" would claim the breed scored lowest, which is not what null means.
    expect(screen.queryByText('0/5')).toBeNull();
    expect(screen.getByText(UNKNOWN_PLACEHOLDER)).toBeTruthy();
  });

  it('announces the score to screen readers', async () => {
    await renderWithTheme(<TraitScale label="Energy" score={3} />);
    expect(screen.getByLabelText('Energy, 3 out of 5')).toBeTruthy();
  });

  it('announces an unrated trait as not rated', async () => {
    await renderWithTheme(<TraitScale label="Barking" score={null} />);
    expect(screen.getByLabelText('Barking, not rated')).toBeTruthy();
  });

  it('clamps an out-of-range score rather than rendering a broken bar', async () => {
    await renderWithTheme(<TraitScale label="Energy" score={9} />);
    expect(screen.getByText('5/5')).toBeTruthy();
  });
});

describe('ExerciseScale', () => {
  it('renders minutes in their own units, not on a 1-5 scale', async () => {
    await renderWithTheme(<ExerciseScale minutes={45} />);
    expect(screen.getByText('45 min/day')).toBeTruthy();
  });

  it('switches to hours for longer durations', async () => {
    await renderWithTheme(<ExerciseScale minutes={120} />);
    expect(screen.getByText('2 hr/day')).toBeTruthy();
  });

  it('shows a placeholder when the duration is unknown', async () => {
    await renderWithTheme(<ExerciseScale minutes={null} />);
    expect(screen.getByText(UNKNOWN_PLACEHOLDER)).toBeTruthy();
  });
});

describe('sync banner messages', () => {
  const base = {
    status: 'idle' as const,
    isOnline: true,
    lastSyncedAt: null,
    errorMessage: null,
    cachedBreedCount: 0,
  };

  it('shows nothing before the first sync when there is no cache', () => {
    expect(resolveBannerContent(base)).toBeNull();
  });

  it('reports syncing with a spinner', () => {
    const content = resolveBannerContent({ ...base, status: 'syncing', cachedBreedCount: 283 });
    expect(content?.message).toBe('Syncing breeds…');
    expect(content?.showSpinner).toBe(true);
  });

  it('says loading rather than syncing on a cold start', () => {
    const content = resolveBannerContent({ ...base, status: 'syncing' });
    expect(content?.message).toBe('Loading breeds…');
  });

  it('reports freshness after a successful sync', () => {
    const now = Date.now();
    const content = resolveBannerContent({
      ...base,
      status: 'success',
      lastSyncedAt: now - 2 * 60 * 60 * 1000,
      cachedBreedCount: 283,
      now,
    });
    expect(content?.message).toBe('Last synced 2 hours ago');
  });

  it('explains that cached data is in use when offline', () => {
    const now = Date.now();
    const content = resolveBannerContent({
      ...base,
      isOnline: false,
      status: 'success',
      lastSyncedAt: now - 30 * 60 * 1000,
      cachedBreedCount: 283,
      now,
    });
    expect(content?.message).toContain('Offline — showing cached breeds');
    expect(content?.message).toContain('30 minutes ago');
  });

  it('prompts to connect when offline with nothing cached', () => {
    const content = resolveBannerContent({ ...base, isOnline: false });
    expect(content?.message).toBe('Offline — connect to load breeds');
  });

  it('prefers the offline message over a stale network error', () => {
    // Being offline explains the failure better than the error it caused.
    const content = resolveBannerContent({
      ...base,
      isOnline: false,
      status: 'error',
      errorMessage: 'No connection to the Dog API.',
      cachedBreedCount: 283,
    });
    expect(content?.message).toContain('Offline');
    expect(content?.tone).toBe('muted');
  });

  it('offers a retry and keeps showing cached data after an error', () => {
    const now = Date.now();
    const content = resolveBannerContent({
      ...base,
      status: 'error',
      errorMessage: 'The Dog API returned HTTP 503.',
      lastSyncedAt: now - 3 * 60 * 60 * 1000,
      cachedBreedCount: 283,
      now,
    });

    expect(content?.message).toContain('503');
    expect(content?.message).toContain('3 hours ago');
    expect(content?.showRetry).toBe(true);
    expect(content?.tone).toBe('danger');
  });

  it('warns without alarming on a partial sync', () => {
    const content = resolveBannerContent({
      ...base,
      status: 'partial',
      errorMessage: 'Some data could not be refreshed (page 3). Showing cached data.',
      cachedBreedCount: 283,
    });
    expect(content?.tone).toBe('warning');
    expect(content?.message).toContain('page 3');
  });
});

describe('formatters', () => {
  it('formats a complete range', () => {
    expect(formatRange({ min: 12, max: 18 }, 'kg')).toBe('12–18 kg');
  });

  it('collapses a range whose bounds are equal', () => {
    expect(formatRange({ min: 5, max: 5 }, 'kg')).toBe('5 kg');
  });

  it('describes a half-open range honestly', () => {
    expect(formatRange({ min: 10, max: null }, 'kg')).toBe('from 10 kg');
    expect(formatRange({ min: null, max: 30 }, 'kg')).toBe('up to 30 kg');
  });

  it('never prints null or undefined for an unknown range', () => {
    const output = formatRange({ min: null, max: null }, 'kg');
    expect(output).toBe(UNKNOWN_PLACEHOLDER);
    expect(output).not.toContain('null');
    expect(output).not.toContain('undefined');
  });

  it('trims pointless decimals', () => {
    expect(formatRange({ min: 12, max: 18.5 }, 'kg')).toBe('12–18.5 kg');
  });

  it('formats a lifespan in years', () => {
    expect(formatLifespan({ min: 12, max: 15 })).toBe('12–15 years');
    expect(formatLifespan({ min: null, max: null })).toBe(UNKNOWN_PLACEHOLDER);
  });

  it('joins only the origin parts that are known', () => {
    expect(formatOrigin({ era: '17th century', region: 'Europe', country: 'Germany' })).toBe(
      'Germany · Europe · 17th century',
    );
    expect(formatOrigin({ era: null, region: null, country: 'Germany' })).toBe('Germany');
    expect(formatOrigin({ era: null, region: null, country: null })).toBe(UNKNOWN_PLACEHOLDER);
  });

  it('formats lists and empty lists', () => {
    expect(formatList(['AKC', 'FCI'])).toBe('AKC, FCI');
    expect(formatList([])).toBe(UNKNOWN_PLACEHOLDER);
  });

  it('distinguishes hypoallergenic false from unknown', () => {
    expect(formatHypoallergenic(true)).toBe('Yes');
    expect(formatHypoallergenic(false)).toBe('No');
    expect(formatHypoallergenic(null)).toBe(UNKNOWN_PLACEHOLDER);
  });

  it('formats exercise durations', () => {
    expect(formatExerciseMinutes(30)).toBe('30 min/day');
    expect(formatExerciseMinutes(90)).toBe('1.5 hr/day');
    expect(formatExerciseMinutes(null)).toBe(UNKNOWN_PLACEHOLDER);
  });

  it('humanises snake_case trait keys', () => {
    expect(humanizeKey('good_with_children')).toBe('Good with children');
  });

  it('strips the redundant Group and Class suffixes', () => {
    expect(formatGroupName('Herding Group')).toBe('Herding');
    expect(formatGroupName('Miscellaneous Class')).toBe('Miscellaneous');
    // This one is the real name, not a suffix, so it stays.
    expect(formatGroupName('Foundation Stock Service')).toBe('Foundation Stock Service');
  });
});

describe('formatRelativeTime', () => {
  const now = 1_700_000_000_000;

  it('says never when there is no timestamp', () => {
    expect(formatRelativeTime(null, now)).toBe('never');
  });

  it('uses "just now" for the last minute', () => {
    expect(formatRelativeTime(now - 30_000, now)).toBe('just now');
  });

  it('counts minutes, hours and days', () => {
    expect(formatRelativeTime(now - 5 * 60_000, now)).toBe('5 minutes ago');
    expect(formatRelativeTime(now - 2 * 3_600_000, now)).toBe('2 hours ago');
    expect(formatRelativeTime(now - 3 * 86_400_000, now)).toBe('3 days ago');
  });

  it('uses the singular for one unit', () => {
    expect(formatRelativeTime(now - 60_000, now)).toBe('1 minute ago');
    expect(formatRelativeTime(now - 3_600_000, now)).toBe('1 hour ago');
    expect(formatRelativeTime(now - 86_400_000, now)).toBe('1 day ago');
  });

  it('does not print a negative duration when the clock is skewed', () => {
    expect(formatRelativeTime(now + 60_000, now)).toBe('just now');
  });
});

describe('initialsFor', () => {
  it('takes the first letter of the first two words', () => {
    expect(initialsFor('Border Collie')).toBe('BC');
  });

  it('uses two letters of a single-word name', () => {
    expect(initialsFor('Beagle')).toBe('BE');
  });

  it('does not crash on an empty name', () => {
    expect(initialsFor('   ')).toBe('?');
  });
});
