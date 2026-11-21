import { api } from '@jam-practice/convex/_generated/api';
import { cleanFolder } from '@jam-practice/core/shedNotes';
import { sortByText } from '@jam-practice/core/sortText';
import { useQuery } from 'convex/react';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { CheckIcon } from '@/components/icons';
import { FolderClosedIcon } from '@/components/shedNotes/icons';
import { ToolSheet } from '@/components/tool/SettingChip';
import { Button } from '@/components/ui';
import { useNoteList } from '@/lib/useShedNotes';
import { useAppTheme } from '@/theme/ThemeProvider';
import { TextInput } from '@/components/ThemedTextInput';

/** Every folder: the ones made on their own and the ones notes are in (with their parents). */
export function useAllFolders(): string[] {
  const notes = useNoteList();
  const made = useQuery(api.shedNotes.folders);
  return useMemo(() => {
    const all = new Set<string>();
    const add = (path: string) => {
      const parts = path.split('/').filter(Boolean);
      for (let i = 1; i <= parts.length; i++) all.add(parts.slice(0, i).join('/'));
    };
    for (const p of made ?? []) add(p);
    for (const n of notes ?? []) if (n.folder) add(n.folder);
    // Parents before children, A–Z within a level ("A", "A/B", "B").
    return sortByText([...all], (p) => p.split('/').join('\u0001'));
  }, [made, notes]);
}

/**
 * Pick a folder (the phone's stand-in for dragging into one): the top level, every folder (indented
 * by depth), or a new one typed in. `current` is ticked; `exclude` (a folder being moved) and the
 * folders inside it aren't offered.
 */
export function FolderPickSheet({
  visible,
  title,
  current,
  exclude,
  onClose,
  onPick,
}: {
  visible: boolean;
  title: string;
  current: string | null;
  exclude?: string;
  onClose: () => void;
  onPick: (folder: string) => void;
}) {
  const { colors, derived } = useAppTheme();
  const folders = useAllFolders();
  const [typed, setTyped] = useState('');
  const choices = ['', ...folders.filter((f) => !exclude || (f !== exclude && !f.startsWith(`${exclude}/`)))];
  const pick = (f: string) => {
    onClose();
    setTyped('');
    onPick(f);
  };
  return (
    <ToolSheet visible={visible} onClose={onClose} title={title}>
      <View className="flex-row items-center gap-2">
        <TextInput
          value={typed}
          onChangeText={setTyped}
          placeholder="New folder, e.g. Scales/Major"
          placeholderTextColor={colors.muted}
          onSubmitEditing={() => cleanFolder(typed) && pick(cleanFolder(typed))}
          className="font-ui flex-1 text-base"
          style={{ color: colors.foreground, backgroundColor: derived.fill, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 }}
        />
        <Button label="Move" disabled={!cleanFolder(typed)} onPress={() => pick(cleanFolder(typed))} />
      </View>
      <View className="gap-1">
        {choices.map((f) => {
          const depth = f ? f.split('/').length - 1 : 0;
          const name = f ? f.slice(f.lastIndexOf('/') + 1) : 'Top level';
          return (
            <Pressable
              key={f || '(top)'}
              onPress={() => pick(f)}
              android_ripple={{ color: colors['surface-hover'] }}
              className="min-h-[44px] flex-row items-center gap-2.5 overflow-hidden rounded-lg px-3"
              style={{ marginLeft: depth * 16, backgroundColor: derived.fill }}
            >
              <FolderClosedIcon color={colors.muted} size={18} />
              <Text numberOfLines={1} className={`flex-1 text-sm ${f ? 'font-ui-semibold font-semibold' : 'font-ui'}`} style={{ color: f ? colors.foreground : colors.muted }}>
                {name}
              </Text>
              {current === f ? <CheckIcon color={colors.accent} size={18} /> : null}
            </Pressable>
          );
        })}
      </View>
    </ToolSheet>
  );
}
