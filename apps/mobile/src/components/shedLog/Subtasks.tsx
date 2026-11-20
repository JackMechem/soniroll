import type { Subtask } from '@jam-practice/core/practiceLog';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { CloseIcon, PlusIcon } from '@/components/icons';
import { CheckBox, Field, GhostIcon } from '@/components/shedLog/parts';
import { useAppTheme } from '@/theme/ThemeProvider';

/** A task's checklist (the website's `Subtasks`): small checkboxes, and — when `onAdd` is given —
    a "+ Subtask" box. */
export function Subtasks({
  items,
  isDone,
  onToggle,
  onAdd,
  onRemove,
  color,
}: {
  items: Subtask[];
  isDone: (id: string) => boolean;
  onToggle: (id: string) => void;
  onAdd?: (title: string) => void;
  onRemove?: (id: string) => void;
  color: string;
}) {
  const { colors } = useAppTheme();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  if (!items.length && !onAdd) return null;
  const doneCount = items.filter((x) => isDone(x.id)).length;
  return (
    <View className="mt-1 gap-0.5">
      {items.map((x) => {
        const done = isDone(x.id);
        return (
          <View key={x.id} className="min-h-9 flex-row items-center gap-2">
            <Pressable
              onPress={() => onToggle(x.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: done }}
              accessibilityLabel={x.title}
              className="flex-1 flex-row items-center gap-2.5 py-1"
            >
              <CheckBox checked={done} color={color} size={18} />
              <Text
                numberOfLines={2}
                className="font-ui flex-1 text-sm"
                style={{ color: done ? colors.muted : colors.foreground, textDecorationLine: done ? 'line-through' : 'none' }}
              >
                {x.title}
              </Text>
            </Pressable>
            {onRemove ? <GhostIcon Icon={CloseIcon} label={`Remove ${x.title}`} onPress={() => onRemove(x.id)} size={14} /> : null}
          </View>
        );
      })}
      {items.length > 1 ? (
        <Text className="font-ui text-xs" style={{ color: colors.muted, fontVariant: ['tabular-nums'] }}>
          {doneCount}/{items.length} subtasks
        </Text>
      ) : null}
      {onAdd ? (
        adding ? (
          <Field
            value={title}
            onChangeText={setTitle}
            autoFocus
            placeholder="Add a subtask"
            onSubmit={() => {
              if (title.trim()) onAdd(title.trim());
              else setAdding(false);
              setTitle('');
            }}
          />
        ) : (
          <Pressable onPress={() => setAdding(true)} accessibilityRole="button" hitSlop={6} className="flex-row items-center gap-1 self-start py-1">
            <PlusIcon color={colors.muted} size={14} />
            <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.muted }}>
              Subtask
            </Text>
          </Pressable>
        )
      ) : null}
    </View>
  );
}
