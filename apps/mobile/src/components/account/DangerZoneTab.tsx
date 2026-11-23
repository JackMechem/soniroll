import { useAuthActions } from '@convex-dev/auth/react';
import { api } from '@jam-practice/convex/_generated/api';
import { useRouter } from 'expo-router';
import { useAction, useQuery } from 'convex/react';
import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import { InfoButton } from '@/components/InfoButton';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useAppTheme } from '@/theme/ThemeProvider';
import { TextInput } from '@/components/ThemedTextInput';

function friendlyError(err: unknown, fallback: string): string {
  return err instanceof Error && err.message && err.message.length < 150 ? err.message : fallback;
}

/** The native sibling of `apps/web/components/AccountPage.tsx`'s Danger Zone — opens
    `DeleteAccountModal` from a single warning button, same shape/copy as web. */
export function DangerZoneTab() {
  const { colors } = useAppTheme();
  const [open, setOpen] = useState(false);
  // The delete flow differs for password vs Google-only accounts — load that before offering it
  // (the modal reads the same, by then already-cached, queries).
  const user = useQuery(api.users.current);
  const providers = useQuery(api.account.linkedProviders);

  if (user === undefined || providers === undefined) {
    return (
      <View className="items-center py-12">
        <LoadingSpinner />
      </View>
    );
  }

  return (
    <View className="gap-3 rounded-2xl p-5" style={{ backgroundColor: colors.surface }}>
      <View className="flex-row items-center gap-2">
        <Text className="text-lg font-semibold font-ui-semibold" style={{ color: colors.danger }}>
          Delete account
        </Text>
        <InfoButton
          title="Delete account"
          text="Permanently deletes your account, including your public profile if you have one. It doesn't touch anything already saved on this device."
        />
      </View>
      <Pressable
        onPress={() => setOpen(true)}
        className="self-start rounded-xl px-4 py-2.5"
        style={{ backgroundColor: colors.danger }}
      >
        <Text className="text-sm font-semibold font-ui-semibold" style={{ color: colors.background }}>
          Delete my account
        </Text>
      </Pressable>

      {open ? <DeleteAccountModal onClose={() => setOpen(false)} /> : null}
    </View>
  );
}

function DeleteAccountModal({ onClose }: { onClose: () => void }) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { signOut } = useAuthActions();
  const user = useQuery(api.users.current);
  const providers = useQuery(api.account.linkedProviders);
  const requestConfirmation = useAction(api.account.requestDeleteConfirmation);
  const confirmDelete = useAction(api.account.confirmDelete);
  const deleteAccount = useAction(api.account.deleteAccount);

  const [step, setStep] = useState<'form' | 'code'>('form');
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const requiresPassword = providers?.includes('password') ?? false;
  const email = user?.email ?? null;

  async function finish() {
    await signOut();
    router.dismissTo('/');
  }

  async function onConfirmForm() {
    setError(null);
    setSubmitting(true);
    try {
      if (requiresPassword) {
        await requestConfirmation({ password });
        setStep('code');
      } else {
        await deleteAccount({});
        await finish();
      }
    } catch (err) {
      setError(friendlyError(err, requiresPassword ? "Couldn't verify your password." : "Couldn't delete your account."));
    } finally {
      setSubmitting(false);
    }
  }

  async function onConfirmCode() {
    setError(null);
    setSubmitting(true);
    try {
      await confirmDelete({ code });
      await finish();
    } catch (err) {
      setError(friendlyError(err, "Couldn't confirm that code."));
      setSubmitting(false);
    }
  }

  const canSubmitForm = requiresPassword ? password.length > 0 : confirmText.trim().toUpperCase() === 'DELETE';
  const inputStyle = { backgroundColor: colors.background, color: colors.foreground };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: `${colors.overlay}99`, justifyContent: 'center', padding: 24 }}
        onPress={onClose}
      >
        <Pressable onPress={() => {}} className="gap-4 rounded-2xl p-5" style={{ backgroundColor: colors.surface }}>
          <View className="gap-1.5">
            <Text className="text-lg font-semibold font-ui-semibold" style={{ color: colors.foreground }}>
              Delete your account
            </Text>
            <Text className="text-sm font-ui" style={{ color: colors.muted }}>
              {step === 'code'
                ? `Enter the code we emailed to ${email ?? 'your email'} to finish.`
                : "This permanently deletes your account and signs you out everywhere. It doesn't touch anything already saved on this device."}
            </Text>
          </View>

          {step === 'form' ? (
            requiresPassword ? (
              <View className="gap-1.5">
                <Text className="text-sm font-semibold font-ui-semibold" style={{ color: colors.muted }}>
                  Enter your password to confirm
                </Text>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoFocus
                  className="rounded-xl px-3 py-2.5 text-base font-ui"
                  style={inputStyle}
                />
              </View>
            ) : (
              <View className="gap-1.5">
                <Text className="text-sm font-ui" style={{ color: colors.muted }}>
                  Type <Text className="font-semibold font-ui-semibold" style={{ color: colors.foreground }}>DELETE</Text> to confirm
                </Text>
                <TextInput
                  value={confirmText}
                  onChangeText={setConfirmText}
                  autoFocus
                  autoCapitalize="characters"
                  className="rounded-xl px-3 py-2.5 text-base font-ui"
                  style={inputStyle}
                />
              </View>
            )
          ) : (
            <View className="gap-1.5">
              <Text className="text-sm font-semibold font-ui-semibold" style={{ color: colors.muted }}>
                Confirmation code
              </Text>
              <TextInput
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                autoFocus
                className="rounded-xl px-3 py-2.5 text-base font-ui"
                style={inputStyle}
              />
            </View>
          )}

          {error ? (
            <Text className="text-sm font-ui" style={{ color: colors.danger }}>
              {error}
            </Text>
          ) : null}

          <View className="flex-row justify-end gap-2">
            <Pressable
              onPress={onClose}
              className="rounded-xl px-4 py-2.5"
              style={{ backgroundColor: colors.background }}
            >
              <Text className="text-sm font-semibold font-ui-semibold" style={{ color: colors.foreground }}>
                Cancel
              </Text>
            </Pressable>
            {step === 'form' ? (
              <Pressable
                onPress={() => void onConfirmForm()}
                disabled={!canSubmitForm || submitting}
                className="rounded-xl px-4 py-2.5"
                style={{ backgroundColor: colors.danger, opacity: !canSubmitForm || submitting ? 0.5 : 1 }}
              >
                <Text className="text-sm font-semibold font-ui-semibold" style={{ color: colors.background }}>
                  {requiresPassword ? 'Send confirmation code' : 'Delete my account'}
                </Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => void onConfirmCode()}
                disabled={submitting || !code}
                className="rounded-xl px-4 py-2.5"
                style={{ backgroundColor: colors.danger, opacity: submitting || !code ? 0.5 : 1 }}
              >
                <Text className="text-sm font-semibold font-ui-semibold" style={{ color: colors.background }}>
                  Confirm delete
                </Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
