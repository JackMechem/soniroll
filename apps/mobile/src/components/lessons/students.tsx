import { api } from '@jam-practice/convex/_generated/api';
import type { Id } from '@jam-practice/convex/_generated/dataModel';
import { useAction, useMutation } from 'convex/react';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ShareIcon } from '@/components/icons';
import { EMAIL_RE, ErrorLine, FieldLabel, ago, errorText, inviteCodeFrom, inviteUrl, shareLink } from '@/components/lessons/parts';
import { Field, SmallButton } from '@/components/shedLog/parts';
import { ToolSheet } from '@/components/tool/SettingChip';
import { useGradeColors } from '@/components/tool/ear';
import { Button } from '@/components/ui';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * Inviting students and joining a teacher on the phone (the website's `AddStudentDialog`,
 * `EmailInviteForm` and the invite box on a student's page), plus "Join with an invite" — the app
 * doesn't open https links itself, so a student pastes the link (or its code) here.
 */

/** Add a student: their name and, optionally, their email — the invite goes out straight away. */
export function AddStudentSheet({ visible, onClose, onAdded }: { visible: boolean; onClose: () => void; onAdded: (id: Id<'lessonStudents'>) => void }) {
  return (
    <ToolSheet visible={visible} onClose={onClose} title="Add a student">
      {visible ? <AddStudentForm onClose={onClose} onAdded={onAdded} /> : null}
    </ToolSheet>
  );
}

function AddStudentForm({ onClose, onAdded }: { onClose: () => void; onAdded: (id: Id<'lessonStudents'>) => void }) {
  const { colors } = useAppTheme();
  const add = useMutation(api.lessons.addStudent);
  const send = useAction(api.lessons.emailInvite);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<Id<'lessonStudents'> | null>(null);
  const emailOk = !email.trim() || EMAIL_RE.test(email.trim());

  async function submit() {
    if (!name.trim() || !emailOk || busy) return;
    setBusy(true);
    setError(null);
    let id = added;
    try {
      if (!id) {
        id = await add({ name });
        setAdded(id);
      }
      if (email.trim()) await send({ id, email, message: message.trim() || undefined });
      onAdded(id);
    } catch (e) {
      setError(errorText(e, 'Something went wrong.'));
      setBusy(false);
    }
  }

  return (
    <>
      <View className="gap-1.5">
        <FieldLabel>Name</FieldLabel>
        <Field value={name} onChangeText={setName} placeholder="e.g. Sam" autoFocus />
      </View>
      <View className="gap-1.5">
        <FieldLabel aside="(optional — we'll email them their invite link)">Email</FieldLabel>
        <Field value={email} onChangeText={setEmail} placeholder="sam@example.com" />
        {!emailOk ? <ErrorLine>That doesn&apos;t look like an email address.</ErrorLine> : null}
      </View>
      {email.trim() ? (
        <View className="gap-1.5">
          <FieldLabel aside="(optional)">A note with the invite</FieldLabel>
          <Field value={message} onChangeText={setMessage} multiline placeholder="Looking forward to our first lesson!" label="A note with the invite" />
        </View>
      ) : null}
      {error ? (
        <View className="gap-2 rounded-lg p-3" style={{ backgroundColor: colors.background }}>
          <ErrorLine>{error}</ErrorLine>
          {added ? (
            <Pressable onPress={() => onAdded(added)} className="self-start py-1">
              <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.accent }}>
                Go to {name} without emailing →
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <View className="flex-row justify-end gap-2">
        <Button label="Cancel" kind="secondary" onPress={onClose} />
        <Button
          label={busy ? (email.trim() ? 'Sending…' : 'Adding…') : email.trim() ? 'Add and email invite' : 'Add student'}
          disabled={!name.trim() || !emailOk || busy}
          onPress={() => void submit()}
        />
      </View>
    </>
  );
}

/** Email a student their invite: the address, an optional note, Send. */
function EmailInviteForm({ lessonId, name, initialEmail, sentTo, sentAt, now }: { lessonId: Id<'lessonStudents'>; name: string; initialEmail: string; sentTo: string | null; sentAt: number | null; now: number }) {
  const { colors } = useAppTheme();
  const success = useGradeColors().correct;
  const send = useAction(api.lessons.emailInvite);
  const [email, setEmail] = useState(initialEmail);
  const [message, setMessage] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const valid = EMAIL_RE.test(email.trim());

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await send({ id: lessonId, email, message: message.trim() || undefined });
      setResult({ ok: true, text: `Invite emailed to ${res.sentTo}.` });
      setMessage('');
      setNoteOpen(false);
    } catch (e) {
      setResult({ ok: false, text: errorText(e, "Couldn't send the email.") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="gap-2">
      <Field value={email} onChangeText={setEmail} placeholder={`${name}'s email`} label={`${name}'s email`} />
      {noteOpen ? (
        <Field value={message} onChangeText={setMessage} multiline placeholder="A note to go with it (optional)" label="A note" />
      ) : (
        <Pressable onPress={() => setNoteOpen(true)} className="self-start py-1">
          <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.muted }}>
            + Add a note to the email
          </Text>
        </Pressable>
      )}
      <View className="flex-row items-center gap-2">
        <View className="flex-1">
          {result ? (
            <Text className="font-ui text-xs" style={{ color: result.ok ? success : colors.danger }}>
              {result.text}
            </Text>
          ) : sentTo ? (
            <Text className="font-ui text-xs" style={{ color: colors.muted }}>
              Emailed to {sentTo}
              {sentAt ? ` · ${ago(sentAt, now)}` : ''}
            </Text>
          ) : null}
        </View>
        <SmallButton primary label={busy ? 'Sending…' : sentTo ? 'Email it again' : 'Email invite'} disabled={!valid || busy} onPress={() => void submit()} />
      </View>
    </View>
  );
}

/** A student who hasn't joined yet: email them their invite, or share the link yourself. */
export function InviteCard({
  lessonId,
  name,
  code,
  inviteEmail,
  invitedAt,
  now,
}: {
  lessonId: Id<'lessonStudents'>;
  name: string;
  code: string;
  inviteEmail: string | null;
  invitedAt: number | null;
  now: number;
}) {
  const { colors } = useAppTheme();
  const url = inviteUrl(code);
  return (
    <View className="gap-4 rounded-xl p-4" style={{ backgroundColor: colors.surface }}>
      <View className="gap-2">
        <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
          Email {name} their invite
        </Text>
        <EmailInviteForm lessonId={lessonId} name={name} initialEmail={inviteEmail ?? ''} sentTo={inviteEmail} sentAt={invitedAt} now={now} />
      </View>
      <View className="gap-2 pt-3" style={{ borderTopWidth: 1, borderColor: colors['surface-hover'] }}>
        <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
          …or send the link yourself
        </Text>
        <Text className="font-ui text-xs leading-4" style={{ color: colors.muted }}>
          They sign in (or sign up, free) and join — everything you add here is waiting for them, and your routines go straight into their Shed Log.
        </Text>
        <View className="flex-row items-center gap-2 rounded-lg py-1 pl-3 pr-1" style={{ backgroundColor: colors.background }}>
          <Text numberOfLines={1} selectable className="font-ui flex-1 text-xs" style={{ color: colors.foreground }}>
            {url}
          </Text>
          <SmallButton Icon={ShareIcon} label="Share" onPress={() => void shareLink('Lessons with me on soniroll', url)} />
        </View>
      </View>
    </View>
  );
}

/** "Join with an invite": paste the link your teacher sent (or just its code). */
export function JoinCodeSheet({ visible, onClose, onCode }: { visible: boolean; onClose: () => void; onCode: (code: string) => void }) {
  return (
    <ToolSheet visible={visible} onClose={onClose} title="Join with an invite">
      {visible ? <JoinCodeForm onClose={onClose} onCode={onCode} /> : null}
    </ToolSheet>
  );
}

function JoinCodeForm({ onClose, onCode }: { onClose: () => void; onCode: (code: string) => void }) {
  const { colors } = useAppTheme();
  const [text, setText] = useState('');
  const code = inviteCodeFrom(text);
  return (
    <>
      <Text className="font-ui text-sm leading-5" style={{ color: colors.muted }}>
        Paste the invite link your teacher sent you (it has /lessons/join in it), or just its code.
      </Text>
      <Field value={text} onChangeText={setText} placeholder="https://www.soniroll.com/lessons/join?invite=…" autoFocus onSubmit={() => code && onCode(code)} label="Invite link" />
      {text.trim() && !code ? <ErrorLine>That doesn&apos;t look like an invite link.</ErrorLine> : null}
      <View className="flex-row justify-end gap-2">
        <Button label="Cancel" kind="secondary" onPress={onClose} />
        <Button label="Open the invite" disabled={!code} onPress={() => code && onCode(code)} />
      </View>
    </>
  );
}
