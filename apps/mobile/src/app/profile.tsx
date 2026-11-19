import { useAuthActions, useConvexAuth } from '@convex-dev/auth/react';
import { api } from '@jam-practice/convex/_generated/api';
import { useQuery } from 'convex/react';
import { useRouter, type Href } from 'expo-router';
import { useState, type ComponentType } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  AccountEditIcon,
  ChevronRightIcon,
  DangerIcon,
  LockIcon,
  LogoutIcon,
  MusicNoteIcon,
  PostIcon,
  StarOutlineIcon,
  ThemeIcon,
  type IconProps,
} from '@/components/icons';
import { useSyncedTunes, useTunesToLearn } from '@/lib/useSyncedTunes';
import { UserAvatar } from '@/components/UserAvatar';
import { useAppTheme } from '@/theme/ThemeProvider';
import { withScreenLoader } from '@/components/ScreenLoader';
import { EarTrainingProgress } from '@/components/learning/EarTrainingProgress';
import { summarizeLearning } from '@jam-practice/core/learningPath';
import { useLearningProgress } from '@/lib/useLearnSession';

/**
 * The native side of `apps/web/components/AccountMenu.tsx`'s `AuthForm` (signed out) plus
 * `apps/web/components/AccountPage.tsx` (signed in) — same backend throughout, same
 * `@convex-dev/auth` password+email-verification state machine for both signing up and the
 * account-management flows. Signed in, a horizontal pill tab bar (the same "pool of choices"
 * convention this app's option pickers already use elsewhere) switches between six sections
 * mirroring web's own sidebar nav: Profile / Tunes / Tunes to Learn / Posts / Security / Danger
 * zone — one full screen instead of web's fixed sidebar, since there's no room for both side by
 * side here.
 *
 * **Deliberately not ported, both real, documented gaps, not forgotten corners**: web's own
 * "Following" tab (`FollowLists`) — there's no way to follow anyone yet without a Community
 * search/public-profile-viewing screen, neither of which exist on mobile yet, so an empty
 * Following list here would have nothing real to show; and Google sign-in connect/disconnect in
 * Security — Google itself isn't wired up on mobile at all yet (needs an in-app-browser +
 * deep-link redirect handshake, a separate, unstarted task), so there's nothing for those buttons
 * to actually do.
 */
function ProfileScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { isLoading, isAuthenticated } = useConvexAuth();

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <SafeAreaView className="flex-1" edges={['bottom']}>
        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <LoadingSpinner />
          </View>
        ) : isAuthenticated ? (
          <SignedIn />
        ) : (
          <ScrollView contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
            <AuthForm />
            <View className="px-6">
              <View className="overflow-hidden rounded-xl" style={{ backgroundColor: colors.surface }}>
                <ListRow row={{ href: '/theme', label: 'Theme', Icon: ThemeIcon }} onPress={() => router.push('/theme')} />
              </View>
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

type RowSpec = {
  href: Href;
  label: string;
  Icon: ComponentType<IconProps>;
  value?: string;
  danger?: boolean;
};

/**
 * Signed in: who you are at the top (tap it to edit your public profile), then a grouped list —
 * each row opens that section as its own full page (`app/account/*`), rather than the earlier
 * horizontal pill tabs that crammed every section onto this one screen.
 */
function SignedIn() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { signOut } = useAuthActions();
  const user = useQuery(api.users.current);
  const profile = useQuery(api.profiles.getMine);
  const posts = useQuery(api.communityTunes.mine);
  const [tunes] = useSyncedTunes();
  const [tunesToLearn] = useTunesToLearn();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [learningProgress] = useLearningProgress();

  if (user === undefined || profile === undefined) {
    return (
      <View className="flex-1 items-center justify-center">
        <LoadingSpinner />
      </View>
    );
  }

  const name = profile?.username ? `@${profile.username}` : (user?.name ?? user?.email ?? 'Your account');

  const groups: RowSpec[][] = [
    [
      { href: '/account/public-profile', label: 'Public profile', Icon: AccountEditIcon, value: profile?.isPublic ? 'Public' : 'Private' },
      { href: { pathname: '/library/tunes', params: { list: 'tunes' } }, label: 'Tunes I Know', Icon: MusicNoteIcon, value: String(tunes.length) },
      { href: { pathname: '/library/tunes', params: { list: 'learn' } }, label: 'Tunes to Learn', Icon: StarOutlineIcon, value: String(tunesToLearn.length) },
      { href: '/account/posts', label: 'My posts', Icon: PostIcon, value: posts ? String(posts.length) : undefined },
    ],
    [
      { href: '/theme', label: 'Theme', Icon: ThemeIcon },
      { href: '/account/security', label: 'Security', Icon: LockIcon },
    ],
  ];

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32, gap: 18 }}>
      <Pressable
        onPress={() => router.push('/account/public-profile')}
        android_ripple={{ color: colors['surface-hover'] }}
        className="flex-row items-center gap-4 rounded-2xl p-4"
        style={{ backgroundColor: colors.surface }}
      >
        <UserAvatar url={profile?.avatarUrl} size="lg" />
        <View className="flex-1">
          <Text numberOfLines={1} className="font-ui-bold text-xl font-bold" style={{ color: colors.foreground }}>
            {name}
          </Text>
          {user?.email ? (
            <Text numberOfLines={1} className="font-ui text-sm" style={{ color: colors.muted }}>
              {user.email}
            </Text>
          ) : null}
        </View>
        <ChevronRightIcon color={colors.muted} size={22} />
      </Pressable>

      <View className="gap-2.5">
        <Text className="font-ui-bold px-1 text-sm font-bold" style={{ color: colors.muted }}>
          Ear training
        </Text>
        <EarTrainingProgress summaries={summarizeLearning(learningProgress)} links />
      </View>

      {groups.map((rows, gi) => (
        <View key={gi} className="overflow-hidden rounded-2xl" style={{ backgroundColor: colors.surface }}>
          {rows.map((row, i) => (
            <ListRow key={row.label} row={row} divider={i < rows.length - 1} onPress={() => router.push(row.href)} />
          ))}
        </View>
      ))}

      <View className="overflow-hidden rounded-2xl" style={{ backgroundColor: colors.surface }}>
        <ListRow
          row={{ href: '/profile', label: 'Sign out', Icon: LogoutIcon }}
          divider
          chevron={false}
          onPress={() => setConfirmSignOut(true)}
        />
        <ListRow
          row={{ href: '/account/delete-account', label: 'Delete account', Icon: DangerIcon, danger: true }}
          onPress={() => router.push('/account/delete-account')}
        />
      </View>

      <ConfirmDialog
        visible={confirmSignOut}
        title="Sign out?"
        message="Your tools keep working signed out, using what's saved on this phone."
        confirmLabel="Sign out"
        onConfirm={() => {
          setConfirmSignOut(false);
          void signOut();
        }}
        onCancel={() => setConfirmSignOut(false)}
      />
    </ScrollView>
  );
}

function ListRow({
  row,
  divider,
  chevron = true,
  onPress,
}: {
  row: RowSpec;
  divider?: boolean;
  chevron?: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const color = row.danger ? colors.danger : colors.foreground;
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: colors['surface-hover'] }}
      className="flex-row items-center gap-3 px-4"
      style={{ minHeight: 56, borderBottomWidth: divider ? 1 : 0, borderBottomColor: colors.background }}
    >
      <row.Icon color={row.danger ? colors.danger : colors.accent} size={22} />
      <Text className="font-ui-semibold flex-1 text-base font-semibold" style={{ color }}>
        {row.label}
      </Text>
      {row.value ? (
        <Text className="font-ui text-sm tabular-nums" style={{ color: colors.muted }}>
          {row.value}
        </Text>
      ) : null}
      {chevron ? <ChevronRightIcon color={colors.muted} size={20} /> : null}
    </Pressable>
  );
}

type Flow = 'signIn' | 'signUp';
type Step = 'credentials' | 'code';

function AuthForm() {
  const { colors } = useAppTheme();
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<Flow>('signIn');
  // "code" means Convex Auth's Password provider emailed a confirmation code instead of completing
  // sign-in/sign-up directly — covers both a fresh sign-up and any pre-existing account that's
  // never verified its email. Same state shape as `AccountMenu.tsx`'s own `AuthForm` on web.
  const [step, setStep] = useState<Step>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmitCredentials() {
    setError(null);
    setSubmitting(true);
    try {
      const result = await signIn('password', { email, password, flow });
      if (!result.signingIn) {
        // Didn't throw, but no tokens came back either — a confirmation code was emailed instead.
        setStep('code');
      }
    } catch {
      setError(
        flow === 'signUp'
          ? "Couldn't create that account — the email may already be in use, or the password may be too short."
          : "Couldn't sign in — check the email and password.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function onSubmitCode() {
    setError(null);
    setSubmitting(true);
    try {
      const result = await signIn('password', { email, code, flow: 'email-verification' });
      if (!result.signingIn) {
        setError("That code didn't work — try again.");
      }
    } catch {
      setError('That code is invalid or has expired.');
    } finally {
      setSubmitting(false);
    }
  }

  if (step === 'code') {
    return (
      <View className="flex-1 px-6 pt-6">
        <Text className="mb-1 text-base font-bold font-ui-bold" style={{ color: colors.foreground }}>
          Check your email
        </Text>
        <Text className="mb-5 text-sm font-ui" style={{ color: colors.muted }}>
          We sent a code to {email}. Enter it below to finish{' '}
          {flow === 'signUp' ? 'creating your account' : 'signing in'}.
        </Text>
        <TextInput
          value={code}
          onChangeText={setCode}
          placeholder="123456"
          placeholderTextColor={colors.muted}
          keyboardType="number-pad"
          autoFocus
          className="mb-4 rounded-2xl px-4 py-3 text-base font-ui"
          style={{ backgroundColor: colors.surface, color: colors.foreground }}
        />
        {error ? (
          <Text className="mb-3 text-sm font-ui" style={{ color: colors.danger }}>
            {error}
          </Text>
        ) : null}
        <SubmitButton label="Confirm" onPress={onSubmitCode} disabled={submitting || !code} />
        <Pressable onPress={() => setStep('credentials')} className="mt-4 items-center p-2">
          <Text className="text-sm font-ui" style={{ color: colors.muted }}>
            Back
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 px-6 pt-6">
      <View
        className="mb-5 flex-row self-center rounded-full p-1"
        style={{ backgroundColor: colors.surface }}
      >
        {(['signIn', 'signUp'] as const).map((f) => (
          <Pressable
            key={f}
            onPress={() => {
              setFlow(f);
              setError(null);
            }}
            className="rounded-full px-5 py-2"
            style={{ backgroundColor: flow === f ? colors.accent : 'transparent' }}
          >
            <Text
              className="text-sm font-bold font-ui-bold"
              style={{ color: flow === f ? colors['accent-foreground'] : colors.muted }}
            >
              {f === 'signIn' ? 'Sign in' : 'Sign up'}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text className="mb-1.5 text-xs font-semibold font-ui-semibold" style={{ color: colors.muted }}>
        Email
      </Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        className="mb-4 rounded-2xl px-4 py-3 text-base font-ui"
        style={{ backgroundColor: colors.surface, color: colors.foreground }}
      />

      <Text className="mb-1.5 text-xs font-semibold font-ui-semibold" style={{ color: colors.muted }}>
        Password
      </Text>
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="••••••••"
        placeholderTextColor={colors.muted}
        secureTextEntry
        autoComplete={flow === 'signUp' ? 'new-password' : 'current-password'}
        className="mb-4 rounded-2xl px-4 py-3 text-base font-ui"
        style={{ backgroundColor: colors.surface, color: colors.foreground }}
      />

      {error ? (
        <Text className="mb-3 text-sm font-ui" style={{ color: colors.danger }}>
          {error}
        </Text>
      ) : null}

      <SubmitButton
        label={flow === 'signUp' ? 'Create account' : 'Sign in'}
        onPress={onSubmitCredentials}
        disabled={submitting || !email || !password}
      />

      <Text className="mt-6 text-center text-xs leading-5 font-ui" style={{ color: colors.muted }}>
        Signing in with Google isn&apos;t available in the app yet — use email and password, or
        sign in on the web.
      </Text>
    </View>
  );
}

function SubmitButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void | Promise<void>;
  disabled?: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className="items-center rounded-2xl p-4"
      style={{ backgroundColor: colors.accent, opacity: disabled ? 0.5 : 1 }}
    >
      <Text className="text-[15px] font-bold font-ui-bold" style={{ color: colors['accent-foreground'] }}>
        {label}
      </Text>
    </Pressable>
  );
}

export default withScreenLoader(ProfileScreen);
