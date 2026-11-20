import { api } from '@jam-practice/convex/_generated/api';
import { fillTemplate, templateVars } from '@jam-practice/core/noteTemplates';
import { useConvex, useMutation } from 'convex/react';
import { useCallback, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { ToolSheet } from '@/components/tool/SettingChip';
import { Button } from '@/components/ui';
import type { NoteTemplate } from '@/lib/useShedNotes';
import { useAppTheme } from '@/theme/ThemeProvider';

/** A template's text with its blanks filled, and every score in it copied (so editing the music in
    the note doesn't change the template's) — the website's `instantiate`. */
export function useInstantiate() {
  const convex = useConvex();
  const createScore = useMutation(api.scores.create);
  return useCallback(
    async (t: NoteTemplate, values: Record<string, string>, title: string) => {
      let body = fillTemplate(t.body, values, { title });
      const ids = [...new Set([...body.matchAll(/^(```|~~~)\s*score\s*\n\s*(\S+)/gim)].map((m) => m[2]))];
      for (const id of ids) {
        const row = await convex.query(api.scores.get, { id });
        if (!row) continue;
        const copy = await createScore({ data: row.data });
        body = body.split(id).join(copy);
      }
      return body;
    },
    [convex, createScore],
  );
}

/** A template's title as it'll look, blanks shown as ‹name›. */
export const fillPreview = (title: string) => title.replace(/\{\{\s*([^{}\n]+?)\s*\}\}/g, (_m, name: string) => `‹${name.trim()}›`);

/**
 * Asks for a template's blanks before a note is made from it (or it's applied to a note) — the
 * website's `TemplateFillDialog`. The title box shows when a new note's template has no title of
 * its own; otherwise the title it'll get shows, filled in as you type.
 */
export function TemplateFillSheet({
  template,
  askTitle,
  confirmLabel,
  onSubmit,
  onCancel,
}: {
  template: NoteTemplate | null;
  askTitle: boolean;
  confirmLabel: string;
  onSubmit: (values: Record<string, string>, title: string) => void;
  onCancel: () => void;
}) {
  const { colors, derived } = useAppTheme();
  const [values, setValues] = useState<Record<string, string>>({});
  const [title, setTitle] = useState('');
  const [shown, setShown] = useState<string | null>(null);
  // A new template: start empty.
  if ((template?.id ?? null) !== shown) {
    setShown(template?.id ?? null);
    setValues({});
    setTitle('');
  }
  if (!template) return null;
  const vars = templateVars(template.title, template.body);
  const filledTitle = askTitle ? title.trim() : fillTemplate(template.title, values).trim();
  const ready = !askTitle || !!title.trim();
  const field = (label: string, value: string, set: (v: string) => void, autoFocus: boolean) => (
    <View key={label} className="gap-1">
      <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.muted }}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={set}
        autoFocus={autoFocus}
        placeholderTextColor={colors.muted}
        className="font-ui text-base"
        style={{ color: colors.foreground, backgroundColor: derived.fill, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 }}
      />
    </View>
  );
  return (
    <ToolSheet visible onClose={onCancel} title={template.name}>
      <Text className="font-ui text-sm" style={{ color: colors.muted }}>
        {vars.length || askTitle ? 'Fill in the blanks for the new note.' : 'This template has nothing to fill in.'}
      </Text>
      {askTitle ? field('Title', title, setTitle, true) : null}
      {vars.map((name, i) => field(name, values[name] ?? '', (v) => setValues((old) => ({ ...old, [name]: v })), !askTitle && i === 0))}
      {!askTitle && template.title.trim() ? (
        <Text className="font-ui text-xs" style={{ color: colors.muted }}>
          Title:{' '}
          <Text className="font-ui-semibold font-semibold" style={{ color: colors.foreground }}>
            {filledTitle || 'Untitled'}
          </Text>
        </Text>
      ) : null}
      <Button label={confirmLabel} disabled={!ready} onPress={() => ready && onSubmit(values, askTitle ? title.trim() : filledTitle)} />
    </ToolSheet>
  );
}
