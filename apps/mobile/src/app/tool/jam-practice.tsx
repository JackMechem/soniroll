import { STANDARDS, standardToTune } from '@jam-practice/core/standards';
import type { Key, Tempo, Tune } from '@jam-practice/core/types';
import { Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { BeatLevel } from '@jam-practice/core/clickSounds';

import { BeatIndicator } from '@/components/BeatIndicator';
import { BookIcon, MetronomeIcon, PlusIcon } from '@/components/icons';
import { SwitchRow } from '@/components/SwitchRow';
import { TuneListManager } from '@/components/account/TuneListManager';
import { BigButton } from '@/components/tool/meter';
import { ChoiceCards, EmptyPanel, ListIcon, OptionLabel, PillButton } from '@/components/tool/rhythm';
import { SettingChip, SettingsBar } from '@/components/tool/SettingChip';
import { type CountOff, parseBeatsPerBar, playCountOff } from '@/lib/jamPracticeCountOff';
import { useSyncedSettings } from '@/lib/useSyncedSettings';
import { useSyncedTunes } from '@/lib/useSyncedTunes';
import { useAppTheme } from '@/theme/ThemeProvider';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { useToolActivity } from '@/lib/toolTime';

/**
 * Jam Practice — a random tune/tempo/key picker with a count-off metronome — laid out like the
 * website's (`apps/web/components/JamPractice.tsx`): the picked tune (name, key and time
 * signature, notes, the tempo big, the beat strip with what the click is doing), Pick a tune (and
 * Stop while it clicks), then the "Picking from" and Click chips. The "Picking from" sheet holds
 * the standards switch and the same `TuneListManager` the Library uses (`allowStandards`), so it
 * can't toggle a tune's individual tempos/keys the way the website's list can; `pickRandom` still
 * honours each tune's `enabled` tempos/keys.
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
  useToolActivity('/jam-practice', isCounting);
  const [currentBeat, setCurrentBeat] = useState<number | null>(null);
  const [tunesOpen, setTunesOpen] = useState(false);

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

  const nothingToPick = !pickFromStandards && tunes.length === 0;
  const muted = { color: colors.muted };

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: 'Jam Practice' }} />
      <SafeAreaView className="flex-1" edges={['bottom']}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 16, gap: 24 }}
        >
          <View className="items-center gap-3">
            {pick ? (
              <>
                <Text className="font-ui text-sm" style={muted}>
                  Now practicing
                </Text>
                <Text className="font-ui-semibold text-center text-3xl font-semibold tracking-tight" style={{ color: colors.foreground }}>
                  {pick.tune.name}
                </Text>
                {/* Only what the tune has: a tune with no key just shows its time signature. */}
                <View className="flex-row flex-wrap items-center justify-center gap-x-4 gap-y-1">
                  {pick.key ? (
                    <Text className="font-ui text-base" style={muted}>
                      {pick.key.value}
                    </Text>
                  ) : null}
                  <Text className="font-ui text-base" style={muted}>
                    {pick.tune.timeSignature}
                  </Text>
                </View>
                {pick.tune.notes ? (
                  <Text className="font-ui max-w-xs text-center text-sm" style={muted}>
                    {pick.tune.notes}
                  </Text>
                ) : null}
              </>
            ) : nothingToPick ? (
              // Nothing to pick from yet: offer both ways in, right here.
              <EmptyPanel>
                <Text className="font-ui text-center text-sm leading-5" style={muted}>
                  Your tune list is empty. Add the tunes you know, or pick from {STANDARDS.length} jazz standards.
                </Text>
                <View className="flex-row flex-wrap justify-center gap-2">
                  <PillButton label="Add a tune" Icon={PlusIcon} onPress={() => setTunesOpen(true)} />
                  <PillButton
                    label="Use the jazz standards"
                    onPress={() => {
                      updateSettings({ pickFromStandards: true });
                      setPickError(null);
                    }}
                  />
                </View>
              </EmptyPanel>
            ) : (
              <EmptyPanel>No tune picked yet.</EmptyPanel>
            )}

            {/* The tempo shows once, big (the line above has the key and time signature). */}
            {pick?.tempo ? (
              <View className="mt-4 items-center">
                <Text className="font-ui-bold text-6xl font-bold tracking-tight" style={{ color: colors.foreground, fontVariant: ['tabular-nums'] }}>
                  {pick.tempo.value}
                </Text>
                <Text className="font-ui text-sm" style={muted}>
                  BPM
                </Text>
              </View>
            ) : null}
            {/* Stays in place (dimmed, still) after Stop, so the buttons below don't jump up. */}
            {pick?.tempo ? (
              <View className="items-center gap-3" style={{ opacity: isCounting ? 1 : 0.5 }}>
                <BeatIndicator
                  accents={Array.from(
                    { length: parseBeatsPerBar(pick.tune.timeSignature) },
                    (_, i): BeatLevel => (accentFirstBeat && i === 0 ? 2 : 1),
                  )}
                  currentBeat={isCounting ? currentBeat : null}
                />
                <Text className="font-ui text-sm" style={muted}>
                  {!isCounting
                    ? 'Click stopped'
                    : keepGoingIndefinitely
                      ? 'Metronome running'
                      : `Counting off ${countOffBars} bar${countOffBars === 1 ? '' : 's'}`}
                </Text>
              </View>
            ) : null}
          </View>

          <View className="items-center gap-3">
            {pickError && nothingToPick ? (
              <Text className="font-ui text-center text-sm" style={{ color: colors.danger }}>
                {pickError}
              </Text>
            ) : null}
            {!nothingToPick ? (
              <Text className="font-ui text-center text-sm" style={muted}>
                {pickFromStandards
                  ? `Random picks come from all ${STANDARDS.length} built-in standards, not just your list.`
                  : 'Random picks come from the tunes in your list.'}
              </Text>
            ) : null}
            <View className="flex-row flex-wrap items-center justify-center gap-3">
              {isCounting ? <BigButton label="Stop" secondary onPress={stopCountOff} /> : null}
              <BigButton label={pick ? 'Pick another' : 'Pick a tune'} disabled={nothingToPick} onPress={pickRandom} />
            </View>
          </View>

          <View className="items-center gap-3">
            <SettingsBar>
              <SettingChip
                Icon={ListIcon}
                label="Picking from"
                value={pickFromStandards ? `All ${STANDARDS.length} standards` : 'Tunes I Know'}
                open={tunesOpen}
                onOpenChange={setTunesOpen}
              >
                <SwitchRow
                  label="Pick from all jazz standards"
                  checked={pickFromStandards}
                  onChange={(checked) => {
                    updateSettings({ pickFromStandards: checked });
                    setPickError(null);
                  }}
                  hint={`Draws from the ${STANDARDS.length} built-in jazz standards instead of your own tune list below.`}
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
              </SettingChip>

              {/* Its value says what the number means ("8-bar count-off", not a bare "8 bars"). */}
              <SettingChip
                Icon={MetronomeIcon}
                label="Click"
                value={`${countOffBars}-bar count-off${keepGoingIndefinitely ? ', keeps going' : ''}`}
              >
                <View className="gap-2.5">
                  <OptionLabel
                    title="Count-off bars"
                    hint="How many bars click before the tune starts (or, with Keep metronome going on, before it hands off to the running metronome)."
                  />
                  <ChoiceCards label="Count-off bars" cardWidth="18%" options={BAR_OPTIONS} value={countOffBars} onChange={(n) => updateSettings({ countOffBars: n })} />
                </View>
                <SwitchRow
                  label="Accent"
                  checked={accentFirstBeat}
                  onChange={(next) => updateSettings({ accentFirstBeat: next })}
                  hint="Plays beat 1 of every bar louder and higher-pitched, so you can hear where the bar starts."
                />
                <SwitchRow
                  label="Keep metronome going"
                  checked={keepGoingIndefinitely}
                  onChange={(next) => updateSettings({ keepGoingIndefinitely: next })}
                  hint="Keeps clicking at the tune's tempo after the count-off, instead of stopping once it ends."
                />
              </SettingChip>
            </SettingsBar>
            <Text className="font-ui text-xs" style={muted}>
              Idea by Rob Moreno
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

export default withScreenLoader(JamPracticeScreen);
