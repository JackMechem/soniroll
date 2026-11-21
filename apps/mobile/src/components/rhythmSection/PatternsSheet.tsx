import { analyzeInsights, noteName, type Share, type Where } from '@jam-practice/core/bassInsights';
import { useMemo, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { FullScreenModal } from '@/components/FullScreenModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CloseIcon } from '@/components/icons';
import { InfoButton } from '@/components/InfoButton';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { EmptyPanel } from '@/components/tool/rhythm';
import { usePlayerTranscriptionRows } from '@/lib/useBassPlayers';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * "Patterns" on the phone — the website's `PatternsDialog` (`apps/web/components/bassgenius/
 * PatternsDialog.tsx`), full screen: what Rhythm Section notices in a player's transcriptions (one,
 * or all of the player's) from `analyzeInsights` — register and rhythm, what they land on at chord
 * changes, how they lead into new chords and across common changes, their bar shapes, phrases they
 * repeat, and bars that don't fit their chord symbol. What each part means is behind its ⓘ.
 */
export function PatternsSheet({
  playerId,
  playerName,
  transcriptionId,
  onClose,
}: {
  playerId: string;
  playerName: string;
  /** One transcription, or null for all of the player's. */
  transcriptionId: string | null;
  onClose: () => void;
}) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const rows = usePlayerTranscriptionRows(playerId, playerName);
  const picked = useMemo(() => rows?.filter((r) => !transcriptionId || r.id === transcriptionId).map((r) => r.data), [rows, transcriptionId]);
  const insights = useMemo(() => (picked ? analyzeInsights(picked) : null), [picked]);
  const title = transcriptionId ? (picked?.[0]?.title ?? 'Transcription') : `All of ${playerName}'s transcriptions`;
  const single = !!transcriptionId;
  const at = (w?: Where) => (w ? (single ? `bar ${w.bar}` : `${w.title}, bar ${w.bar}`) : '');
  const totalMoves = insights ? insights.motion.steps + insights.motion.skips + insights.motion.leaps + insights.motion.repeats : 0;
  const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);

  return (
    <FullScreenModal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View className="flex-1" style={{ backgroundColor: colors.background, paddingTop: insets.top }}>
        <View className="flex-row items-center gap-3 px-4 py-3">
          <View className="flex-1">
            <Text className="font-ui text-xs" style={{ color: colors.muted }}>
              Patterns · {playerName}
            </Text>
            <Text numberOfLines={1} className="font-ui-bold text-xl font-bold" style={{ color: colors.foreground }}>
              {title}
            </Text>
          </View>
          <Pressable onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: colors.surface }}>
            <CloseIcon color={colors.foreground} size={20} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24, gap: 12 }}>
          {!insights ? (
            <View className="py-12">
              <LoadingSpinner showLabel label="Reading the transcriptions…" />
            </View>
          ) : insights.notes === 0 ? (
            <EmptyPanel>No notes to look at yet.</EmptyPanel>
          ) : (
            <>
              <View className="flex-row flex-wrap overflow-hidden rounded-xl" style={{ backgroundColor: colors.surface }}>
                <Stat label="Bars" value={String(insights.bars)} />
                <Stat label="Notes" value={String(insights.notes)} />
                <Stat label="Range" value={insights.range ? `${noteName(insights.range.low)}–${noteName(insights.range.high)}` : '—'} />
                <Stat label="Usual register" value={insights.range ? `around ${noteName(insights.range.median)}` : '—'} />
              </View>

              <Section title="Rhythm" hint="How the notes are divided.">
                <Bars shares={insights.rhythm} at={at} />
              </Section>

              <Section title="Landing on a new chord" hint="What's played on the first beat of each chord, as a degree of that chord.">
                <Bars shares={insights.downbeats.slice(0, 8)} at={at} />
              </Section>

              <Section title="Beat by beat" hint="What kind of note lands on each beat of the bar.">
                {insights.beats.map((b) => (
                  <View key={b.beat} className="gap-1">
                    <Small>Beat {b.beat}</Small>
                    <Bars shares={b.shares} at={at} compact />
                  </View>
                ))}
              </Section>

              <Section title="Getting into the next chord" hint="How the last note before a chord change leads to the change's first note.">
                <Bars shares={insights.approaches} at={at} />
              </Section>

              {insights.transitions.length > 0 ? (
                <Section title="Across common changes" hint="For the chord changes that come up most: the usual way in, and the line across the bar line (degrees of each chord, | = the change).">
                  {insights.transitions.map((t) => (
                    <View key={t.change} className="gap-2 rounded-lg p-3" style={{ backgroundColor: colors.background }}>
                      <View className="flex-row items-baseline justify-between gap-2">
                        <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
                          {t.change}
                        </Text>
                        <Small>{t.count}×</Small>
                      </View>
                      <Bars shares={t.approaches} at={at} compact />
                      {t.lines.map((l) => (
                        <View key={l.label} className="flex-row items-baseline justify-between gap-2">
                          <Text className="font-ui text-sm" style={{ color: colors.foreground, fontFamily: 'monospace' }}>
                            {l.label}
                          </Text>
                          <Small>
                            {l.count}× · {at(l.example)}
                          </Small>
                        </View>
                      ))}
                    </View>
                  ))}
                </Section>
              ) : null}

              {insights.shapes.length > 0 ? (
                <Section title="Shapes through a bar" hint="Bars of one chord with four notes, as degrees of the chord — arpeggios, scale runs and approach notes.">
                  {insights.shapes.map((f) => (
                    <View key={f.family} className="gap-1">
                      <Small>
                        {f.family} · {f.bars} bar{f.bars === 1 ? '' : 's'}
                      </Small>
                      <View className="overflow-hidden rounded-lg" style={{ backgroundColor: colors.background }}>
                        {f.items.map((s) => (
                          <View key={s.label} className="flex-row items-baseline gap-3 px-3 py-1.5">
                            <Text className="font-ui-semibold w-24 text-sm font-semibold" style={{ color: colors.foreground, fontFamily: 'monospace' }}>
                              {s.label}
                            </Text>
                            <Text numberOfLines={1} className="font-ui flex-1 text-sm" style={{ color: colors.muted }}>
                              {s.kind}
                            </Text>
                            <Small>
                              {s.count}× · {at(s.example)}
                            </Small>
                          </View>
                        ))}
                      </View>
                    </View>
                  ))}
                </Section>
              ) : null}

              <Section title="Motion" hint="How the line moves from note to note.">
                <Bars
                  shares={[
                    { label: 'Steps (1–2 semitones)', count: insights.motion.steps, pct: pct(insights.motion.steps, totalMoves) },
                    { label: 'Skips (a 3rd)', count: insights.motion.skips, pct: pct(insights.motion.skips, totalMoves) },
                    { label: 'Leaps (a 4th or more)', count: insights.motion.leaps, pct: pct(insights.motion.leaps, totalMoves) },
                    { label: 'Repeated notes', count: insights.motion.repeats, pct: pct(insights.motion.repeats, totalMoves) },
                  ]}
                  at={at}
                />
                <Small>
                  Up {pct(insights.motion.up, insights.motion.up + insights.motion.down)}% of the time, down {pct(insights.motion.down, insights.motion.up + insights.motion.down)}%.
                </Small>
              </Section>

              {insights.licks.length > 0 ? (
                <Section title="Phrases that come back" hint="Five-note figures with the same intervals and rhythm, in any key.">
                  {insights.licks.map((l) => (
                    <View key={l.intervals + l.rhythm} className="gap-0.5 rounded-lg px-3 py-2" style={{ backgroundColor: colors.background }}>
                      <View className="flex-row items-baseline justify-between gap-3">
                        <Text className="font-ui-semibold flex-1 text-sm font-semibold" style={{ color: colors.foreground }}>
                          {l.notes}
                        </Text>
                        <Small>{l.count}×</Small>
                      </View>
                      <Small>{[l.intervals, l.rhythm, l.examples.map((w) => at(w)).join(' · ')].join('  ·  ')}</Small>
                    </View>
                  ))}
                </Section>
              ) : null}

              {insights.suspectBars.length > 0 ? (
                <Section
                  title="Bars that don't fit their chord symbol"
                  hint="The line here doesn't sit on the written chord — often a chord symbol in the wrong bar. These patterns (and the bass's matching) read the chords as written."
                >
                  <Text className="font-ui text-sm" style={{ color: colors.foreground }}>
                    {groupBars(insights.suspectBars, single)}
                  </Text>
                </Section>
              ) : null}
            </>
          )}
        </ScrollView>
      </View>
    </FullScreenModal>
  );
}

function Small({ children }: { children: ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <Text className="font-ui text-xs" style={{ color: colors.muted, fontVariant: ['tabular-nums'] }}>
      {children}
    </Text>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const { colors } = useAppTheme();
  return (
    <View className="px-3 py-2.5" style={{ width: '50%' }}>
      <Small>{label}</Small>
      <Text numberOfLines={1} className="font-ui-semibold text-base font-semibold" style={{ color: colors.foreground }}>
        {value}
      </Text>
    </View>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View className="gap-3 rounded-xl p-4" style={{ backgroundColor: colors.surface }}>
      <View className="flex-row items-center gap-1.5">
        <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
          {title}
        </Text>
        <InfoButton title={title} text={hint} size={16} />
      </View>
      {children}
    </View>
  );
}

function Bars({ shares, at, compact = false }: { shares: Share[]; at: (w?: Where) => string; compact?: boolean }) {
  const { colors, derived } = useAppTheme();
  return (
    <View className="gap-1.5">
      {shares.map((s) => (
        <View key={s.label}>
          <View className="flex-row items-baseline justify-between gap-2">
            <Text numberOfLines={1} className="font-ui flex-1 text-sm" style={{ color: colors.foreground }}>
              {s.label}
            </Text>
            <Small>
              {s.pct}%{!compact && s.example ? ` · e.g. ${at(s.example)}` : ''}
            </Small>
          </View>
          <View className="mt-0.5 h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: derived.hairline }}>
            <View className="h-full rounded-full" style={{ width: `${Math.max(2, s.pct)}%`, backgroundColor: colors.accent }} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** "bars 14, 26, 41–48" (per transcription when there are several). */
function groupBars(list: Where[], single: boolean): string {
  const byTitle = new Map<string, number[]>();
  for (const w of list) byTitle.set(w.title, [...(byTitle.get(w.title) ?? []), w.bar]);
  return [...byTitle.entries()]
    .map(([title, bars]) => {
      const runs: string[] = [];
      for (let i = 0; i < bars.length; ) {
        let j = i;
        while (j + 1 < bars.length && bars[j + 1] === bars[j] + 1) j++;
        runs.push(i === j ? String(bars[i]) : `${bars[i]}–${bars[j]}`);
        i = j + 1;
      }
      return `${single ? '' : `${title}: `}bar${bars.length === 1 ? '' : 's'} ${runs.join(', ')}`;
    })
    .join(' · ');
}
