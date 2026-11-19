import { api } from '@jam-practice/convex/_generated/api';
import { toPublicRoutine, type Routine } from '@jam-practice/core/practiceLog';
import { useMutation, useQuery } from 'convex/react';
import { useState } from 'react';
import { Share, Text, View } from 'react-native';

import { LinkIcon, ShareIcon, UsersIcon } from '@/components/icons';
import { Field, Muted, SmallButton } from '@/components/shedLog/parts';
import { ToolSheet } from '@/components/tool/SettingChip';
import { Button } from '@/components/ui';
import { useAppTheme } from '@/theme/ThemeProvider';

const SITE = 'https://www.soniroll.com';

/** Share a routine (the website's `RoutineShareDialog`): a link anyone can open (and add to their
    own Shed Log) — made, shared, or stopped — and a post to Community with a caption. Both show
    the routine as it is now. */
export function RoutineShareSheet({ routine, visible, onClose }: { routine: Routine; visible: boolean; onClose: () => void }) {
  const { colors } = useAppTheme();
  const shareId = useQuery(api.routines.shareFor, visible ? { routineId: routine.id } : 'skip');
  const postId = useQuery(api.communityTunes.postForRoutine, visible ? { routineId: routine.id } : 'skip');
  const share = useMutation(api.routines.share);
  const unshare = useMutation(api.routines.unshare);
  const create = useMutation(api.communityTunes.create);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState<'link' | 'post' | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const url = shareId ? `${SITE}/routine/${shareId}` : null;
  const name = routine.name || 'Routine';

  async function makeLink() {
    setBusy('link');
    setNote(null);
    try {
      const id = await share({ routineId: routine.id, routine: toPublicRoutine(routine) });
      const link = `${SITE}/routine/${id}`;
      await Share.share({ message: `${name} — ${link}`, url: link, title: name });
    } catch (e) {
      setNote(e instanceof Error ? e.message.replace(/^.*Uncaught Error: /, '').split('\n')[0] : "Couldn't make a link.");
    } finally {
      setBusy(null);
    }
  }

  async function post() {
    setBusy('post');
    setNote(null);
    try {
      await create({ title: name, description: caption.trim(), tunes: [], kind: 'routine', routineId: routine.id, payload: toPublicRoutine(routine) });
      setCaption('');
      setNote('Posted to Community.');
    } catch (e) {
      setNote(e instanceof Error ? e.message.replace(/^.*Uncaught Error: /, '').split('\n')[0] : "Couldn't post.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <ToolSheet visible={visible} onClose={onClose} title={`Share ${name}`}>
      <View className="gap-2">
        <View className="flex-row items-center gap-1.5">
          <LinkIcon color={colors.muted} size={16} />
          <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
            Share a link
          </Text>
        </View>
        <Muted>Anyone with the link can see the routine and add it to their own Shed Log. It always shows your latest version.</Muted>
        {url ? (
          <View className="h-10 justify-center rounded-lg px-3" style={{ backgroundColor: colors.background }}>
            <Text numberOfLines={1} className="font-ui text-sm" style={{ color: colors.foreground }}>
              {url}
            </Text>
          </View>
        ) : null}
        <View className="flex-row flex-wrap gap-2">
          <SmallButton label={busy === 'link' ? 'Making a link…' : shareId ? 'Share the link' : 'Make a link'} Icon={ShareIcon} primary disabled={busy !== null || shareId === undefined} onPress={() => void makeLink()} />
          {shareId ? <SmallButton label="Stop sharing" danger onPress={() => void unshare({ routineId: routine.id })} /> : null}
        </View>
      </View>
      <View className="gap-2" style={{ borderTopWidth: 1, borderColor: colors['surface-hover'], paddingTop: 16 }}>
        <View className="flex-row items-center gap-1.5">
          <UsersIcon color={colors.muted} size={16} />
          <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
            Post to Community
          </Text>
        </View>
        {postId ? (
          <Muted>You&apos;ve posted this routine. The post shows it as it is now.</Muted>
        ) : (
          <>
            <Field value={caption} onChangeText={setCaption} placeholder="Say something about it (optional)" multiline />
            <Button label={busy === 'post' ? 'Posting…' : 'Post'} onPress={() => void post()} disabled={busy !== null} />
          </>
        )}
      </View>
      {note ? <Muted>{note}</Muted> : null}
    </ToolSheet>
  );
}
