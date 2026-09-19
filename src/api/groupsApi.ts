/**
 * Groups endpoint. Groups are used for filter labels and list section headers.
 *
 * Only 9 records and a single page, so this needs none of the pagination
 * machinery the breeds endpoint requires.
 */

import { requestJson } from '@/api/client';
import { parseCollection, parseGroup } from '@/api/parsers';
import type { BreedGroup } from '@/types/domain';
import type { FetchOptions } from '@/api/breedsApi';

export interface GroupsResult {
  readonly groups: readonly BreedGroup[];
  readonly skipped: number;
}

export async function fetchGroups(options: FetchOptions = {}): Promise<GroupsResult> {
  const payload = await requestJson('/groups', { signal: options.signal });
  const { items, skipped } = parseCollection(payload, parseGroup);
  return { groups: items, skipped };
}
