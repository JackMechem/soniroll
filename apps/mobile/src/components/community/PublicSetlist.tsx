import type { PublicTune } from '@jam-practice/core/profileTunes';
import { setlistKey } from '@jam-practice/core/setlistKeys';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChordChartIcon, DownloadIcon, MicrophoneIcon, PencilIcon, SlidesIcon } from '@/components/icons';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { RecordingRow, useRecordingPlayer } from '@/components/recordings/RecordingParts';
import { useSaveSetlist } from '@/lib/useSaveSetlist';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * Someone's setlist as a reader sees it — on a setlist post and on a shared link. Two actions up
 * top: **View all charts** (the swipe-through reader, `setlist-charts.tsx`) and **Save as my
 * setlist** (a copy that's yours from then on, charts included — `useSaveSetlist`); then the tunes
 * in order, each opening the reader at that tune. Your own setlist shows **Edit setlist** instead
 * of Save, since what's shown here *is* your setlist (it updates as you change it). A tune with
 * recordings shows a mic button with their count; tapping it lists them right under the tune,
 * playable by anyone the setlist is shared with.
 */
export function PublicSetlist({
  title,
  tunes,
  isMine,
  ownSetlistId,
  chartsParams,
}: {
  title: string;
  tunes: PublicTune[];
  isMine: boolean;
  ownSetlistId?: string | null;
  chartsParams: { post: string } | { shared: string };
}) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const save = useSaveSetlist();
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [openRecordings, setOpenRecordings] = useState<number | null>(null);
  const player = useRecordingPlayer();
  const chartCount = tunes.filter((t) => t.linkedChart).length;

  const openCharts = (start = 0) => router.push({ pathname: '/setlist-charts', params: { ...chartsParams, start: String(start) } });

  async function doSave() {
    setSaving(true);
    try {
      setSavedId(await save(title, tunes));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View className="gap-3">
      <View className="flex-row gap-2">
        <Pressable
          onPress={() => openCharts()}
          className="flex-1 flex-row items-center justify-center gap-2 rounded-xl py-3"
          style={{ backgroundColor: colors.accent }}
        >
          <SlidesIcon color={colors['accent-foreground']} size={19} />
          <Text className="font-ui-bold text-sm font-bold" style={{ color: colors['accent-foreground'] }}>
            View all charts
          </Text>
        </Pressable>
        {isMine ? (
          ownSetlistId ? (
            <Pressable
              onPress={() => router.push({ pathname: '/library/setlist', params: { id: ownSetlistId } })}
              className="flex-1 flex-row items-center justify-center gap-2 rounded-xl py-3"
              style={{ backgroundColor: colors.surface }}
            >
              <PencilIcon color={colors.foreground} size={18} />
              <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
                Edit setlist
              </Text>
            </Pressable>
          ) : null
        ) : (
          <Pressable
            onPress={() => (savedId ? router.push({ pathname: '/library/setlist', params: { id: savedId } }) : void doSave())}
            disabled={saving}
            className="flex-1 flex-row items-center justify-center gap-2 rounded-xl py-3"
            style={{ backgroundColor: colors.surface }}
          >
            {saving ? <LoadingSpinner size="sm" /> : <DownloadIcon color={colors.foreground} size={18} />}
            <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
              {savedId ? 'Saved — open it' : saving ? 'Saving…' : 'Save as my setlist'}
            </Text>
          </Pressable>
        )}
      </View>
      {!isMine && !savedId && chartCount > 0 ? (
        <Text className="font-ui text-xs" style={{ color: colors.muted }}>
          Saving copies the {chartCount} chart{chartCount === 1 ? '' : 's'} into a &ldquo;{title}&rdquo; playlist and adds any tunes you don&apos;t have.
        </Text>
      ) : null}

      <View className="overflow-hidden rounded-2xl" style={{ backgroundColor: colors.surface }}>
        {tunes.map((t, i) => (
          <View key={`${t.id}-${i}`} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: colors.background }}>
            <Pressable
              onPress={() => openCharts(i)}
              android_ripple={{ color: colors['surface-hover'] }}
              className="flex-row items-center gap-3 px-3"
              style={{ minHeight: 60 }}
            >
              <Text className="font-ui-bold w-6 text-right text-base font-bold tabular-nums" style={{ color: colors.accent }}>
                {i + 1}
              </Text>
              <View className="flex-1 py-2">
                <Text numberOfLines={1} className="font-ui-semibold text-base font-semibold" style={{ color: colors.foreground }}>
                  {t.name}
                </Text>
                <Text numberOfLines={1} className="font-ui text-sm" style={{ color: colors.muted }}>
                  {[
                    setlistKey({ overrideRoot: t.setKey, chartKey: t.linkedChart?.key, tuneKeys: t.keys.filter((k) => k.enabled).map((k) => k.value) }),
                    (t.setTempo ?? t.tempos.find((x) => x.enabled)?.value) ? `${t.setTempo ?? t.tempos.find((x) => x.enabled)?.value} BPM` : null,
                    t.timeSignature || null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              {t.recordings?.length ? (
                <Pressable
                  onPress={() => setOpenRecordings(openRecordings === i ? null : i)}
                  hitSlop={6}
                  accessibilityLabel={`${t.recordings.length} recording${t.recordings.length === 1 ? '' : 's'}`}
                  className="flex-row items-center gap-1 rounded-full px-2.5 py-1.5"
                  style={{ backgroundColor: openRecordings === i ? colors.accent : colors.background }}
                >
                  <MicrophoneIcon color={openRecordings === i ? colors['accent-foreground'] : colors.foreground} size={15} />
                  <Text
                    className="font-ui-bold text-xs font-bold tabular-nums"
                    style={{ color: openRecordings === i ? colors['accent-foreground'] : colors.foreground }}
                  >
                    {t.recordings.length}
                  </Text>
                </Pressable>
              ) : null}
              {t.linkedChart ? <ChordChartIcon color={colors.accent} size={18} /> : null}
            </Pressable>
            {openRecordings === i && t.recordings ? (
              <View className="gap-2 px-3 pb-3">
                {t.recordings.map((r) => (
                  <RecordingRow key={r.id} recording={{ ...r, _id: r.id }} player={player} background={colors.background} />
                ))}
              </View>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}
