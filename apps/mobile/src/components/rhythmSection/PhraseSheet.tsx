import type { BassPhrase } from '@jam-practice/core/bassLine';
import { noteName } from '@jam-practice/core/bassInsights';
import type { Transcription } from '@jam-practice/core/bassTranscription';
import { prettyQuality } from '@jam-practice/core/iRealPro';
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CloseIcon } from '@/components/icons';
import Score from '@/components/notation/Score';
import { useAppTheme } from '@/theme/ThemeProvider';

const INTERVALS = ['the same key', 'up a half step', 'up a whole step', 'up a minor 3rd', 'up a major 3rd', 'up a 4th', 'up a tritone', 'down a 4th', 'down a major 3rd', 'down a minor 3rd', 'down a whole step', 'down a half step'];

/**
 * How one phrase of a modelled player's chorus was made — the website's `PhraseDialog`
 * (`apps/web/components/bassgenius/PhraseDialog.tsx`) as a full screen: where it came from in their
 * transcriptions (a snippet, in its own key), the chart's chords against theirs bar by bar, the key
 * and octave it was moved to, how well their notes fit, and anything adjusted — or, for a Computer
 * phrase, why nothing of theirs was used. Then the phrase as it's played here.
 */
export function PhraseSheet({
  phrase,
  previous,
  bars,
  playerName,
  median,
  source,
  played,
  onClose,
}: {
  phrase: BassPhrase;
  /** The phrase before it in the chorus, to tell whether the line carries straight on. */
  previous: BassPhrase | null;
  /** The phrase's bars in the chorus (1-based). */
  bars: { from: number; to: number };
  playerName: string;
  /** The player's usual register (MIDI). */
  median: number;
  /** The transcription it came from, if any. */
  source: Transcription | null;
  /** The phrase as played, as a transcription (the chorus's bars it covers). */
  played: Transcription | null;
  onClose: () => void;
}) {
  const { colors } = useAppTheme();
  const src = phrase.source;
  const barsLabel = bars.from === bars.to ? `Bar ${bars.from}` : `Bars ${bars.from}–${bars.to}`;
  let snippet: Transcription | null = null;
  let srcBars = { from: 0, to: 0 };
  if (src && source) {
    const m0 = Math.floor(src.startBeat / 4);
    const m1 = Math.ceil((src.startBeat + phrase.length) / 4);
    srcBars = { from: m0 + 1, to: m1 };
    snippet = { ...source, measures: source.measures.slice(m0, m1) };
  }
  const carriesOn =
    !!src && !!previous?.source && previous.source.transcription === src.transcription && previous.source.startBeat + previous.length === src.startBeat && previous.source.shift === src.shift;
  const chartBars = phrase.chartChords.split(' | ');
  const srcChordBars = src ? src.sourceChords.split(' | ') : [];

  const reasons: string[] = [];
  if (src) {
    reasons.push(
      carriesOn
        ? `${playerName}'s line carries straight on from the phrase before — the same passage of ${src.title}, unbroken.`
        : `The best fit for these changes in ${playerName}'s transcriptions. Jumping to a new spot costs more than carrying on, so a new passage is only used when it fits clearly better.`,
    );
    reasons.push(
      `${Math.round(src.fit * 100)}% of ${playerName}'s notes here are chord tones, scale tones or passing notes of this chart's chords${src.fit < 0.8 ? ' — a looser fit, kept because the line carries on.' : '.'}`,
    );
    reasons.push(
      `${src.shift ? `Moved ${INTERVALS[src.shift]} to the chart's key` : 'In the same key as written'}${
        src.octave
          ? `, ${Math.abs(src.octave) === 1 ? 'an octave' : `${Math.abs(src.octave)} octaves`} ${src.octave > 0 ? 'higher' : 'lower'} — to join the line before and stay near ${playerName}'s usual register (around ${noteName(median)})`
          : ', in the octave it was written'
      }.`,
    );
    if (src.refitted > 0)
      reasons.push(
        `${src.refitted} note${src.refitted === 1 ? ' was' : 's were'} moved to the matching chord tone where this chart's chord quality differs from ${playerName}'s (or onto a slash chord's bass).`,
      );
    if (src.folded > 0) reasons.push(`${src.folded} note${src.folded === 1 ? ' was' : 's were'} moved an octave to stay in the bass's range.`);
  } else if (phrase.learned) reasons.push(...phrase.learned.points);
  else
    reasons.push(
      `Nothing in ${playerName}'s transcriptions fitted these changes well enough here, so the Computer walked it — roots on the downbeats, chord and scale tones, approach notes — in ${playerName}'s register (around ${noteName(median)}).`,
    );
  if (phrase.leadIn) reasons.push('Its last note was changed into a half-step lead-in to the next phrase, which starts somewhere else.');

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <View className="flex-row items-start gap-3 px-4 pb-2 pt-3">
          <View className="flex-1">
            <Text className="font-ui text-xs" style={{ color: colors.muted }}>
              {barsLabel} · how it was made
            </Text>
            <Text className="font-ui-bold text-xl font-bold" style={{ color: colors.foreground }}>
              {src
                ? `From ${src.title}, ${srcBars.from === srcBars.to ? `bar ${srcBars.from}` : `bars ${srcBars.from}–${srcBars.to}`}`
                : phrase.learned
                  ? `Written new, in ${phrase.learned.player}'s style`
                  : 'Walked by the Computer'}
            </Text>
          </View>
          <Pressable onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: colors.surface }}>
            <CloseIcon color={colors.foreground} size={20} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          <Section title="Why this">
            {reasons.map((r) => (
              <View key={r} className="flex-row gap-2">
                <Text className="font-ui text-sm" style={{ color: colors.muted }}>
                  •
                </Text>
                <Text className="font-ui flex-1 text-sm leading-5" style={{ color: colors.foreground }}>
                  {r}
                </Text>
              </View>
            ))}
          </Section>

          <Section title="Chords">
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="gap-1.5">
                <ChordRow label="This chart" bars={chartBars} strong />
                {src ? <ChordRow label={`${playerName}'s chords${src.shift ? ' (as written)' : ''}`} bars={chartBars.map((_, i) => srcChordBars[i] ?? '')} /> : null}
              </View>
            </ScrollView>
            {src ? (
              <Text className="font-ui text-xs" style={{ color: colors.muted }}>
                Chord symbols in transcriptions are often loose; the match leans on what the notes actually outline.
              </Text>
            ) : null}
          </Section>

          {snippet ? (
            <Section title={`In ${src!.title} (as written${src!.shift ? `, before moving ${INTERVALS[src!.shift]}` : ''})`}>
              <Score transcription={snippet} firstBar={srcBars.from} />
            </Section>
          ) : null}

          {played ? (
            <Section title="As played here">
              <Score transcription={played} firstBar={bars.from} />
            </Section>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View className="gap-2 rounded-xl p-4" style={{ backgroundColor: colors.surface }}>
      <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function ChordRow({ label, bars, strong }: { label: string; bars: string[]; strong?: boolean }) {
  const { colors, derived } = useAppTheme();
  return (
    <View className="flex-row items-center">
      <Text numberOfLines={2} className="font-ui-semibold w-28 pr-3 text-xs font-semibold" style={{ color: colors.muted }}>
        {label}
      </Text>
      {bars.map((b, i) => (
        <Text
          key={i}
          className={`${strong ? 'font-ui-semibold font-semibold' : 'font-ui'} min-w-16 px-2 py-1 text-sm`}
          style={{ color: strong ? colors.foreground : colors.muted, borderLeftWidth: 1, borderLeftColor: derived.hairline }}
        >
          {pretty(b)}
        </Text>
      ))}
    </View>
  );
}

/** "Bb6 G-7" with each symbol's quality prettified. */
function pretty(bar: string): string {
  return bar
    .split(' ')
    .map((sym) => {
      const m = /^([A-G][b#]?)(.*)$/.exec(sym);
      return m ? m[1].replace('b', '♭').replace('#', '♯') + prettyQuality(m[2]) : sym;
    })
    .join('  ');
}
