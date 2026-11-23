import { api } from '@jam-practice/convex/_generated/api';
import { COMMON_INSTRUMENTS } from '@jam-practice/core/profileInstruments';
import { normalizeUsername, usernameError } from '@jam-practice/core/username';
import { useMutation, useQuery } from 'convex/react';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { CloseIcon, PlusIcon } from '@/components/icons';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { InfoButton } from '@/components/InfoButton';
import { SwitchRow } from '@/components/SwitchRow';
import { useSyncedTunes, useTunesToLearn } from '@/lib/useSyncedTunes';
import { useAppTheme } from '@/theme/ThemeProvider';
import { TextInput } from '@/components/ThemedTextInput';

import { AvatarUpload } from './AvatarUpload';

/**
 * The native sibling of `apps/web/components/PublicProfileEditor.tsx` — username, picture,
 * instruments played, and the public/private toggle. No tune picker here either: a public
 * profile always shows *every* tune from the Tunes/Tunes to Learn tabs automatically
 * (`convex/profiles.ts`'s `getPublicByUsername`), this just reads the two lists for a live count.
 */
export function ProfileTab() {
  const { colors } = useAppTheme();
  const profile = useQuery(api.profiles.getMine);
  const upsertProfile = useMutation(api.profiles.upsertProfile);
  const [tunes] = useSyncedTunes();
  const [tunesToLearn] = useTunesToLearn();

  const [initialized, setInitialized] = useState(false);
  const [username, setUsername] = useState('');
  const [instruments, setInstruments] = useState<string[]>([]);
  const [instrumentInput, setInstrumentInput] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (profile === undefined || initialized) return;
    // The one legitimate case for setState-in-effect: seeding editable local form state from an
    // async-loaded query, exactly once when it first arrives (guarded by `initialized` above) —
    // same exception `apps/web/components/PublicProfileEditor.tsx` already documents for the
    // identical pattern.
    /* eslint-disable react-hooks/set-state-in-effect */
    setInitialized(true);
    if (profile) {
      setUsername(profile.username);
      setInstruments(profile.instruments);
      setIsPublic(profile.isPublic);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [profile, initialized]);

  const normalizedUsername = normalizeUsername(username);
  const formatError = usernameError(username);
  const usernameChanged = !profile || profile.username !== normalizedUsername;
  const availability = useQuery(
    api.profiles.usernameAvailable,
    !formatError && usernameChanged ? { username: normalizedUsername } : 'skip',
  );
  const usernameTaken = usernameChanged && availability === false;

  function addInstrument(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (instruments.some((i) => i.toLowerCase() === trimmed.toLowerCase())) return;
    setInstruments([...instruments, trimmed]);
    setInstrumentInput('');
  }

  function removeInstrument(name: string) {
    setInstruments(instruments.filter((i) => i !== name));
  }

  async function onSave() {
    setError(null);
    setSaved(false);
    if (formatError) {
      setError(formatError);
      return;
    }
    if (usernameTaken) {
      setError('That username is already taken.');
      return;
    }
    setSaving(true);
    try {
      await upsertProfile({ username: normalizedUsername, instruments, isPublic });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your profile.");
    } finally {
      setSaving(false);
    }
  }

  if (profile === undefined) {
    return (
      <View className="items-center gap-3 rounded-2xl p-5" style={{ backgroundColor: colors.surface }}>
        <LoadingSpinner />
      </View>
    );
  }

  const suggestions = COMMON_INSTRUMENTS.filter(
    (name) => !instruments.some((i) => i.toLowerCase() === name.toLowerCase()),
  );

  return (
    <View className="gap-5 rounded-2xl p-5" style={{ backgroundColor: colors.surface }}>
      <AvatarUpload avatarUrl={profile?.avatarUrl ?? null} name={profile?.username} />

      <View className="gap-1">
        <View className="flex-row items-center gap-1.5">
          <Text className="text-sm font-semibold font-ui-semibold" style={{ color: colors.muted }}>
            Username
          </Text>
          <InfoButton
            title="Username"
            size={16}
            text={`This has nothing to do with how you sign in — it's a separate, public identity (soniroll.com/u/${normalizedUsername || '…'}), only shown if your profile is public.`}
          />
        </View>
        <TextInput
          value={username}
          onChangeText={setUsername}
          placeholder="e.g. johndoe"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          className="rounded-xl px-3 py-2.5 text-base font-ui"
          style={{ backgroundColor: colors.background, color: colors.foreground }}
        />
        {formatError ? (
          <Text className="text-xs font-ui" style={{ color: colors.danger }}>
            {formatError}
          </Text>
        ) : usernameChanged && availability === undefined ? (
          <Text className="text-xs font-ui" style={{ color: colors.muted }}>
            Checking availability…
          </Text>
        ) : usernameTaken ? (
          <Text className="text-xs font-ui" style={{ color: colors.danger }}>
            That username is already taken.
          </Text>
        ) : usernameChanged ? (
          <Text className="text-xs font-ui" style={{ color: colors.accent }}>
            Available.
          </Text>
        ) : null}
      </View>

      <View className="gap-2">
        <Text className="text-sm font-semibold font-ui-semibold" style={{ color: colors.muted }}>
          Instruments played
        </Text>
        {instruments.length > 0 ? (
          <View className="flex-row flex-wrap gap-2">
            {instruments.map((name) => (
              <View
                key={name}
                className="flex-row items-center gap-1.5 rounded-full px-3 py-1.5"
                style={{ backgroundColor: colors.background }}
              >
                <Text className="text-xs font-semibold font-ui-semibold" style={{ color: colors.foreground }}>
                  {name}
                </Text>
                <Pressable onPress={() => removeInstrument(name)} accessibilityLabel={`Remove ${name}`} hitSlop={8}>
                  <CloseIcon color={colors.muted} size={14} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
        <View className="flex-row items-center gap-1.5">
          <TextInput
            value={instrumentInput}
            onChangeText={setInstrumentInput}
            onSubmitEditing={() => addInstrument(instrumentInput)}
            placeholder="Add an instrument"
            placeholderTextColor={colors.muted}
            className="min-w-0 flex-1 rounded-xl px-3 py-2.5 text-sm font-ui"
            style={{ backgroundColor: colors.background, color: colors.foreground }}
          />
          <Pressable
            onPress={() => addInstrument(instrumentInput)}
            accessibilityLabel="Add instrument"
            className="h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: colors.background }}
          >
            <PlusIcon color={colors.muted} size={16} />
          </Pressable>
        </View>
        {suggestions.length > 0 ? (
          <View className="flex-row flex-wrap gap-1.5">
            {suggestions.map((name) => (
              <Pressable
                key={name}
                onPress={() => addInstrument(name)}
                className="rounded-full px-2.5 py-1"
                style={{ backgroundColor: colors.background }}
              >
                <Text className="text-xs font-ui" style={{ color: colors.muted }}>
                  + {name}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      <View className="flex-row items-center gap-2 rounded-xl p-3" style={{ backgroundColor: colors.background }}>
        <Text className="flex-1 text-sm font-ui" style={{ color: colors.foreground }}>
          Your public profile shows <Text className="font-semibold font-ui-semibold">{tunes.length}</Text> {tunes.length === 1 ? 'tune' : 'tunes'} you know and{' '}
          <Text className="font-semibold font-ui-semibold">{tunesToLearn.length}</Text> you&apos;re learning.
        </Text>
        <InfoButton
          title="Your tunes"
          size={16}
          text="Every tune in Tunes I Know and Tunes to Learn shows on your public profile — there's nothing to pick. Tunes still in the Library list (not sorted yet) stay private. Manage them in the Library."
        />
      </View>

      <SwitchRow
        label="Make profile public"
        checked={isPublic}
        onChange={setIsPublic}
        disabled={!profile && username.trim().length === 0}
        hint="Anyone can find and view a public profile, even without an account."
      />

      {error ? (
        <Text className="text-sm font-ui" style={{ color: colors.danger }}>
          {error}
        </Text>
      ) : null}
      {saved && !error ? (
        <Text className="text-sm font-ui" style={{ color: colors.accent }}>
          Profile saved.
        </Text>
      ) : null}
      <Pressable
        onPress={() => void onSave()}
        disabled={saving || !!formatError || usernameTaken}
        className="self-start rounded-xl px-4 py-2.5"
        style={{ backgroundColor: colors.accent, opacity: saving || !!formatError || usernameTaken ? 0.5 : 1 }}
      >
        <Text className="text-sm font-semibold font-ui-semibold" style={{ color: colors['accent-foreground'] }}>
          {saving ? 'Saving…' : 'Save profile'}
        </Text>
      </Pressable>
    </View>
  );
}
