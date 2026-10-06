/**
 * EXPO_PUBLIC_* inlining used to come from babel-preset-expo. Here .env is
 * loaded explicitly and only the allow-listed keys are inlined into the
 * bundle, so nothing else from the build environment leaks into JS.
 *
 * Metro caches transformed files: after editing .env, restart with
 * `npm start -- --reset-cache`.
 */
require('dotenv').config({ quiet: true });

module.exports = (api) => {
  // Under Jest, process.env is read at runtime so suites can override it
  // (see jest.setup.ts); inlining at transform time would freeze it.
  const isTest = api.env('test');

  return {
    presets: ['module:@react-native/babel-preset'],
    plugins: [
      ['module-resolver', { root: ['./'], alias: { '@': './src' } }],
      !isTest && [
        'transform-inline-environment-variables',
        {
          include: [
            'DOG_API_BASE_URL',
            'DOG_API_TIMEOUT_MS',
            'DOG_API_MAX_RETRIES',
            'DOG_API_PAGE_SIZE',
          ],
        },
      ],
    ].filter(Boolean),
  };
};
