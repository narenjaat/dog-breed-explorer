module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    // Formatting is Prettier's job; `npm run format:check` enforces it.
    'prettier/prettier': 'off',
    // Theme-dependent styles are built with StyleSheet.create inside
    // createStyles(theme); the few remaining inline styles are one-off
    // safe-area paddings computed from insets.
    'react-native/no-inline-styles': 'off',
    // Bracket access on `Record<string, unknown>` and `process.env` is
    // deliberate: it marks a key that is not statically known to exist.
    'dot-notation': 'off',
    // `void promise` marks an intentional fire-and-forget call.
    'no-void': ['error', { allowAsStatement: true }],
  },
};
