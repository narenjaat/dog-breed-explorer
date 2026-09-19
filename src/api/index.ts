/** Public surface of the API layer. Screens import from here, never deeper. */
export { fetchAllBreeds, fetchBreedById, fetchBreedPage, mergeBreedPages } from '@/api/breedsApi';
export type { AllBreedsResult, BreedPageResult, PageFailure } from '@/api/breedsApi';
export { fetchGroups } from '@/api/groupsApi';
export type { GroupsResult } from '@/api/groupsApi';
export { ApiError, describeApiError, isApiError } from '@/api/errors';
export type { ApiErrorKind } from '@/api/errors';
export { API_CONFIG } from '@/api/config';
