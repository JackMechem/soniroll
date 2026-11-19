/**
 * Deliberately *no* `theme.extend.colors` pointing at `var(--x)` CSS custom properties here
 * anymore — that was the original plan (mirroring `apps/web/app/globals.css`'s own `@theme`
 * block via a NativeWind `vars()` wrapper in `src/theme/ThemeProvider.tsx`), but react-native-css-
 * interop 0.2.7 (what this NativeWind version ships) doesn't correctly re-resolve a descendant's
 * already-rendered `className` when an ancestor's `vars()` value changes later — confirmed
 * directly on a real device (Pixel 10 Pro): switching themes updated anything reading color as a
 * plain JS value instantly, but left every `bg-surface`/`bg-background`-style className stuck on
 * whichever color it first resolved to, forever. Color now flows entirely through
 * `useAppTheme().colors` applied as inline `style` props (the standard React Native approach,
 * same as react-navigation/react-native-paper's own theming) — NativeWind/`className` is still
 * used everywhere for *layout* (flex, spacing, rounded corners, type scale), just not color.
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      // Geist, the website's UI font, in its weighted files (loaded in `app/_layout.tsx`). A custom
      // font has no synthetic bold the way a system font does, so `font-bold`/`font-semibold`/
      // `font-extrabold` alone would render in the regular weight: every `<Text>` carries one of
      // these `font-ui-*` classes matching its weight.
      fontFamily: {
        ui: ['Geist_400Regular'],
        'ui-semibold': ['Geist_600SemiBold'],
        'ui-bold': ['Geist_700Bold'],
        'ui-extrabold': ['Geist_800ExtraBold'],
      },
      // The website's corner scale (`apps/web/app/globals.css`): a little tighter than Tailwind's
      // defaults. Controls `rounded-lg`, cards `rounded-xl`, sheets and dialogs `rounded-2xl`, the
      // big main buttons `rounded-full`.
      borderRadius: {
        sm: '4px',
        DEFAULT: '6px',
        md: '6px',
        lg: '10px',
        xl: '12px',
        '2xl': '16px',
        '3xl': '20px',
      },
    },
  },
  plugins: [],
};
