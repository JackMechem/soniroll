const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// NativeWind's babel plugin (`jsxImportSource: 'nativewind'`, babel.config.js) rewrites every
// file using JSX to import `react-native-css-interop/jsx-runtime` *directly*, resolved from that
// importing file's own location — but `react-native-css-interop` is only ever a transitive
// dependency of `nativewind` here, not a direct dependency of this app, and pnpm's strict
// (non-hoisting) node_modules layout genuinely doesn't expose it that way by default. Adding it as
// an explicit direct dependency should have fixed this the normal way, but hit a real, reproducible
// pnpm quirk in this environment instead: `pnpm add`/`pnpm install` both create a *dangling* symlink
// at `node_modules/react-native-css-interop` pointing at an unqualified `.pnpm/react-native-css-
// interop@<version>` store entry that's never actually populated with real files — confirmed
// directly (`ls` on the symlink's target comes back empty) — while the real, fully-populated copy
// sits one level deeper, inside nativewind's own `node_modules`, under a peer-dependency-qualified
// hash. Resolving it the same way Node itself would (relative to wherever nativewind's own
// package.json actually lives, not a hardcoded hash that would go stale on the next install) and
// handing Metro that real path directly sidesteps the broken symlink entirely, whether or not it's
// still sitting there.
const cssInteropPath = path.dirname(
  require.resolve('react-native-css-interop/package.json', {
    paths: [path.dirname(require.resolve('nativewind/package.json'))],
  }),
);

// rem = 16 like the web (NativeWind's native default is 14, which drew every size about 12% smaller
// than written: a 48-dp button came out at 42).
const nativeWindConfig = withNativeWind(config, { input: './src/global.css', inlineRem: 16 });

nativeWindConfig.resolver.extraNodeModules = {
  ...nativeWindConfig.resolver.extraNodeModules,
  'react-native-css-interop': cssInteropPath,
};

module.exports = nativeWindConfig;
