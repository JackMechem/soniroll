import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { api } from '@jam-practice/convex/_generated/api';
import { useAction, useQuery } from 'convex/react';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { InfoButton } from '@/components/InfoButton';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useAppTheme } from '@/theme/ThemeProvider';
import { TextInput } from '@/components/ThemedTextInput';

function friendlyError(err: unknown, fallback: string): string {
  return err instanceof Error && err.message && err.message.length < 150 ? err.message : fallback;
}

/**
 * The native sibling of `apps/web/components/AccountPage.tsx`'s `PasswordSection` — same
 * two-step emailed-confirmation flow (`requestPasswordConfirmation` verifies the current password
 * if there is one and emails a code; `confirmPassword` takes that code plus the new password,
 * which never leaves this component's own state until that second call). "Sign-in methods"
 * (connect/disconnect Google) is deliberately **not** ported here — Google sign-in itself isn't
 * wired up on mobile yet (it needs an in-app-browser + deep-link redirect handshake, a separate,
 * unstarted task — see `PROJECT.md`), so there's nothing for a "Connect Google" button to actually
 * do yet; showing one that silently fails would be worse than not showing it.
 */
export function SecurityTab() {
  const { colors } = useAppTheme();
  const user = useQuery(api.users.current);
  const providers = useQuery(api.account.linkedProviders);
  const requestConfirmation = useAction(api.account.requestPasswordConfirmation);
  const confirmPassword = useAction(api.account.confirmPassword);

  const [step, setStep] = useState<'form' | 'code'>('form');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);

  const hasPassword = providers?.includes('password') ?? false;
  const email = user?.email ?? null;

  // Until both load, it isn't known whether this is "Change password" or "Set a password".
  if (user === undefined || providers === undefined) {
    return (
      <View className="items-center py-12">
        <LoadingSpinner />
      </View>
    );
  }

  function reset() {
    setStep('form');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    setCode('');
  }

  async function onSubmitForm() {
    setError(null);
    setSuccess(false);
    if (newPassword !== confirmNewPassword) {
      setError("New passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      await requestConfirmation(hasPassword ? { currentPassword } : {});
      setStep('code');
    } catch (err) {
      setError(friendlyError(err, hasPassword ? "Couldn't verify your current password." : "Couldn't send a code."));
    } finally {
      setSubmitting(false);
    }
  }

  async function onSubmitCode() {
    setError(null);
    setSubmitting(true);
    try {
      await confirmPassword({ code, newPassword });
      reset();
      setSuccess(true);
    } catch (err) {
      setError(friendlyError(err, "Couldn't confirm that code."));
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle = { backgroundColor: colors.background, color: colors.foreground };

  return (
    <View className="gap-4 rounded-2xl p-5" style={{ backgroundColor: colors.surface }}>
      <View className="gap-1">
        <View className="flex-row items-center gap-2">
          <Text className="text-lg font-semibold font-ui-semibold" style={{ color: colors.foreground }}>
            {hasPassword ? 'Change password' : 'Set a password'}
          </Text>
          <InfoButton
            title={hasPassword ? 'Change password' : 'Set a password'}
            text={
              hasPassword
                ? "Changing your password signs you out on every other device. We'll email a code to confirm it's really you."
                : `Lets you also sign in with ${email ?? 'your email'} and a password, not just Google. We'll email a code to confirm.`
            }
          />
        </View>
        {step === 'code' ? (
          <Text className="text-sm font-ui" style={{ color: colors.muted }}>
            Enter the code we emailed to {email ?? 'your email'} to finish.
          </Text>
        ) : null}
      </View>

      {step === 'form' ? (
        <View className="gap-3">
          {hasPassword ? (
            <Field label="Current password">
              <TextInput
                value={currentPassword}
                onChangeText={setCurrentPassword}
                secureTextEntry={!showPasswords}
                autoComplete="current-password"
                className="rounded-xl px-3 py-2.5 text-base font-ui"
                style={inputStyle}
              />
            </Field>
          ) : null}
          <Field label="New password">
            <TextInput
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry={!showPasswords}
              autoComplete="new-password"
              className="rounded-xl px-3 py-2.5 text-base font-ui"
              style={inputStyle}
            />
          </Field>
          <Field label="Confirm new password">
            <TextInput
              value={confirmNewPassword}
              onChangeText={setConfirmNewPassword}
              secureTextEntry={!showPasswords}
              autoComplete="new-password"
              className="rounded-xl px-3 py-2.5 text-base font-ui"
              style={inputStyle}
            />
          </Field>
          <Pressable
            onPress={() => setShowPasswords((v) => !v)}
            accessibilityRole="switch"
            accessibilityState={{ checked: showPasswords }}
            accessibilityLabel="Show passwords"
            hitSlop={8}
            className="flex-row items-center gap-1.5 self-start"
          >
            <MaterialCommunityIcons name={showPasswords ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.muted} />
            <Text className="text-sm font-ui" style={{ color: colors.muted }}>
              {showPasswords ? 'Hide passwords' : 'Show passwords'}
            </Text>
          </Pressable>
          {error ? (
            <Text className="text-sm font-ui" style={{ color: colors.danger }}>
              {error}
            </Text>
          ) : null}
          {success ? (
            <Text className="text-sm font-ui" style={{ color: colors.accent }}>
              {hasPassword ? 'Password changed.' : 'Password set — you can now sign in with it too.'}
            </Text>
          ) : null}
          <Pressable
            onPress={() => void onSubmitForm()}
            disabled={submitting || (hasPassword ? !currentPassword : false) || newPassword.length < 8}
            className="self-start rounded-xl px-4 py-2.5"
            style={{
              backgroundColor: colors.accent,
              opacity: submitting || (hasPassword ? !currentPassword : false) || newPassword.length < 8 ? 0.5 : 1,
            }}
          >
            <Text className="text-sm font-semibold font-ui-semibold" style={{ color: colors['accent-foreground'] }}>
              {hasPassword ? 'Send confirmation code' : 'Send code to set password'}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View className="gap-3">
          <Field label="Confirmation code">
            <TextInput
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              autoFocus
              className="rounded-xl px-3 py-2.5 text-base font-ui"
              style={inputStyle}
            />
          </Field>
          {error ? (
            <Text className="text-sm font-ui" style={{ color: colors.danger }}>
              {error}
            </Text>
          ) : null}
          <View className="flex-row gap-2">
            <Pressable
              onPress={reset}
              className="rounded-xl px-4 py-2.5"
              style={{ backgroundColor: colors.background }}
            >
              <Text className="text-sm font-semibold font-ui-semibold" style={{ color: colors.foreground }}>
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={() => void onSubmitCode()}
              disabled={submitting || !code}
              className="rounded-xl px-4 py-2.5"
              style={{ backgroundColor: colors.accent, opacity: submitting || !code ? 0.5 : 1 }}
            >
              <Text className="text-sm font-semibold font-ui-semibold" style={{ color: colors['accent-foreground'] }}>
                {hasPassword ? 'Confirm password change' : 'Confirm and set password'}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-semibold font-ui-semibold" style={{ color: colors.muted }}>
        {label}
      </Text>
      {children}
    </View>
  );
}
