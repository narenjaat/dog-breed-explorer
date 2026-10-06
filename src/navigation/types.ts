/**
 * Navigation param types.
 *
 * `RootStackParamList` is the single source of truth: screens derive their
 * props from it, so a param rename is a compile error at every call site
 * rather than a runtime undefined.
 */

import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStackParamList = {
  BreedList: undefined;
  BreedDetails: {
    readonly breedId: string;
    /** Passed so the header can render before the breed is read from cache. */
    readonly breedName: string;
  };
};

export type RootStackScreenProps<TRoute extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  TRoute
>;

export type BreedListScreenProps = RootStackScreenProps<'BreedList'>;
export type BreedDetailsScreenProps = RootStackScreenProps<'BreedDetails'>;

/**
 * Makes `useNavigation()` type-safe app-wide without per-call generics.
 */
declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
