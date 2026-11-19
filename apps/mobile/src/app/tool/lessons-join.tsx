import { useConvexAuth } from '@convex-dev/auth/react';
import { api } from '@jam-practice/convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { CheckIcon } from '@/components/icons';
import { EmptyBox, ErrorLine, LessonsScroll, PersonBadge, errorText, plural } from '@/components/lessons/parts';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { Button } from '@/components/ui';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';

/**
 * Joining a teacher from an invite (`?invite=<code>`, the website's `/lessons/join`): who it's from,
 * for which student, and what joining shares; signed out, Sign in (Account) first; then Join, and
 * you land on your teacher's screen. Reached from Lessons → Join (pasting the link), or a
 * `sheddex://tool/lessons-join?invite=…` link.
 */
function JoinScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { invite: code } = useLocalSearchParams<{ invite: string }>();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const invite = useQuery(api.lessons.invite, code ? { code } : 'skip');
  const join = useMutation(api.lessons.join);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function doJoin() {
    setBusy(true);
    setError(null);
    try {
      const id = await join({ code });
      router.replace({ pathname: '/tool/lessons-teacher', params: { id } });
    } catch (e) {
      setError(errorText(e, "Couldn't join."));
      setBusy(false);
    }
  }

  if ((invite === undefined && code) || isLoading) return <ScreenSpinner />;
  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: 'Join lessons' }} />
      <LessonsScroll gap={20}>
        {!invite ? (
          <View className="pt-6">
            <EmptyBox title="This link doesn't work anymore" body="Ask your teacher to send you a new one." />
          </View>
        ) : (
          <View className="gap-5 rounded-xl p-5" style={{ backgroundColor: colors.surface }}>
            <View className="items-center gap-3">
              <PersonBadge url={invite.teacher.avatarUrl} name={invite.teacher.name} size="lg" />
              <View className="items-center gap-1">
                <Text className="font-ui text-sm" style={{ color: colors.muted }}>
                  Lessons on soniroll
                </Text>
                <Text className="font-ui-bold text-center text-xl font-bold" style={{ color: colors.foreground }}>
                  {invite.teacher.name} invited you to their lessons
                </Text>
                <Text className="font-ui text-center text-sm" style={{ color: colors.muted }}>
                  For {invite.studentName}
                  {invite.itemCount ? ` · ${plural(invite.itemCount, 'thing')} waiting for you` : ''}
                </Text>
              </View>
            </View>
            {invite.isTeacher ? (
              <Note>This is the invite link for your student {invite.studentName} — send it to them.</Note>
            ) : invite.joinedByMe ? (
              <Button label="You've joined — open your lessons" onPress={() => router.replace({ pathname: '/tool/lessons-teacher', params: { id: invite.id } })} />
            ) : invite.taken ? (
              <Note>Someone has already joined with this link. Ask your teacher for a new one.</Note>
            ) : (
              <>
                <View className="gap-2.5 rounded-lg p-4" style={{ backgroundColor: colors.background }}>
                  {[
                    'Their notes, assignments, PDFs, images and chord charts, all in one place',
                    'Their practice routines go straight into your Shed Log',
                    `${invite.teacher.name} sees your practice: your Shed Log stats, and how each routine they gave you goes (tasks, time, notes and recordings on it)`,
                  ].map((t) => (
                    <View key={t} className="flex-row gap-2.5">
                      <View className="mt-0.5 h-5 w-5 items-center justify-center rounded-full" style={{ backgroundColor: withAlpha(colors.accent, 0.14) }}>
                        <CheckIcon color={colors.accent} size={13} />
                      </View>
                      <Text className="font-ui flex-1 text-sm leading-5" style={{ color: colors.foreground }}>
                        {t}
                      </Text>
                    </View>
                  ))}
                </View>
                {isAuthenticated ? (
                  <Button pill label={busy ? 'Joining…' : `Join ${invite.teacher.name}'s lessons`} disabled={busy} onPress={() => void doJoin()} />
                ) : (
                  <View className="gap-2">
                    <Text className="font-ui text-center text-sm" style={{ color: colors.muted }}>
                      Sign in (or sign up — it&apos;s free), then come back here to join.
                    </Text>
                    <Button pill label="Sign in" onPress={() => router.push('/profile')} />
                  </View>
                )}
                <Text className="font-ui text-center text-xs" style={{ color: colors.muted }}>
                  You can leave any time.
                </Text>
              </>
            )}
            <ErrorLine>{error}</ErrorLine>
          </View>
        )}
      </LessonsScroll>
    </View>
  );
}

export default withScreenLoader(JoinScreen);

function Note({ children }: { children: ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <Text className="font-ui rounded-lg p-4 text-sm leading-5" style={{ color: colors.muted, backgroundColor: colors.background }}>
      {children}
    </Text>
  );
}
