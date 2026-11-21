import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useAuthActions, useConvexAuth } from '@convex-dev/auth/react';
import { api } from '@jam-practice/convex/_generated/api';
import { useQuery } from 'convex/react';
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState, type ComponentType, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  AccountEditIcon,
  ChevronRightIcon,
  DangerIcon,
  LockIcon,
  LogoutIcon,
  PostIcon,
  ThemeIcon,
  type IconProps,
} from '@/components/icons';
import { UserAvatar } from '@/components/UserAvatar';
import { useAppTheme } from '@/theme/ThemeProvider';
import { withScreenLoader } from '@/components/ScreenLoader';
import { Button, useScrolled } from '@/components/ui';
import { TextInput } from '@/components/ThemedTextInput';

/**
 * The native side of `apps/web/components/AccountMenu.tsx`'s `AuthForm` (signed out) plus
 * `apps/web/components/AccountPage.tsx` (signed in) — same backend throughout, same
 * `@convex-dev/auth` password+email-verification state machine for both signing up and the
 * account-management flows. Signed out: the form (with "Forgot password?"), then Theme under a
 * "Settings" label. Signed in: who you are, a grouped list (your profile and posts; Settings:
 * Theme, Security), Sign out, and Delete account on its own at the bottom.
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
  // `?flow=signUp` (Home's "Create an account") opens the form on Sign up.
  const { flow } = useLocalSearchParams<{ flow?: string }>();
  const { scrolled, onScroll } = useScrolled();

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      {/* A shadow under the header once the page scrolls, so content doesn't slide under it unseen. */}
      <Stack.Screen options={{ headerShadowVisible: scrolled }} />
      <SafeAreaView className="flex-1" edges={['bottom']}>
        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <LoadingSpinner />
          </View>
        ) : isAuthenticated ? (
          <SignedIn onScroll={onScroll} />
        ) : (
          <ScrollView contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled" onScroll={onScroll} scrollEventThrottle={16}>
            <AuthForm initialFlow={flow === 'signUp' ? 'signUp' : 'signIn'} />
            <View className="mt-8 px-6">
              <GroupLabel>Settings</GroupLabel>
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
 * Signed in: about you and your settings. Who you are at the top (tap it to edit your public
 * profile), then a grouped list — each row opens that section as its own page (`app/account/*`).
 * Your tunes and the ear training path live on Home and in the Library, not here.
 */
function SignedIn({ onScroll }: { onScroll: ReturnType<typeof useScrolled>['onScroll'] }) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { signOut } = useAuthActions();
  const user = useQuery(api.users.current);
  const profile = useQuery(api.profiles.getMine);
  const posts = useQuery(api.communityTunes.mine);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  if (user === undefined || profile === undefined) {
    return (
      <View className="flex-1 items-center justify-center">
        <LoadingSpinner />
      </View>
    );
  }

  const name = profile?.username ? `@${profile.username}` : (user?.name ?? user?.email ?? 'Your account');

  const groups: { label?: string; rows: RowSpec[] }[] = [
    {
      rows: [
        { href: '/account/public-profile', label: 'Public profile', Icon: AccountEditIcon, value: profile?.isPublic ? 'Public' : 'Private' },
        { href: '/account/posts', label: 'My posts', Icon: PostIcon, value: posts ? String(posts.length) : undefined },
      ],
    },
    {
      label: 'Settings',
      rows: [
        { href: '/theme', label: 'Theme', Icon: ThemeIcon },
        { href: '/account/security', label: 'Security', Icon: LockIcon },
      ],
    },
  ];

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32, gap: 18 }} onScroll={onScroll} scrollEventThrottle={16}>
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

      {groups.map((group, gi) => (
        <View key={gi}>
          {group.label ? <GroupLabel>{group.label}</GroupLabel> : null}
          <View className="overflow-hidden rounded-2xl" style={{ backgroundColor: colors.surface }}>
            {group.rows.map((row, i) => (
              <ListRow key={row.label} row={row} divider={i < group.rows.length - 1} onPress={() => router.push(row.href)} />
            ))}
          </View>
        </View>
      ))}

      <View className="overflow-hidden rounded-2xl" style={{ backgroundColor: colors.surface }}>
        <ListRow row={{ href: '/profile', label: 'Sign out', Icon: LogoutIcon }} chevron={false} onPress={() => setConfirmSignOut(true)} />
      </View>

      {/* On its own at the bottom, well away from Sign out. */}
      <View className="mt-10 overflow-hidden rounded-2xl" style={{ backgroundColor: colors.surface }}>
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
type Step = 'credentials' | 'code' | 'reset' | 'resetSent';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Signing in, creating an account, and asking for a password reset — the website's `AuthForm` and
 * forgot-password page on the same `@convex-dev/auth` Password provider. Sign in stays full colour
 * and says what's missing when tapped (rather than a washed-out disabled look). "Forgot password?"
 * asks for the reset link right here (`flow: 'reset'`, as the website does); the emailed link opens
 * soniroll.com, where the new password is chosen (the app has no app links to catch it), and you
 * come back and sign in with it. Errors never say whether an email has an account.
 */
function AuthForm({ initialFlow }: { initialFlow: Flow }) {
  const { colors, derived } = useAppTheme();
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<Flow>(initialFlow);
  // "code" means Convex Auth's Password provider emailed a confirmation code instead of completing
  // sign-in/sign-up directly — covers both a fresh sign-up and any pre-existing account that's
  // never verified its email. Same state shape as `AccountMenu.tsx`'s own `AuthForm` on web.
  const [step, setStep] = useState<Step>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const trimmedEmail = email.trim();

  const inputStyle = { backgroundColor: derived.fill, color: colors.foreground };

  async function onSubmitCredentials() {
    if (submitting) return;
    // Say what's missing rather than greying the button out.
    if (!trimmedEmail || !password) {
      setError(!trimmedEmail && !password ? 'Enter your email and a password.' : !trimmedEmail ? 'Enter your email.' : 'Enter a password.');
      return;
    }
    if (!EMAIL_RE.test(trimmedEmail)) {
      setError("That email doesn't look right — check it for typos.");
      return;
    }
    if (flow === 'signUp' && password.length < 8) {
      setError('Use a password of at least 8 characters.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const result = await signIn('password', { email: trimmedEmail, password, flow });
      if (!result.signingIn) {
        // Didn't throw, but no tokens came back either — a confirmation code was emailed instead.
        setStep('code');
      }
    } catch {
      setError(
        flow === 'signUp'
          ? "Couldn't create that account. If you already have one, sign in instead."
          : "Couldn't sign in — check the email and password, or reset your password.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function onSubmitCode() {
    if (submitting) return;
    if (!code.trim()) {
      setError('Enter the code from the email.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const result = await signIn('password', { email: trimmedEmail, code: code.trim(), flow: 'email-verification' });
      if (!result.signingIn) {
        setError("That code didn't work — try again.");
      }
    } catch {
      setError('That code is invalid or has expired.');
    } finally {
      setSubmitting(false);
    }
  }

  async function onSubmitReset() {
    if (submitting) return;
    if (!EMAIL_RE.test(trimmedEmail)) {
      setError(trimmedEmail ? "That email doesn't look right — check it for typos." : 'Enter your email.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await signIn('password', { email: trimmedEmail, flow: 'reset' });
    } catch {
      // The same outcome either way, as on the website: saying "no account with that email" would
      // let anyone check which emails have soniroll accounts.
    } finally {
      setSubmitting(false);
      setStep('resetSent');
    }
  }

  const goTo = (next: Step) => {
    setError(null);
    setStep(next);
  };

  const errorLine = error ? (
    <Text className="font-ui mb-3 text-sm" style={{ color: colors.danger }}>
      {error}
    </Text>
  ) : null;

  const backLink = (label: string) => (
    <Pressable onPress={() => goTo('credentials')} accessibilityRole="button" className="mt-3 h-11 items-center justify-center">
      <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.muted }}>
        {label}
      </Text>
    </Pressable>
  );

  if (step === 'code') {
    return (
      <View className="px-6 pt-6">
        <Heading title="Check your email">
          We sent a code to {trimmedEmail}. Enter it below to finish {flow === 'signUp' ? 'creating your account' : 'signing in'}.
        </Heading>
        <TextInput
          value={code}
          onChangeText={setCode}
          placeholder="123456"
          placeholderTextColor={colors.muted}
          keyboardType="number-pad"
          autoFocus
          accessibilityLabel="Code from the email"
          className="font-ui mb-4 h-12 rounded-lg px-4 text-base"
          style={inputStyle}
        />
        {errorLine}
        <Button label={submitting ? 'Checking…' : 'Confirm'} onPress={() => void onSubmitCode()} />
        {backLink('Back')}
      </View>
    );
  }

  if (step === 'reset') {
    return (
      <View className="px-6 pt-6">
        <Heading title="Forgot your password?">Enter your account&apos;s email and we&apos;ll send you a link to choose a new one.</Heading>
        <FieldLabel>Email</FieldLabel>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          autoFocus
          accessibilityLabel="Email"
          onSubmitEditing={() => void onSubmitReset()}
          className="font-ui mb-4 h-12 rounded-lg px-4 text-base"
          style={inputStyle}
        />
        {errorLine}
        <Button label={submitting ? 'Sending…' : 'Send reset link'} onPress={() => void onSubmitReset()} />
        {backLink('Back to sign in')}
      </View>
    );
  }

  if (step === 'resetSent') {
    return (
      <View className="px-6 pt-6">
        <Heading title="Check your email">
          If there&apos;s a soniroll account with a password for {trimmedEmail}, we&apos;ve sent it a link to reset the password. It expires in an hour.
        </Heading>
        <Text className="font-ui mb-5 text-sm leading-5" style={{ color: colors.muted }}>
          The link opens soniroll.com, where you choose the new password. Then come back here and sign in with it.
        </Text>
        <Button label="Back to sign in" onPress={() => goTo('credentials')} />
        <Pressable onPress={() => goTo('reset')} accessibilityRole="button" className="mt-3 h-11 items-center justify-center">
          <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.muted }}>
            Use a different email
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="px-6 pt-6">
      <View accessibilityRole="tablist" className="mb-5 flex-row self-center rounded-full p-1" style={{ backgroundColor: derived.fill }}>
        {(['signIn', 'signUp'] as const).map((f) => (
          <Pressable
            key={f}
            onPress={() => {
              setFlow(f);
              setError(null);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: flow === f }}
            className="h-10 justify-center rounded-full px-5"
            style={{ backgroundColor: flow === f ? colors.accent : 'transparent' }}
          >
            <Text className="font-ui-semibold text-sm font-semibold" style={{ color: flow === f ? colors['accent-foreground'] : colors.muted }}>
              {f === 'signIn' ? 'Sign in' : 'Create an account'}
            </Text>
          </Pressable>
        ))}
      </View>

      <FieldLabel>Email</FieldLabel>
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        accessibilityLabel="Email"
        className="font-ui mb-4 h-12 rounded-lg px-4 text-base"
        style={inputStyle}
      />

      <View className="mb-1.5 flex-row items-center justify-between">
        <FieldLabel flush>Password</FieldLabel>
        {flow === 'signIn' ? (
          <Pressable onPress={() => goTo('reset')} accessibilityRole="link" hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}>
            <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.accent }}>
              Forgot password?
            </Text>
          </Pressable>
        ) : null}
      </View>
      <View className="mb-4 h-12 flex-row items-center rounded-lg" style={{ backgroundColor: derived.fill }}>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder={flow === 'signUp' ? 'At least 8 characters' : 'Your password'}
          placeholderTextColor={colors.muted}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoComplete={flow === 'signUp' ? 'new-password' : 'current-password'}
          accessibilityLabel="Password"
          onSubmitEditing={() => void onSubmitCredentials()}
          className="font-ui h-12 flex-1 px-4 text-base"
          style={{ color: colors.foreground }}
        />
        <Pressable
          onPress={() => setShowPassword((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
          className="h-12 w-12 items-center justify-center"
        >
          <MaterialCommunityIcons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.muted} />
        </Pressable>
      </View>

      {errorLine}

      <Button label={submitting ? (flow === 'signUp' ? 'Creating your account…' : 'Signing in…') : flow === 'signUp' ? 'Create an account' : 'Sign in'} onPress={() => void onSubmitCredentials()} />

      <Text className="font-ui mt-6 text-center text-xs leading-5" style={{ color: colors.muted }}>
        Signing in with Google isn&apos;t available in the app yet — use email and password, or
        sign in on the web.
      </Text>
    </View>
  );
}

function Heading({ title, children }: { title: string; children: ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View className="mb-5 gap-1">
      <Text className="font-ui-bold text-xl font-bold" style={{ color: colors.foreground }}>
        {title}
      </Text>
      <Text className="font-ui text-sm leading-5" style={{ color: colors.muted }}>
        {children}
      </Text>
    </View>
  );
}

function FieldLabel({ children, flush }: { children: ReactNode; flush?: boolean }) {
  const { colors } = useAppTheme();
  return (
    <Text className={`font-ui-semibold text-xs font-semibold ${flush ? '' : 'mb-1.5'}`} style={{ color: colors.muted }}>
      {children}
    </Text>
  );
}

/** A group's small label over its rows ("Settings"). */
function GroupLabel({ children }: { children: ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <Text className="font-ui-semibold mb-1.5 px-1 text-xs font-semibold" style={{ color: colors.muted }}>
      {children}
    </Text>
  );
}

export default withScreenLoader(ProfileScreen);
