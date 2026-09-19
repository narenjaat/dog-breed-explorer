/**
 * Visual trait scale — the brief explicitly rules out a raw table.
 *
 * A 1-5 score renders as five segments; `exercise_minutes` is a duration, not
 * a score, so it renders as a proportional bar with its real units instead of
 * being crammed onto a 5-point scale it does not belong on.
 */

import React, { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { TRAIT_SCORE_MAX } from '@/types/domain';
import { UNKNOWN_PLACEHOLDER, formatExerciseMinutes } from '@/utils/format';

export interface TraitScaleProps {
  readonly label: string;
  /** 1-5 score, or null when the API did not rate this trait. */
  readonly score: number | null;
}

function TraitScaleComponent({ label, score }: TraitScaleProps): React.ReactElement {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const hasScore = score !== null;
  const rounded = hasScore ? Math.max(0, Math.min(TRAIT_SCORE_MAX, Math.round(score))) : 0;

  return (
    <View
      style={styles.container}
      accessible
      accessibilityRole="progressbar"
      // Announces "Energy, 3 of 5" rather than reading five anonymous bars.
      accessibilityLabel={
        hasScore
          ? `${label}, ${String(rounded)} out of ${String(TRAIT_SCORE_MAX)}`
          : `${label}, not rated`
      }
      accessibilityValue={hasScore ? { min: 0, max: TRAIT_SCORE_MAX, now: rounded } : undefined}
    >
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.value, !hasScore && styles.valueMuted]}>
          {hasScore ? `${String(rounded)}/${String(TRAIT_SCORE_MAX)}` : UNKNOWN_PLACEHOLDER}
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
  readonly minutes: number | null;
}

/** Upper bound of the observed `exercise_minutes` range, used for the bar. */
const EXERCISE_MAX_MINUTES = 120;

function ExerciseScaleComponent({ minutes }: ExerciseScaleProps): React.ReactElement {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

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

function createStyles(theme: ReturnType<typeof useTheme>) {
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
