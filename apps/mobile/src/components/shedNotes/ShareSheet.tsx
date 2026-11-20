import { api } from '@jam-practice/convex/_generated/api';
import type { Id } from '@jam-practice/convex/_generated/dataModel';
import * as Clipboard from 'expo-clipboard';
import { useMutation, useQuery } from 'convex/react';
import { useDeferredValue, useEffect, useState } from 'react';
import { Pressable, Share, Text, TextInput, View } from 'react-native';

import { Dropdown } from '@/components/Dropdown';
import { CheckIcon, CloseIcon, LinkIcon, ShareIcon } from '@/components/icons';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { SwitchRow } from '@/components/SwitchRow';
import { Segmented } from '@/components/tool/reward';
import { ToolSheet } from '@/components/tool/SettingChip';
import { Button } from '@/components/ui';
import { UserAvatar } from '@/components/UserAvatar';
import { errorText, noteLinkUrl } from '@/lib/useShedNotes';
import { useAppTheme } from '@/theme/ThemeProvider';

type Role = 'read' | 'write';
type LinkAccess = 'off' | 'invited' | 'anyone';

const ROLES: { value: Role; label: string }[] = [
  { value: 'read', label: 'Can view' },
  { value: 'write', label: 'Can edit' },
];

const LINK: { value: LinkAccess; label: string }[] = [
  { value: 'off', label: 'No link' },
  { value: 'invited', label: 'Only people added here' },
  { value: 'anyone', label: 'Anyone with the link can view' },
];

const DEPTH: { value: 'all' | 'one'; label: string }[] = [
  { value: 'all', label: 'Every level' },
  { value: 'one', label: 'One level' },
];

/**
 * Share one of your notes (the website's `ShareDialog`): add people by username (public profiles
 * are suggested as you type; a private account by its exact username) as "Can view" or "Can edit",
 * also share the notes it links to, and set its link — off, only the people added, or anyone with
 * it (view only) — to copy or send.
 */
export function ShareSheet({ noteId, title, visible, onClose }: { noteId: string; title: string; visible: boolean; onClose: () => void }) {
  const { colors, derived } = useAppTheme();
  const id = noteId as Id<'shedNotes'>;
  const sharing = useQuery(api.shedNoteShares.sharing, visible ? { noteId: id } : 'skip');
  const shareWith = useMutation(api.shedNoteShares.shareWith);
  const setRole = useMutation(api.shedNoteShares.setRole);
  const unshare = useMutation(api.shedNoteShares.unshare);
  const setLink = useMutation(api.shedNoteShares.setLink);
  const setShareLinked = useMutation(api.shedNoteShares.setShareLinked);
  const [name, setName] = useState('');
  const [role, setNewRole] = useState<Role>('read');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const typed = useDeferredValue(name.trim().replace(/^@/, ''));
  const suggestions = useQuery(api.shedNoteShares.suggest, visible && typed ? { q: typed } : 'skip');
  const already = new Set((sharing?.people ?? []).map((p) => p.username));
  const shown = (suggestions ?? []).filter((s) => !already.has(s.username)).slice(0, 5);

  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => setStatus(null), 2500);
    return () => clearTimeout(t);
  }, [status]);

  async function add(username: string) {
    const u = username.trim().replace(/^@/, '');
    if (!u) return;
    setBusy(true);
    setError(null);
    try {
      const added = await shareWith({ noteId: id, username: u, role });
      setName('');
      setStatus(`Shared with @${added}`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function copy(token: string) {
    try {
      await Clipboard.setStringAsync(noteLinkUrl(token));
      setStatus('Link copied');
    } catch {
      setError("Couldn't copy the link.");
    }
  }

  const access: LinkAccess = sharing?.link?.access ?? 'off';
  const fail = (e: unknown) => setError(errorText(e));

  return (
    <ToolSheet visible={visible} onClose={onClose} title={`Share “${title}”`}>
      <View className="gap-2">
        <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.muted }}>
          Add people by username
        </Text>
        <TextInput
          value={name}
          onChangeText={(t) => {
            setName(t);
            setError(null);
          }}
          onSubmitEditing={() => void add(name)}
          placeholder="@username"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="send"
          className="font-ui text-base"
          style={{ color: colors.foreground, backgroundColor: derived.fill, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 }}
        />
        {name.trim() && shown.length ? (
          <View className="gap-1">
            {shown.map((s) => (
              <Pressable
                key={s.username}
                onPress={() => void add(s.username)}
                android_ripple={{ color: colors['surface-hover'] }}
                className="flex-row items-center gap-2 overflow-hidden rounded-lg px-2 py-1.5"
                style={{ backgroundColor: derived.fill }}
              >
                <UserAvatar url={s.avatarUrl} size="sm" />
                <Text numberOfLines={1} className="font-ui-semibold flex-1 text-sm font-semibold" style={{ color: colors.foreground }}>
                  @{s.username}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <Segmented label="What they can do" value={role} options={ROLES} onChange={setNewRole} />
        <Text className="font-ui text-xs" style={{ color: colors.muted }}>
          Private accounts aren&apos;t suggested — type their exact username.
        </Text>
        <Button label={busy ? 'Sharing…' : 'Share'} disabled={busy || !name.trim()} onPress={() => void add(name)} />
      </View>

      {sharing === undefined ? (
        <View className="items-center py-4">
          <LoadingSpinner />
        </View>
      ) : sharing ? (
        <>
          {sharing.people.length > 0 ? (
            <View className="gap-1.5">
              <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.muted }}>
                Shared with
              </Text>
              {sharing.people.map((p) => {
                const label = p.username ? `@${p.username}` : (p.name ?? 'Someone');
                return (
                  <View key={p.userId} className="flex-row items-center gap-2 rounded-lg px-2 py-1.5" style={{ backgroundColor: derived.fill }}>
                    <UserAvatar url={p.avatarUrl} size="sm" />
                    <Text numberOfLines={1} className="font-ui-semibold flex-1 text-sm font-semibold" style={{ color: colors.foreground }}>
                      {label}
                    </Text>
                    <Dropdown value={p.role} options={ROLES} onChange={(r) => void setRole({ noteId: id, userId: p.userId, role: r }).catch(fail)} />
                    <Pressable
                      onPress={() => void unshare({ noteId: id, userId: p.userId }).catch(fail)}
                      accessibilityRole="button"
                      accessibilityLabel={`Stop sharing with ${label}`}
                      hitSlop={6}
                      className="h-9 w-9 items-center justify-center rounded-full"
                    >
                      <CloseIcon color={colors.muted} size={18} />
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ) : null}

          {sharing.linked.length > 0 || sharing.shareLinked ? (
            <View className="gap-2">
              <SwitchRow
                label={`Also share linked notes (${sharing.linked.length})`}
                checked={sharing.shareLinked}
                onChange={(on) => {
                  setError(null);
                  void setShareLinked({ noteId: id, on })
                    .then(() => setStatus(on ? 'Linked notes shared too' : 'Linked notes not shared'))
                    .catch(fail);
                }}
                hint="The people above (with the same Can view or Can edit) and the link can also open the notes this one links to — every level (the notes those link to, and so on) or just one. It follows the links: a note you link later is shared too, one you unlink isn't any more."
              />
              {sharing.shareLinked ? (
                <Segmented label="How deep" value={sharing.shareDepth} options={DEPTH} onChange={(depth) => void setShareLinked({ noteId: id, on: true, depth }).catch(fail)} />
              ) : null}
              {sharing.shareLinked && sharing.linked.length > 0 ? (
                <Text className="font-ui text-xs" style={{ color: colors.muted }}>
                  Also shared:{' '}
                  <Text className="font-ui-semibold font-semibold" style={{ color: colors.foreground }}>
                    {sharing.linked.join(', ')}
                  </Text>
                </Text>
              ) : null}
            </View>
          ) : null}

          <View className="gap-2">
            <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.muted }}>
              Link
            </Text>
            <Dropdown
              value={access}
              options={LINK}
              onChange={(a) => {
                setError(null);
                void setLink({ noteId: id, access: a })
                  .then((token) => {
                    // Turning the link on copies it, ready to send.
                    if (token && access === 'off') void copy(token);
                  })
                  .catch(fail);
              }}
            />
            <Text className="font-ui text-xs leading-5" style={{ color: colors.muted }}>
              {access === 'off'
                ? 'Only the people above can open this note, from their Shed Notes.'
                : access === 'invited'
                  ? 'The link opens the note for you and the people above, signed in. Anyone else is asked to sign in, or told it isn’t shared with them.'
                  : 'Anyone with the link can read the note, no account needed. Only the people above can edit it.'}
            </Text>
            {sharing.link ? (
              <View className="gap-2">
                <View className="flex-row items-center gap-2 rounded-lg px-3 py-2.5" style={{ backgroundColor: colors.background }}>
                  <LinkIcon color={colors.muted} size={16} />
                  <Text numberOfLines={1} selectable className="font-ui flex-1 text-sm" style={{ color: colors.foreground }}>
                    {noteLinkUrl(sharing.link.token)}
                  </Text>
                </View>
                <View className="flex-row gap-2">
                  <Button label="Copy" kind="secondary" style={{ flex: 1 }} onPress={() => void copy(sharing.link!.token)} />
                  <Button label="Send" kind="secondary" Icon={ShareIcon} style={{ flex: 1 }} onPress={() => void Share.share({ message: noteLinkUrl(sharing.link!.token) }).catch(() => {})} />
                </View>
              </View>
            ) : null}
          </View>
        </>
      ) : null}

      {status ? (
        <View className="flex-row items-center gap-1.5">
          <CheckIcon color={colors.accent} size={16} />
          <Text className="font-ui text-sm" style={{ color: colors.accent }}>
            {status}
          </Text>
        </View>
      ) : null}
      {error ? (
        <Text className="font-ui text-sm" style={{ color: colors.danger }}>
          {error}
        </Text>
      ) : null}
    </ToolSheet>
  );
}
