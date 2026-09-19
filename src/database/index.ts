/** Public surface of the database layer. UI code imports from here only. */
export { getDatabase, closeDatabase, DATABASE_NAME } from '@/database/database';
export { LATEST_SCHEMA_VERSION, MIGRATIONS, runMigrations } from '@/database/migrations';
export {
  buildBreedWhereClause,
  clearBreeds,
  countBreeds,
  escapeLikePattern,
  getBreedById,
  queryBreeds,
  upsertBreeds,
} from '@/database/repositories/breedRepository';
export type { BreedQuery } from '@/database/repositories/breedRepository';
export { countGroups, getAllGroups, upsertGroups } from '@/database/repositories/groupRepository';
export { getSyncState, saveSyncState } from '@/database/repositories/syncRepository';
