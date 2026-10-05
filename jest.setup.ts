/** Global test setup. */

// Retry/backoff is covered explicitly in client.test.ts. Everywhere else it
// would only add real wall-clock sleeping, so the suite runs with retries off.
process.env['DOG_API_MAX_RETRIES'] = '0';

// NetInfo ships its own Jest mock (reports connected and reachable).
jest.mock('@react-native-community/netinfo', () =>
  require('@react-native-community/netinfo/jest/netinfo-mock'),
);

// op-sqlite is a native module with no Node implementation. Suites that
// exercise SQL-building and row-mapping (pure functions) only need the module
// to resolve; upsert.test.ts runs the real SQL through sql.js instead.
jest.mock('@op-engineering/op-sqlite', () => ({
  open: jest.fn(() => ({
    execute: jest.fn(async () => ({ rowsAffected: 0, rows: [] })),
    prepareStatement: jest.fn(() => ({
      bind: jest.fn(async () => undefined),
      execute: jest.fn(async () => ({ rowsAffected: 0, rows: [] })),
      close: jest.fn(),
    })),
    transaction: jest.fn(async (callback: () => Promise<void>) => {
      await callback();
    }),
    close: jest.fn(),
  })),
}));

// FastImage's native view and cache module are unavailable under Jest.
jest.mock('@d11/react-native-fast-image', () => {
  const { Image } = jest.requireActual<typeof import('react-native')>('react-native');
  const FastImage = Object.assign(
    (props: Record<string, unknown>) => require('react').createElement(Image, props),
    {
      resizeMode: { contain: 'contain', cover: 'cover', stretch: 'stretch', center: 'center' },
      priority: { low: 'low', normal: 'normal', high: 'high' },
      cacheControl: { immutable: 'immutable', web: 'web', cacheOnly: 'cacheOnly' },
      transition: { fade: 'fade', none: 'none' },
      preload: jest.fn(),
      clearMemoryCache: jest.fn(async () => undefined),
      clearDiskCache: jest.fn(async () => undefined),
    },
  );
  return { __esModule: true, default: FastImage };
});
