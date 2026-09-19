/**
 * Group persistence. Only 9 rows, but they are what turns a breed's opaque
 * `group_id` into a section header and a filter label.
 */

import { getDatabase } from '@/database/database';
import type { BreedGroup } from '@/types/domain';

const UPSERT_GROUP_SQL = `
  INSERT INTO groups (id, name, updated_at)
  VALUES (?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    updated_at = excluded.updated_at
`;

export async function upsertGroups(groups: readonly BreedGroup[], syncedAt: number): Promise<void> {
  if (groups.length === 0) return;
  const db = await getDatabase();

  await db.withTransactionAsync(async () => {
    const statement = await db.prepareAsync(UPSERT_GROUP_SQL);
    try {
      for (const group of groups) {
        await statement.executeAsync([group.id, group.name, syncedAt]);
      }
    } finally {
      await statement.finalizeAsync();
    }
  });
}

export async function getAllGroups(): Promise<readonly BreedGroup[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ id: string; name: string }>(
    'SELECT id, name FROM groups ORDER BY name COLLATE NOCASE ASC',
  );
  return rows.map((row) => ({ id: row.id, name: row.name }));
}
