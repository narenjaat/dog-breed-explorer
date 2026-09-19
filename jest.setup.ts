/** Global test setup. */

// Silence Reanimated's dev-only warnings in test output.
process.env['EXPO_OS'] = 'ios';

// Retry/backoff is covered explicitly in client.test.ts. Everywhere else it
// would only add real wall-clock sleeping, so the suite runs with retries off.
process.env['EXPO_PUBLIC_API_MAX_RETRIES'] = '0';

// expo-sqlite and expo-network are native; suites that need them mock them
// explicitly (see src/__tests__/database.test.ts and syncService.test.ts).
jest.mock('expo-network', () => ({
  getNetworkStateAsync: jest.fn(async () => ({
    isConnected: true,
    isInternetReachable: true,
  })),
  addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
}));

// expo-sqlite is a native module with no Node implementation. Suites that
// exercise SQL-building and row-mapping (pure functions) only need the module
// to resolve; suites that test write behaviour install their own fake driver.
jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(async () => ({
    execAsync: jest.fn(async () => undefined),
    runAsync: jest.fn(async () => ({ changes: 0, lastInsertRowId: 0 })),
    getAllAsync: jest.fn(async () => []),
    getFirstAsync: jest.fn(async () => null),
    prepareAsync: jest.fn(async () => ({
      executeAsync: jest.fn(async () => ({ changes: 0, lastInsertRowId: 0 })),
      finalizeAsync: jest.fn(async () => undefined),
    })),
    withTransactionAsync: jest.fn(async (callback: () => Promise<void>) => {
      await callback();
    }),
    closeAsync: jest.fn(async () => undefined),
  })),
}));
