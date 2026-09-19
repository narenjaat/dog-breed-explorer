/** Global test setup. */

// Silence Reanimated's dev-only warnings in test output.
process.env['EXPO_OS'] = 'ios';

// expo-sqlite and expo-network are native; suites that need them mock them
// explicitly (see src/__tests__/database.test.ts and syncService.test.ts).
jest.mock('expo-network', () => ({
  getNetworkStateAsync: jest.fn(async () => ({
    isConnected: true,
    isInternetReachable: true,
  })),
  addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
}));
