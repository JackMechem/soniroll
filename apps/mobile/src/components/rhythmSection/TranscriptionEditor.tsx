import type { Transcription } from '@jam-practice/core/bassTranscription';
import { useState, type ReactNode } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { PencilIcon, TrashIcon } from '@/components/icons';
import { SAVE_LABEL, useAutosave } from '@/components/notation/autosave';
import ScoreEditor, { TempoInput } from '@/components/notation/ScoreEditor';
import { Field } from '@/components/tool/ear';
import { ToolSheet } from '@/components/tool/SettingChip';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * A bass transcription in Rhythm Section's Bass players — the website's `TranscriptionEditor`
 * (`apps/web/components/bassgenius/TranscriptionEditor.tsx`): the notation editor in the bass clef
 * with upright bass playback, and the transcription's title, save state, Details (tune, recording,
 * tempo, notes) and Delete around it. `back` is the way back to the player, drawn above the title.
 */
export function TranscriptionEditor({
  initial,
  back,
  onSave,
  onDelete,
}: {
  initial: Transcription;
  back: ReactNode;
  onSave: (t: Transcription) => Promise<void>;
  onDelete: () => void;
}) {
  const { colors, derived } = useAppTheme();
  const { change, saveState } = useAutosave(onSave);
  const [details, setDetails] = useState(false);
  return (
    <ScoreEditor
      initial={initial}
      onChange={change}
      sound="upright-bass"
      safeBottom={false}
      header={(t, setMeta) => (
        <View className="gap-2">
          <View className="flex-row items-center gap-2">
            <View className="flex-1 flex-row">{back}</View>
            <Text className="font-ui text-xs" style={{ color: colors.muted }} accessibilityLiveRegion="polite">
              {SAVE_LABEL[saveState]}
            </Text>
            <Pressable
              onPress={() => setDetails(true)}
              accessibilityRole="button"
              android_ripple={{ color: colors['surface-hover'] }}
              className="h-9 flex-row items-center gap-1 overflow-hidden rounded-lg px-3"
              style={{ backgroundColor: derived.fill }}
            >
              <PencilIcon color={colors.foreground} size={16} />
              <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
                Details
              </Text>
            </Pressable>
            <Pressable
              onPress={onDelete}
              accessibilityRole="button"
              accessibilityLabel="Delete transcription"
              android_ripple={{ color: colors['surface-hover'] }}
              className="h-9 w-9 items-center justify-center overflow-hidden rounded-lg"
              style={{ backgroundColor: derived.fill }}
            >
              <TrashIcon color={colors.muted} size={18} />
            </Pressable>
          </View>
          <TextInput
            value={t.title}
            onChangeText={(title) => setMeta({ title })}
            accessibilityLabel="Title"
            placeholder="Untitled transcription"
            placeholderTextColor={colors.muted}
            className="font-ui-bold text-xl font-bold"
            style={{ color: colors.foreground, paddingVertical: 2 }}
          />
          <ToolSheet visible={details} onClose={() => setDetails(false)} title="Details">
            <Field label="Tune">
              <DetailInput value={t.tune} onChange={(tune) => setMeta({ tune })} placeholder="All the Things You Are" />
            </Field>
            <Field label="Recording">
              <DetailInput value={t.source} onChange={(source) => setMeta({ source })} placeholder="Album, track, year, time" />
            </Field>
            <Field label="Tempo (BPM)">
              <TempoInput value={t.tempo ?? null} onChange={(tempo) => setMeta({ tempo })} />
            </Field>
            <Field label="Notes">
              <DetailInput value={t.comments} onChange={(comments) => setMeta({ comments })} multiline />
            </Field>
          </ToolSheet>
        </View>
      )}
    />
  );
}

function DetailInput({ value, onChange, placeholder, multiline }: { value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean }) {
  const { colors } = useAppTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={colors.muted}
      multiline={multiline}
      className={`font-ui rounded-lg px-3 text-base ${multiline ? 'min-h-20 py-2' : 'h-11'}`}
      style={{ backgroundColor: colors.background, color: colors.foreground, textAlignVertical: multiline ? 'top' : 'center' }}
    />
  );
}
