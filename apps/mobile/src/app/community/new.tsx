import { useConvexAuth } from '@convex-dev/auth/react';
import { api } from '@jam-practice/convex/_generated/api';
import { toPublicTune } from '@jam-practice/core/profileTunes';
import type { Tune } from '@jam-practice/core/types';
import { useMutation, useQuery } from 'convex/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CloseIcon, PlusIcon } from '@/components/icons';
import { TunePickerModal } from '@/components/library/TunePickerModal';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { SwitchRow } from '@/components/SwitchRow';
import { useKeyboardHeight } from '@/lib/useKeyboardHeight';
import { useSetlists } from '@/lib/useSetlists';
import { tuneSummary, useTuneLists } from '@/lib/useTuneList';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * Posting to Community, as a full page (reached from Community's + or a setlist's ⋮ → Post to
 * Community): title, description, unlisted, and the tunes to post, in order. `?setlist=` starts
 * from one of your setlists — its name, description and tunes, in its order. Each tune's linked
 * chord chart rides along (`communityTunes.create` attaches it); notes never do. Posting needs a
 * public profile, checked up front.
 */
function NewPostScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const profile = useQuery(api.profiles.getMine, isAuthenticated ? {} : 'skip');
  const create = useMutation(api.communityTunes.create);
  const { setlist: setlistId } = useLocalSearchParams<{ setlist?: string }>();
  const { setlists, ready: setlistsReady } = useSetlists();
  const { lists, ready: tunesReady } = useTuneLists();

  const byId = new Map<string, Tune>();
  for (const t of [...lists.tunes.tunes, ...lists.learn.tunes]) byId.set(t.id, t);

  const [seeded, setSeeded] = useState(false);
  // Posted from a setlist: the post *is* that setlist — it shows the setlist's current tunes
  // (read live by the server), so the tune list isn't edited here.
  const [fromSetlist, setFromSetlist] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [unlisted, setUnlisted] = useState(false);
  const [tuneIds, setTuneIds] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Start from the setlist once it has loaded (render-time, so there's no flash of an empty form).
  if (!seeded && setlistsReady) {
    setSeeded(true);
    const s = setlistId ? setlists.find((x) => x.id === setlistId) : undefined;
    if (s) {
      setTitle(s.name);
      setDescription(s.description);
      setTuneIds(s.tuneIds);
      setFromSetlist(s.id);
    }
  }

  if (isLoading || !setlistsReady || !tunesReady || (isAuthenticated && profile === undefined)) return <ScreenSpinner />;

  const chosen = tuneIds.map((id) => byId.get(id)).filter((t): t is Tune => !!t);

  async function post() {
    setError(null);
    if (!title.trim()) return setError('Give this post a title.');
    if (chosen.length === 0) return setError('Add at least one tune.');
    setPosting(true);
    try {
      const id = await create({
        title: title.trim(),
        description: description.trim(),
        tunes: chosen.map(toPublicTune),
        unlisted,
        ...(fromSetlist ? { kind: 'setlist' as const, setlistId: fromSetlist } : {}),
      });
      router.replace({ pathname: '/post/[id]', params: { id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't post that.");
    } finally {
      setPosting(false);
    }
  }

  const blocked = !isAuthenticated || !profile?.isPublic;
  const input = { backgroundColor: colors.surface, color: colors.foreground, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11 };

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          title: 'New post',
          headerRight: blocked
            ? undefined
            : () => (
                <Pressable onPress={() => void post()} disabled={posting} className="rounded-full px-5 py-2" style={{ backgroundColor: colors.accent, opacity: posting ? 0.5 : 1 }}>
                  <Text className="font-ui-bold text-sm font-bold" style={{ color: colors['accent-foreground'] }}>
                    {posting ? 'Posting…' : 'Post'}
                  </Text>
                </Pressable>
              ),
        }}
      />
      {blocked ? (
        <View className="flex-1 items-center justify-center gap-3 px-10">
          <Text className="font-ui text-center text-sm" style={{ color: colors.muted }}>
            {!isAuthenticated ? 'Sign in to post to Community.' : 'Make your profile public before posting to Community.'}
          </Text>
          <Pressable
            onPress={() => router.replace(isAuthenticated ? '/account/public-profile' : '/profile')}
            className="rounded-xl px-4 py-2.5"
            style={{ backgroundColor: colors.accent }}
          >
            <Text className="font-ui-bold text-sm font-bold" style={{ color: colors['accent-foreground'] }}>
              {isAuthenticated ? 'Edit public profile' : 'Sign in'}
            </Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: (keyboard || insets.bottom + 56) + 24 }}>
          <TextInput value={title} onChangeText={setTitle} placeholder="Title — e.g. Friday gig setlist" placeholderTextColor={colors.muted} autoFocus={!setlistId} className="font-ui text-base" style={input} />
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Description (optional)"
            placeholderTextColor={colors.muted}
            multiline
            className="font-ui text-base"
            style={{ ...input, minHeight: 70, textAlignVertical: 'top' }}
          />
          <SwitchRow
            label="Unlisted"
            checked={unlisted}
            onChange={setUnlisted}
            hint="Won't show up in Community's feed or search, or on your public profile — only people with the link can see it."
          />

          <View className="flex-row items-center justify-between">
            <Text className="font-ui-bold text-lg font-bold" style={{ color: colors.foreground }}>
              {fromSetlist ? 'Setlist' : 'Tunes'} ({chosen.length})
            </Text>
            {fromSetlist ? null : (
            <Pressable onPress={() => setPicking(true)} className="flex-row items-center gap-1.5 rounded-full px-4 py-2" style={{ backgroundColor: colors.surface }}>
              <PlusIcon color={colors.foreground} size={16} />
              <Text className="font-ui-bold text-sm font-bold" style={{ color: colors.foreground }}>
                Add tunes
              </Text>
            </Pressable>
            )}
          </View>
          {fromSetlist ? (
            <Text className="font-ui text-sm" style={{ color: colors.muted }}>
              Posted as a setlist — it stays in sync: when you change the setlist, the post changes too.
            </Text>
          ) : null}
          {chosen.length === 0 ? (
            <Text className="font-ui rounded-2xl p-4 text-sm" style={{ backgroundColor: colors.surface, color: colors.muted }}>
              No tunes yet — add some from your lists. Each one&apos;s chord chart comes along.
            </Text>
          ) : (
            <View className="overflow-hidden rounded-2xl" style={{ backgroundColor: colors.surface }}>
              {chosen.map((t, i) => (
                <View key={t.id} className="flex-row items-center gap-3 px-3" style={{ minHeight: 56, borderTopWidth: i ? 1 : 0, borderTopColor: colors.background }}>
                  <Text className="font-ui w-6 text-right text-sm tabular-nums" style={{ color: colors.muted }}>
                    {i + 1}
                  </Text>
                  <View className="flex-1 py-2">
                    <Text numberOfLines={1} className="font-ui-semibold text-base font-semibold" style={{ color: colors.foreground }}>
                      {t.name}
                    </Text>
                    <Text numberOfLines={1} className="font-ui text-xs" style={{ color: colors.muted }}>
                      {[tuneSummary(t), t.chordChartId ? 'chart included' : null].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  {fromSetlist ? null : (
                    <Pressable onPress={() => setTuneIds((prev) => prev.filter((x) => x !== t.id))} accessibilityLabel={`Remove ${t.name}`} hitSlop={8}>
                      <CloseIcon color={colors.muted} size={18} />
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          )}
          {error ? (
            <Text className="font-ui text-sm" style={{ color: colors.danger }}>
              {error}
            </Text>
          ) : null}
        </ScrollView>
      )}
      <TunePickerModal visible={picking} exclude={tuneIds} onAdd={(ids) => setTuneIds((prev) => [...prev, ...ids])} onClose={() => setPicking(false)} />
    </View>
  );
}

export default withScreenLoader(NewPostScreen);
