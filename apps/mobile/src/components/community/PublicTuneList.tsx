import type { PublicLinkedChart, PublicTune } from '@jam-practice/core/profileTunes';
import { nameId } from '@jam-practice/core/standards';
import { makeId, type Tune } from '@jam-practice/core/types';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { BookIcon, CheckIcon, LinkIcon, PlusIcon } from '@/components/icons';
import { LinkedChartModal } from '@/components/LinkedChartModal';
import { prettyKeyName } from '@/lib/keyNames';
import { useSyncedTunes, useTunesToLearn } from '@/lib/useSyncedTunes';
import { useAppTheme } from '@/theme/ThemeProvider';

/** Turns a `PublicTune` (someone else's data) into a fresh, independent `Tune` for the viewer's
    own list — new ids throughout, `notes` always empty since a public profile never exposes it in
    the first place. Matches `apps/web/components/PublicTuneList.tsx`'s own `toOwnTune` exactly. */
export function toOwnTune(source: PublicTune): Tune {
  return {
    id: makeId(),
    name: source.name,
    tempos: source.tempos.map((t) => ({ id: makeId(), value: t.value, enabled: t.enabled })),
    keys: source.keys.map((k) => ({ id: makeId(), value: k.value, enabled: k.enabled })),
    timeSignature: source.timeSignature,
    notes: '',
  };
}

/**
 * Native sibling of `apps/web/components/PublicTuneList.tsx` — a read-only tune list used to
 * render a public profile's "Tunes" and "Tunes to Learn" sections. `canAdd` (true only for a
 * signed-in viewer looking at someone *else's* profile) shows per-row "Add"/"Learn" actions, each
 * copying that row into one of the viewer's own lists, disabled once a tune with the same name is
 * already there (matched the same name-insensitive way the jazz-standards picker already checks).
 * `card`: the list sits on the page (a post), so it's one filled card with rows divided by hairlines
 * rather than separate boxes for a section card's inside.
 */
export function PublicTuneList({ tunes, canAdd, card }: { tunes: PublicTune[]; canAdd: boolean; card?: boolean }) {
  const { colors } = useAppTheme();
  const [myTunes, setMyTunes] = useSyncedTunes();
  const [tunesToLearn, setTunesToLearn] = useTunesToLearn();
  const [viewingChart, setViewingChart] = useState<PublicLinkedChart | null>(null);

  const haveAsTune = useMemo(() => new Set(myTunes.map((t) => nameId(t.name))), [myTunes]);
  const haveAsLearn = useMemo(() => new Set(tunesToLearn.map((t) => nameId(t.name))), [tunesToLearn]);

  return (
    <View className={card ? 'overflow-hidden rounded-xl' : 'gap-2'} style={card ? { backgroundColor: colors.surface } : undefined}>
      <LinkedChartModal chart={viewingChart} onClose={() => setViewingChart(null)} />
      {tunes.map((tune, i) => {
        const inMyTunes = haveAsTune.has(nameId(tune.name));
        const inTunesToLearn = haveAsLearn.has(nameId(tune.name));
        return (
          <View
            key={tune.id}
            className={card ? 'gap-2.5 px-4 py-3' : 'gap-2.5 rounded-xl p-3'}
            style={card ? (i ? { borderTopWidth: 1, borderTopColor: colors.background } : undefined) : { backgroundColor: colors.background }}
          >
            <View className="flex-row items-start justify-between gap-2">
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="text-sm font-semibold font-ui-semibold" style={{ color: colors.foreground }}>
                  {tune.name}
                </Text>
                <Text className="mt-0.5 text-xs font-ui tabular-nums" style={{ color: colors.muted }}>
                  {tune.timeSignature}
                </Text>
              </View>
              {canAdd ? (
                <View className="flex-row gap-1">
                  <Pressable
                    onPress={() => !inMyTunes && setMyTunes((prev) => [...prev, toOwnTune(tune)])}
                    disabled={inMyTunes}
                    className="flex-row items-center gap-1 rounded-lg px-2 py-1.5"
                    style={{ opacity: inMyTunes ? 0.5 : 1 }}
                  >
                    {inMyTunes ? <CheckIcon color={colors.muted} size={13} /> : <PlusIcon color={colors.muted} size={13} />}
                    <Text className="text-xs font-ui-semibold" style={{ color: colors.muted }}>
                      {inMyTunes ? 'Added' : 'Add'}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => !inTunesToLearn && setTunesToLearn((prev) => [...prev, toOwnTune(tune)])}
                    disabled={inTunesToLearn}
                    className="flex-row items-center gap-1 rounded-lg px-2 py-1.5"
                    style={{ opacity: inTunesToLearn ? 0.5 : 1 }}
                  >
                    {inTunesToLearn ? <CheckIcon color={colors.muted} size={13} /> : <BookIcon color={colors.muted} size={13} />}
                    <Text className="text-xs font-ui-semibold" style={{ color: colors.muted }}>
                      {inTunesToLearn ? 'Learning' : 'Learn'}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
            {tune.tempos.length + tune.keys.length === 0 ? (
              <Text className="text-xs font-ui" style={{ color: colors.muted }}>
                No tempos or keys
              </Text>
            ) : (
              <View className="flex-row flex-wrap gap-1.5">
                {tune.tempos.map((t) => (
                  <Chip key={t.id} enabled={t.enabled} label={`${t.value} BPM`} />
                ))}
                {tune.keys.map((k) => (
                  <Chip key={k.id} enabled={k.enabled} label={prettyKeyName(k.value)} />
                ))}
              </View>
            )}
            {tune.linkedChart ? (
              <Pressable
                onPress={() => setViewingChart(tune.linkedChart ?? null)}
                className="flex-row items-center gap-1.5 self-start rounded-lg px-2 py-1.5"
                style={{ backgroundColor: `${colors.accent}1a` }}
              >
                <LinkIcon color={colors.accent} size={13} />
                <Text numberOfLines={1} className="text-xs font-ui-semibold" style={{ color: colors.accent }}>
                  {tune.linkedChart.title}
                </Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function Chip({ enabled, label }: { enabled: boolean; label: string }) {
  const { colors } = useAppTheme();
  return (
    <View
      className="rounded-full px-2.5 py-1"
      style={{ backgroundColor: enabled ? `${colors.accent}26` : colors.surface }}
    >
      <Text
        className="text-xs font-ui-semibold tabular-nums"
        style={{
          color: enabled ? colors.accent : colors.muted,
          textDecorationLine: enabled ? 'none' : 'line-through',
        }}
      >
        {label}
      </Text>
    </View>
  );
}
