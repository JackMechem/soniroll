import AsyncStorage from '@react-native-async-storage/async-storage';
import { categoryColor } from '@jam-practice/core/accentColors';
import { CATEGORIES, type Category } from '@jam-practice/core/navLinks';
import {
  ALL_PRESETS,
  CUSTOM_THEME_ID,
  type ThemeColors,
  type ThemePreset,
  getPreset,
} from '@jam-practice/core/themes';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme, View } from 'react-native';

/**
 * The native side of `apps/web/lib/theme.ts` — same storage key (`jam-practice-theme`, though
 * AsyncStorage and the web's own `localStorage` are obviously two separate stores; there's no
 * actual cross-device sync here, just a deliberately matching name) and the same resolve rule
 * (custom theme if selected and set, otherwise the chosen preset, falling back to "light"), built
 * on `@jam-practice/core/themes`'s exact same preset list so "same themes" (per a direct request
 * to make the two apps look exactly alike) is actually one shared list, not two that could drift.
 *
 * What's deliberately *not* ported yet, scoped down from `lib/theme.ts`'s full feature set:
 * - **Font selection** (`lib/fonts.ts`) — those are CSS `var(--font-x)` stacks tied to
 *   `next/font/google`-loaded web fonts; a real native equivalent needs actual font files loaded
 *   via `expo-font`, a separate task from color theming.
 * - **The custom-theme color editor** — `setCustomColor`/`setCustomColors` aren't exposed here
 *   yet; `presetId`/`setPreset` cover every preset (including picking "custom" once something has
 *   already seeded it, which nothing does yet), matching the bulk of what `ThemeModal.tsx` is for
 *   (picking a preset) without yet porting its own color-editing UI.
 *
 * **"Same as my phone"** (`SYSTEM_THEME_ID`, the default when nothing is stored): Light or Dark
 * from the phone's colour scheme, following it when it changes (`useColorScheme`; `app.json`'s
 * `userInterfaceStyle` is `automatic`). The website does the same check once, on first visit.
 *
 * Colors are applied via plain React Context + inline `style` props, not NativeWind's `vars()`/
 * CSS custom properties (what a first pass here used, to mirror the web app's own mechanism as
 * closely as possible). That turned out not to work reliably on native: react-native-css-interop
 * 0.2.7 (what this NativeWind version ships) doesn't correctly re-resolve a descendant's
 * already-rendered `className` when an ancestor's `vars()` output changes later — confirmed
 * directly on a real device (Pixel 10 Pro, over adb/scrcpy): switching themes updated anything
 * reading `colors` as a plain JS value (icon `color` props, inline `style`) instantly, but left
 * every `bg-surface`/`bg-background`-style className stuck on whichever color it first resolved
 * to, permanently — and a static `:root` fallback (needed just to get *first-paint* resolution
 * working at all) then won every *subsequent* theme change outright, since it turned out to be
 * `rootVariables`, not the `vars()`-scoped context override, driving resolution. Plain inline
 * styles sourced from this context sidestep that whole class of bug rather than working around
 * it — the same, standard way color theming is usually done in React Native (e.g.
 * react-navigation's or react-native-paper's own theme objects). `className`/NativeWind is still
 * used everywhere for *layout* (flex, spacing, rounded corners, type scale) — only color moved.
 */
const STORAGE_KEY = 'jam-practice-theme';

type StoredThemeState = { id: string; custom: ThemeColors | null };

/** Follow the phone: Light or Dark from its colour scheme. */
export const SYSTEM_THEME_ID = 'system';

const DEFAULT_STATE: StoredThemeState = { id: SYSTEM_THEME_ID, custom: null };

function resolveColors(state: StoredThemeState, scheme: 'light' | 'dark'): ThemeColors {
  if (state.id === CUSTOM_THEME_ID && state.custom) return state.custom;
  if (state.id === SYSTEM_THEME_ID) return getPreset(scheme)!.colors;
  return (getPreset(state.id) ?? getPreset('light'))!.colors;
}

/** `hex` (`#rrggbb`) at `opacity` (0–1), as `#rrggbbaa`. */
export function withAlpha(hex: string, opacity: number): string {
  const a = Math.round(Math.min(1, Math.max(0, opacity)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex.slice(0, 7)}${a}`;
}

/** Colours made from the theme, the same ones the website uses: */
export interface DerivedColors {
  /** A dark theme (the background is dark): light status-bar icons, etc. */
  isDark: boolean;
  /** The faint fill on rows, secondary buttons and inputs (the web's `bg-foreground/[0.05]`). */
  fill: string;
  /** A hairline between rows or under a bar. */
  hairline: string;
  /** One colour per tool category (the web's `--cat-N`): the accent turned round the colour wheel. */
  category: Record<Category, string>;
}

function derive(colors: ThemeColors): DerivedColors {
  const n = parseInt(colors.background.slice(1, 7), 16);
  const luminance = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return {
    isDark: luminance < 0.5,
    fill: withAlpha(colors.foreground, 0.05),
    hairline: withAlpha(colors.foreground, 0.08),
    category: Object.fromEntries(CATEGORIES.map((c) => [c, categoryColor(colors.accent, c)])) as Record<Category, string>,
  };
}

interface ThemeContextValue {
  colors: ThemeColors;
  derived: DerivedColors;
  presetId: string;
  setPreset: (id: string) => void;
  allPresets: ThemePreset[];
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<StoredThemeState>(DEFAULT_STATE);
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (typeof parsed.id === 'string') {
          setState({ id: parsed.id, custom: parsed.custom ?? null });
        }
      })
      .catch(() => {
        // storage unavailable — stay on DEFAULT_STATE
      });
  }, []);

  const setPreset = useCallback(
    (id: string) => {
      const next = { ...state, id };
      setState(next);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {
        // storage unavailable — the in-memory state above still updates this session
      });
    },
    [state],
  );

  const colors = useMemo(() => resolveColors(state, scheme), [state, scheme]);
  const derived = useMemo(() => derive(colors), [colors]);

  const value = useMemo<ThemeContextValue>(
    () => ({ colors, derived, presetId: state.id, setPreset, allPresets: ALL_PRESETS }),
    [colors, derived, state.id, setPreset],
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
    </View>
  );
}

export function useAppTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useAppTheme must be used within a ThemeProvider');
  return ctx;
}
