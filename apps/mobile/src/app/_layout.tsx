import '../global.css';

import {
  Geist_400Regular,
  Geist_600SemiBold,
  Geist_700Bold,
  Geist_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/geist';
import { useAuthActions, useConvexAuth } from '@convex-dev/auth/react';
import { api } from '@jam-practice/convex/_generated/api';
import { useQuery } from 'convex/react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useRecordToolVisits } from '@/lib/toolRecents';
import { View } from 'react-native';

import { LaunchSplash } from '@/components/LaunchSplash';
import { FloatingTabBar } from '@/components/FloatingTabBar';
import { HeaderBackButton } from '@/components/HeaderBackButton';
import { HeaderTitle } from '@/components/HeaderTitle';
import { PracticeTimerAlert } from '@/components/PracticeTimerAlert';
import { PracticeTimerWidget } from '@/components/PracticeTimerWidget';
import { ShedLogGlobal } from '@/components/shedLog/ShedLogGlobal';
import { ConvexClientProvider } from '@/convex/ConvexClientProvider';
import { useAppTheme, ThemeProvider } from '@/theme/ThemeProvider';

SplashScreen.preventAutoHideAsync();

/**
 * Fonts: Geist, the website's UI font, loaded here and applied through the `font-ui*` classes
 * (`tailwind.config.js`), one per `<Text>` matching its weight — a custom font has no synthetic
 * bold, and `Text.defaultProps` doesn't exist on this React Native version, so there's no global
 * default. (It was Inter until the 2026-11 redesign matched the website.)
 */

/**
 * Root navigation shell — one flat `Stack` plus the tab bar for the four main screens: Home (the
 * dashboard), Tools (every tool), Library (tunes, setlists, charts, recordings) and Community. The
 * tab bar shows only on those; everything opened from them covers the screen with a back button.
 * Your account is the button at the top right of the main screens (`components/TabHeader.tsx`).
 */
/** A session whose account is gone (deleted, here or on the website) signs out, rather than
    leaving a nameless account that can't do anything. */
function SignOutIfAccountGone() {
  const { isAuthenticated } = useConvexAuth();
  const user = useQuery(api.users.current, isAuthenticated ? {} : 'skip');
  const { signOut } = useAuthActions();
  useEffect(() => {
    if (isAuthenticated && user === null) void signOut();
  }, [isAuthenticated, user, signOut]);
  return null;
}

function RootNavigator() {
  const { colors, derived } = useAppTheme();
  useRecordToolVisits();

  return (
    <View style={{ flex: 1 }}>
      {/* The clock and icons follow the theme (they were white on light themes). */}
      <StatusBar style={derived.isDark ? 'light' : 'dark'} />
      <SignOutIfAccountGone />
      <Stack
        screenOptions={{
          headerTintColor: colors.accent,
          headerStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background },
          headerTitleAlign: 'left',
          headerLeft: () => <HeaderBackButton />,
          headerTitle: ({ children }) => <HeaderTitle>{children}</HeaderTitle>,
        }}
      >
        {/* The four main screens (and the Library's parts) fade in rather than slide, like tabs. */}
        <Stack.Screen name="index" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="tools" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="tool/[slug]" options={{ title: '' }} />
        <Stack.Screen name="theme" options={{ title: 'Theme' }} />
        <Stack.Screen name="profile" options={{ title: 'Account' }} />
        {/* Titles up front, so the header is right the instant a screen is pushed — each screen
            mounts its real content a frame later (see `components/ScreenLoader.tsx`), and its own
            <Stack.Screen options> only apply once it mounts. Dynamic titles ('') fill in then. */}
        <Stack.Screen name="liked-posts" options={{ title: 'Liked Posts' }} />
        <Stack.Screen name="post/[id]" options={{ title: 'Post' }} />
        <Stack.Screen name="u/[username]" options={{ title: 'Profile' }} />
        <Stack.Screen name="tool/chord-charts" options={{ title: 'Chord Charts' }} />
        <Stack.Screen name="charts/index" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="charts/import" options={{ title: 'Import charts' }} />
        <Stack.Screen name="tool/chord-charts-playlist" options={{ title: '' }} />
        <Stack.Screen name="tool/chord-charts-view" options={{ title: '' }} />
        <Stack.Screen name="tool/chord-charts-new" options={{ title: 'New chart' }} />
        <Stack.Screen name="tool/chord-charts-editor" options={{ title: '' }} />
        <Stack.Screen name="tool/community" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="community/new" options={{ title: 'New post' }} />
        <Stack.Screen name="community/following" options={{ title: 'Following' }} />
        <Stack.Screen name="library/setlist" options={{ title: '' }} />
        <Stack.Screen name="library/setlists" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="setlist-charts" options={{ title: '' }} />
        <Stack.Screen name="setlist/[id]" options={{ title: 'Setlist' }} />
        <Stack.Screen name="tool/guess-the-chord" options={{ title: 'Guess the Chord' }} />
        <Stack.Screen name="tool/guess-the-progression" options={{ title: 'Guess the Progression' }} />
        <Stack.Screen name="tool/guess-the-interval" options={{ title: 'Guess the Interval' }} />
        <Stack.Screen name="tool/find-the-root" options={{ title: 'Find the Root' }} />
        <Stack.Screen name="tool/interval-trainer" options={{ title: 'Interval Trainer' }} />
        <Stack.Screen name="tool/slow-downer" options={{ title: 'Slow Downer' }} />
        <Stack.Screen name="tool/jam-practice" options={{ title: 'Jam Practice' }} />
        <Stack.Screen name="tool/metronome" options={{ title: 'Metronome' }} />
        <Stack.Screen name="tool/note-trainer" options={{ title: 'Note Trainer' }} />
        <Stack.Screen name="tool/practice-timer" options={{ title: 'Practice Timer' }} />
        <Stack.Screen
          name="tool/random-metric-modulation"
          options={{ title: 'Polyrhythm Metric Modulation Metronome' }}
        />
        <Stack.Screen name="tool/recorder" options={{ title: 'Recorder' }} />
        <Stack.Screen name="recordings/index" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="files/index" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="recordings/save" options={{ title: 'Save recording' }} />
        <Stack.Screen name="recordings/[id]" options={{ title: '' }} />
        <Stack.Screen name="tool/random-sticking-warmup" options={{ title: 'Random Sticking Warmup' }} />
        <Stack.Screen name="tool/scale-trainer" options={{ title: 'Scale Trainer' }} />
        <Stack.Screen name="tool/tempo-trainer" options={{ title: 'Tempo Trainer' }} />
        <Stack.Screen name="tool/syncopation" options={{ title: 'Syncopation' }} />
        <Stack.Screen name="tool/rhythm-section" options={{ title: 'Rhythm Section' }} />
        <Stack.Screen name="tool/score-writer" options={{ title: 'Score Writer' }} />
        <Stack.Screen name="tool/time-test" options={{ title: 'Time Test' }} />
        <Stack.Screen name="tool/shed-log" options={{ title: 'Shed Log' }} />
        <Stack.Screen name="tool/shed-log-routines" options={{ title: 'Routines' }} />
        <Stack.Screen name="tool/shed-log-routine" options={{ title: '' }} />
        <Stack.Screen name="tool/shed-log-routine-edit" options={{ title: '' }} />
        <Stack.Screen name="tool/shed-notes" options={{ title: 'Shed Notes' }} />
        <Stack.Screen name="tool/shed-notes-note" options={{ title: '' }} />
        <Stack.Screen name="tool/shed-notes-templates" options={{ title: 'Templates' }} />
        <Stack.Screen name="tool/shed-notes-settings" options={{ title: 'Shed Notes settings' }} />
        <Stack.Screen name="tool/lessons" options={{ title: 'Lessons' }} />
        <Stack.Screen name="tool/lessons-student" options={{ title: 'Lessons' }} />
        <Stack.Screen name="tool/lessons-teacher" options={{ title: 'Lessons' }} />
        <Stack.Screen name="tool/lessons-lesson" options={{ title: '' }} />
        <Stack.Screen name="tool/lessons-notes" options={{ title: 'Lesson notes' }} />
        <Stack.Screen name="tool/lessons-note" options={{ title: 'Lesson notes' }} />
        <Stack.Screen name="tool/lessons-materials" options={{ title: '' }} />
        <Stack.Screen name="tool/lessons-settings" options={{ title: 'Lesson settings' }} />
        <Stack.Screen name="tool/lessons-join" options={{ title: 'Join lessons' }} />
        <Stack.Screen name="tool/lessons-book" options={{ title: 'Pick a lesson time' }} />
        <Stack.Screen name="tool/tuner" options={{ title: 'Tuner' }} />
        <Stack.Screen name="account/public-profile" options={{ title: 'Public profile' }} />
        <Stack.Screen name="library/index" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="library/tunes" options={{ title: '' }} />
        <Stack.Screen name="library/tune" options={{ title: '' }} />
        <Stack.Screen name="library/tune-edit" options={{ title: 'Edit tune' }} />
        <Stack.Screen name="library/tune-notes" options={{ title: 'Notes' }} />
        <Stack.Screen name="account/posts" options={{ title: 'My posts' }} />
        <Stack.Screen name="account/security" options={{ title: 'Security' }} />
        <Stack.Screen name="account/delete-account" options={{ title: 'Delete account' }} />
      </Stack>
      {/* A sibling of Stack so it persists across navigation instead of remounting per screen. */}
      <FloatingTabBar />
      {/* Both read the Practice Timer engine directly and render nothing while no session is
          running — mounted app-wide (not inside the tool screen itself) so the widget stays
          visible on every page and the full-screen alert can interrupt you anywhere. */}
      <PracticeTimerWidget />
      <PracticeTimerAlert />
      {/* The Shed Log's app-wide part: takes in timed practice, counts time in tools, celebrates. */}
      <ShedLogGlobal />
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Geist_400Regular,
    Geist_600SemiBold,
    Geist_700Bold,
    Geist_800ExtraBold,
    // The two Petaluma faces Chord Charts renders notation through — see
    // `components/ChordChart.tsx`'s own doc comment for why it's two faces, not one
    // (`PetalumaScript` for root letters/digits/most of a quality suffix, `Petaluma` itself for
    // the two SMuFL glyphs — Δ and ° — that face doesn't cover). Loaded globally, once, the same
    // as Geist, rather than per-screen, since both are small (under 400KB combined) and a chord
    // chart can be reached from more than one route (the tool itself, a tiled pane, eventually a
    // Community post preview).
    Petaluma: require('../assets/fonts/petaluma/Petaluma.otf'),
    PetalumaScript: require('../assets/fonts/petaluma/PetalumaScript.otf'),
  });

  // Keep the native splash screen up (already held via `preventAutoHideAsync()` above) until
  // the fonts are actually loaded — otherwise the very first frame would briefly flash
  // the system default font before swapping to Geist.
  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ConvexClientProvider>
        <ThemeProvider>
          <LaunchSplash />
          <RootNavigator />
        </ThemeProvider>
      </ConvexClientProvider>
    </GestureHandlerRootView>
  );
}
