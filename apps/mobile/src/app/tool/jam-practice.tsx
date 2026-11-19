import { STANDARDS, standardToTune } from '@jam-practice/core/standards';
import type { Key, Tempo, Tune } from '@jam-practice/core/types';
import { Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { BeatLevel } from '@jam-practice/core/clickSounds';

import { BeatIndicator } from '@/components/BeatIndicator';
import { Dropdown } from '@/components/Dropdown';
import { Hint } from '@/components/Hint';
import { BookIcon, SlidersIcon } from '@/components/icons';
import { SwitchRow } from '@/components/SwitchRow';
import { ToolOptionsSheet } from '@/components/ToolOptionsSheet';
import { TuneListManager } from '@/components/account/TuneListManager';
import { type CountOff, parseBeatsPerBar, playCountOff } from '@/lib/jamPracticeCountOff';
import { useSyncedSettings } from '@/lib/useSyncedSettings';
import { useSyncedTunes } from '@/lib/useSyncedTunes';
import { useAppTheme } from '@/theme/ThemeProvider';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';

/**
 * Native port of `apps/web/components/JamPractice.tsx` — a random tune/tempo/key picker with a
 * count-off metronome, same shape as every other tool since the Metronome: the picked tune's own
 * display plus Pick/Stop on the main screen, with Tunes and Count-off both tucked into
 * `ToolOptionsSheet`. The "Tunes" tab reuses the same `TuneListManager` (`allowStandards`) the
 * account page's own Tunes/Tunes to Learn tabs use, rather than building a third tune-CRUD UI —
 * web's own `TunesPanel.tsx` additionally shows per-tempo/per-key enable/disable chips inline,
 * which `TuneListManager`'s simplified editor doesn't expose (every tempo/key it saves is always
 * enabled, the same cut already accepted for the account page); `pickRandom` below still reads
 * each tune's own `enabled` tempos/keys, so a tune edited on web with some disabled stays correct
 * here too, it just can't be *toggled* from this screen.
 */
const SETTINGS_KEY = 'jam-practice-settings-v2';
const DEFAULT_SETTINGS = {
  countOffBars: 8,
  accentFirstBeat: true,
  keepGoingIndefinitely: true,
  pickFromStandards: false,
};

const BAR_OPTIONS = [1, 2, 4, 8, 16].map((n) => ({ value: n, label: String(n) }));

type PickResult = { tune: Tune; tempo: Tempo | null; key: Key | null };

function JamPracticeScreen() {
  const { colors } = useAppTheme();
  const [tunes, setTunes, tunesReady] = useSyncedTunes();
  const [settings, updateSettings, settingsReady] = useSyncedSettings(SETTINGS_KEY, DEFAULT_SETTINGS);
  const { countOffBars, accentFirstBeat, keepGoingIndefinitely, pickFromStandards } = settings;

  const [pick, setPick] = useState<PickResult | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [isCounting, setIsCounting] = useState(false);
  const [currentBeat, setCurrentBeat] = useState<number | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);

  const countOffRef = useRef<CountOff | null>(null);
  const countOffTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      countOffRef.current?.stop();
      if (countOffTimeoutRef.current) clearTimeout(countOffTimeoutRef.current);
    };
  }, []);

  function stopCountOff() {
    countOffRef.current?.stop();
    countOffRef.current = null;
    if (countOffTimeoutRef.current) {
      clearTimeout(countOffTimeoutRef.current);
      countOffTimeoutRef.current = null;
    }
    setIsCounting(false);
    setCurrentBeat(null);
  }

  function pickRandom() {
    stopCountOff();

    if (!pickFromStandards && tunes.length === 0) {
      setPickError('Add at least one tune to get started, or turn on all jazz standards.');
      setPick(null);
      return;
    }
    let tune: Tune;
    if (pickFromStandards) {
      const standard = STANDARDS[Math.floor(Math.random() * STANDARDS.length)];
      tune = { ...standardToTune(standard), notes: standard.composer };
    } else {
      tune = tunes[Math.floor(Math.random() * tunes.length)];
    }
    const enabledTempos = tune.tempos.filter((t) => t.enabled);
    const enabledKeys = tune.keys.filter((k) => k.enabled);
    const tempo = enabledTempos.length > 0 ? enabledTempos[Math.floor(Math.random() * enabledTempos.length)] : null;
    const key = enabledKeys.length > 0 ? enabledKeys[Math.floor(Math.random() * enabledKeys.length)] : null;
    setPick({ tune, tempo, key });
    setPickError(null);

    if (tempo) {
      const countOff = playCountOff(
        tempo.value,
        tune.timeSignature,
        countOffBars,
        accentFirstBeat,
        keepGoingIndefinitely,
        setCurrentBeat,
      );
      countOffRef.current = countOff;
      setIsCounting(true);
      if (!keepGoingIndefinitely) {
        countOffTimeoutRef.current = setTimeout(() => {
          countOffRef.current = null;
          countOffTimeoutRef.current = null;
          setIsCounting(false);
        }, countOff.durationMs);
      }
    }
  }

  // Saved settings not read yet — a spinner rather than defaults that then jump to the real values.
  if (!settingsReady || !tunesReady) return <ScreenSpinner />;

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: 'Jam Practice' }} />
      <SafeAreaView className="flex-1" edges={['bottom']}>
        <View className="flex-1 px-6 py-3">
          <View className="flex-row justify-end">
            <Pressable
              onPress={() => setOptionsOpen(true)}
              hitSlop={8}
              accessibilityLabel="Options"
              className="flex-row items-center gap-1.5 rounded-full px-4 py-2"
              style={{ backgroundColor: colors.surface }}
            >
              <SlidersIcon color={colors.foreground} size={18} />
              <Text className="text-sm font-bold font-ui-bold" style={{ color: colors.foreground }}>
                Options
              </Text>
            </Pressable>
          </View>

          <View
            className="flex-1 items-center justify-center gap-5"
          >
            <View className="items-center gap-2">
              {pick ? (
                <Text
                  className="text-xs font-semibold font-ui-semibold"
                  style={{ color: colors.muted }}
                >
                  Now practicing
                </Text>
              ) : null}
              <Text
                className="text-center text-3xl font-bold font-ui-bold"
                style={{ color: colors.foreground }}
              >
                {pick ? pick.tune.name : '—'}
              </Text>
              {pick ? (
                <View className="flex-row flex-wrap items-center justify-center gap-x-4 gap-y-1">
                  <Text className="text-base font-ui" style={{ color: colors.muted }}>
                    {pick.tempo ? `${pick.tempo.value} BPM` : 'no enabled tempo'}
                  </Text>
                  <Text className="text-base font-ui" style={{ color: colors.muted }}>
                    {pick.key ? pick.key.value : 'no enabled key'}
                  </Text>
                  <Text className="text-base font-ui" style={{ color: colors.muted }}>
                    {pick.tune.timeSignature}
                  </Text>
                </View>
              ) : null}
              {pick?.tune.notes ? (
                <Text
                  className="max-w-xs text-center text-sm font-ui"
                  style={{ color: colors.muted }}
                >
                  {pick.tune.notes}
                </Text>
              ) : null}
              {!pick && tunes.length === 0 && !pickFromStandards && !pickError ? (
                <Text className="text-center text-sm font-ui" style={{ color: colors.muted }}>
                  Add some tunes in Options, then pick one at random.
                </Text>
              ) : null}
            </View>

            {isCounting && pick?.tempo ? (
              <View className="items-center gap-4">
                <View className="items-center">
                  <Text
                    className="text-6xl font-bold font-ui-bold tabular-nums"
                    style={{ color: colors.foreground }}
                  >
                    {pick.tempo.value}
                  </Text>
                  <Text className="text-sm font-ui" style={{ color: colors.muted }}>
                    BPM · {pick.tune.timeSignature}
                  </Text>
                </View>
                <BeatIndicator
                  accents={Array.from(
                    { length: parseBeatsPerBar(pick.tune.timeSignature) },
                    (_, i): BeatLevel => (accentFirstBeat && i === 0 ? 2 : 1),
                  )}
                  currentBeat={currentBeat}
                />
                <View className="flex-row items-center gap-3">
                  <Text className="text-sm font-semibold font-ui-semibold" style={{ color: colors.accent }}>
                    {keepGoingIndefinitely
                      ? 'Metronome running…'
                      : `Counting off ${countOffBars} bar${countOffBars === 1 ? '' : 's'}…`}
                  </Text>
                  <Pressable
                    onPress={stopCountOff}
                    className="rounded-full px-4 py-2"
                    style={{ backgroundColor: colors.surface }}
                  >
                    <Text className="text-sm font-ui" style={{ color: colors.foreground }}>
                      Stop
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View className="items-center gap-3">
                {pickError ? (
                  <Text className="text-sm font-ui" style={{ color: colors.danger }}>
                    {pickError}
                  </Text>
                ) : null}
                <Text className="text-sm font-ui" style={{ color: colors.muted }}>
                  {pickFromStandards
                    ? `Random picks come from all ${STANDARDS.length} built-in standards.`
                    : 'Random picks come from your Tunes I Know.'}
                </Text>
                <Pressable
                  onPress={pickRandom}
                  className="rounded-full px-8 py-3"
                  style={{ backgroundColor: colors.accent }}
                >
                  <Text className="text-base font-semibold font-ui-semibold" style={{ color: colors['accent-foreground'] }}>
                    {pick ? 'Pick another' : 'Pick a tune'}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </SafeAreaView>

      <ToolOptionsSheet
        visible={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        tabs={[
          {
            key: 'tunes',
            label: 'Tunes I Know',
            content: () => (
              <View className="gap-4">
                <SwitchRow
                  label="Pick from all jazz standards"
                  checked={pickFromStandards}
                  onChange={(checked) => updateSettings({ pickFromStandards: checked })}
                  hint="Draws from the ~630 built-in jazz standards instead of your own tune list below."
                />
                <TuneListManager
                  title="Tunes I Know"
                  icon={BookIcon}
                  tunes={tunes}
                  setTunes={setTunes}
                  searchPlaceholder="Search your tunes…"
                  emptyMessage="No tunes yet — tap + to search jazz standards or create your own."
                  allowStandards
                />
              </View>
            ),
          },
          {
            key: 'countoff',
            label: 'Count-off',
            content: () => (
              <View className="gap-4">
                <View className="flex-row items-center justify-between">
                  <Text className="text-sm font-semibold font-ui-semibold" style={{ color: colors.muted }}>
                    Count-off bars
                  </Text>
                  <Dropdown
                    value={countOffBars}
                    options={BAR_OPTIONS}
                    onChange={(countOffBars) => updateSettings({ countOffBars })}
                  />
                </View>
                <Hint>
                  How many bars click before the tune starts (or, with Keep metronome going on,
                  before it hands off to the running metronome).
                </Hint>
                <SwitchRow
                  label="Accent"
                  checked={accentFirstBeat}
                  onChange={(accentFirstBeat) => updateSettings({ accentFirstBeat })}
                  hint="Plays beat 1 of every bar louder and higher-pitched, so you can hear where the bar starts."
                />
                <SwitchRow
                  label="Keep metronome going"
                  checked={keepGoingIndefinitely}
                  onChange={(keepGoingIndefinitely) => updateSettings({ keepGoingIndefinitely })}
                  hint="Keeps clicking at the tune's tempo after the count-off, instead of stopping once it ends."
                />
              </View>
            ),
          },
        ]}
      />
    </View>
  );
}

export default withScreenLoader(JamPracticeScreen);
