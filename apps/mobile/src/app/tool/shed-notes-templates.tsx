import { api } from '@jam-practice/convex/_generated/api';
import type { Id } from '@jam-practice/convex/_generated/dataModel';
import { templateVars } from '@jam-practice/core/noteTemplates';
import { useConvexAuth } from '@convex-dev/auth/react';
import { useMutation } from 'convex/react';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PlusIcon, TrashIcon } from '@/components/icons';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { useBackWithin } from '@/components/scoreWriter/useBackWithin';
import { FilePickSheet } from '@/components/shedNotes/FilePickSheet';
import { TemplatesIcon } from '@/components/shedNotes/icons';
import { NoteEditor, type EditorHandle } from '@/components/shedNotes/NoteEditor';
import { ScoreDialog } from '@/components/shedNotes/ScoreDialog';
import { ShedNotesGate } from '@/components/shedNotes/ShedNotesGate';
import { EmptyState, IconButton, ListRow } from '@/components/ui';
import { insertFileLine, insertScoreBlock } from '@/lib/shedNotes/format';
import { useKeyboardHeight } from '@/lib/useKeyboardHeight';
import { errorText, useNoteList, useNotesConfig, useTemplates, type NoteTemplate } from '@/lib/useShedNotes';
import { useAppTheme } from '@/theme/ThemeProvider';
import { TextInput } from '@/components/ThemedTextInput';

type Patch = { name?: string; title?: string; body?: string };

/**
 * Shed Notes templates on the phone (the website's Templates page): notes to start from, kept
 * apart from your notes. Each has a name, the title new notes get, and its text, written like a
 * note. {{name}} anywhere is a blank that's asked for when a note is made from it ({{date}},
 * {{time}} and {{title}} fill themselves). Saved as you type.
 */
function TemplatesScreen() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const templates = useTemplates();
  if (isLoading) return <ScreenSpinner />;
  if (!isAuthenticated) return <ShedNotesGate />;
  if (templates === undefined) return <ScreenSpinner />;
  return <Templates templates={templates} />;
}

export default withScreenLoader(TemplatesScreen);

function Templates({ templates }: { templates: NoteTemplate[] }) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const createMut = useMutation(api.shedNoteTemplates.create);
  const updateMut = useMutation(api.shedNoteTemplates.update);
  const removeMut = useMutation(api.shedNoteTemplates.remove);
  const [openId, setOpenId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<NoteTemplate | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const open = templates.find((t) => t.id === openId) ?? null;

  // Typing is saved a moment after it stops (and when leaving the template).
  const pending = useRef<{ id: string; patch: Patch } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const p = pending.current;
    pending.current = null;
    if (p) void updateMut({ id: p.id as Id<'shedNoteTemplates'>, ...p.patch }).catch((e) => setNotice(errorText(e)));
  }, [updateMut]);
  const change = useCallback(
    (id: string, patch: Patch) => {
      if (pending.current && pending.current.id !== id) flush();
      pending.current = { id, patch: { ...(pending.current?.patch ?? {}), ...patch } };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 700);
    },
    [flush],
  );
  useEffect(() => () => flush(), [flush]);
  useBackWithin(!!openId, () => {
    Keyboard.dismiss();
    flush();
    setOpenId(null);
  });

  async function newTemplate() {
    try {
      const made = await createMut({ name: 'New template', body: '' });
      setOpenId(made.id);
    } catch (e) {
      setNotice(errorText(e));
    }
  }

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          title: open ? 'Template' : 'Templates',
          headerRight: open
            ? () => <IconButton Icon={TrashIcon} label="Delete this template" onPress={() => setDeleting(open)} />
            : () => <IconButton primary Icon={PlusIcon} label="New template" onPress={() => void newTemplate()} />,
        }}
      />
      {notice ? (
        <Pressable onPress={() => setNotice(null)} className="mx-4 mb-2 rounded-lg px-3 py-2" style={{ backgroundColor: colors.surface }}>
          <Text className="font-ui text-sm" style={{ color: colors.danger }}>
            {notice}
          </Text>
        </Pressable>
      ) : null}
      {open ? (
        <TemplateEditor key={open.id} template={open} onChange={(patch) => change(open.id, patch)} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 12, paddingBottom: insets.bottom + 32 }}>
          {templates.length === 0 ? (
            <EmptyState
              Icon={TemplatesIcon}
              title="No templates yet"
              body="A template is a note to start from. Put {{blanks}} in it, like {{tune}} or {{student}}, and you fill them in when you make a note from it."
              action={{ label: 'New template', Icon: PlusIcon, onPress: () => void newTemplate() }}
            />
          ) : (
            <View className="gap-2">
              {templates.map((t) => (
                <ListRow key={t.id} icon={<TemplatesIcon color={colors.muted} size={20} />} title={t.name} detail={t.title ? `Title: ${t.title}` : 'Asks for a title'} onPress={() => setOpenId(t.id)} />
              ))}
            </View>
          )}
        </ScrollView>
      )}
      <ConfirmDialog
        visible={!!deleting}
        title={`Delete the template "${deleting?.name ?? ''}"?`}
        message="Notes made from it stay as they are."
        confirmLabel="Delete"
        onConfirm={() => {
          const t = deleting;
          setDeleting(null);
          if (!t) return;
          pending.current = null;
          setOpenId(null);
          void removeMut({ id: t.id as Id<'shedNoteTemplates'> }).catch((e) => setNotice(errorText(e)));
        }}
        onCancel={() => setDeleting(null)}
      />
    </View>
  );
}

/** One template: its name, the title notes made from it get, and its text (with notation and
    files, like a note). */
function TemplateEditor({ template, onChange }: { template: NoteTemplate; onChange: (patch: Patch) => void }) {
  const { colors, derived } = useAppTheme();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const cfg = useNotesConfig();
  const notes = useNoteList();
  const [name, setName] = useState(template.name);
  const [title, setTitle] = useState(template.title);
  const [body, setBody] = useState(template.body);
  const [notation, setNotation] = useState(false);
  const [pickingFile, setPickingFile] = useState(false);
  const editor = useRef<EditorHandle>(null);
  const vars = templateVars(title, body);
  const field = { color: colors.foreground, backgroundColor: derived.fill, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 };

  return (
    <View className="flex-1" style={{ paddingBottom: keyboard ? keyboard + insets.bottom : insets.bottom }}>
      <View className="gap-2 px-4 pb-2">
        <TextInput
          value={name}
          onChangeText={(v) => {
            setName(v);
            onChange({ name: v });
          }}
          placeholder="Template name"
          placeholderTextColor={colors.muted}
          accessibilityLabel="Template name"
          className="font-ui-extrabold text-2xl font-extrabold"
          style={{ color: colors.foreground, paddingVertical: 2 }}
        />
        <TextInput
          value={title}
          onChangeText={(v) => {
            setTitle(v);
            onChange({ title: v });
          }}
          placeholder="New notes' title, e.g. {{date}} lesson with {{student}}"
          placeholderTextColor={colors.muted}
          accessibilityLabel="Title for new notes"
          className="font-ui text-[15px]"
          style={field}
        />
        <Text numberOfLines={2} className="font-ui text-xs" style={{ color: colors.muted }}>
          {vars.length ? `Asked for: ${vars.join(', ')}` : 'Put {{name}} anywhere for a blank to fill in. {{date}}, {{time}} and {{title}} fill themselves.'}
          {title.trim() ? '' : ' No title: you’re asked for one.'}
        </Text>
      </View>
      <NoteEditor
        handleRef={editor}
        value={body}
        onChange={(v) => {
          setBody(v);
          onChange({ body: v });
        }}
        notes={(notes ?? []).map((n) => ({ title: n.title, folder: n.folder }))}
        fontSize={Math.max(12, Math.min(28, cfg.config.fontSize || 16))}
        spellcheck={cfg.config.spellcheck}
        autoFocus={false}
        placeholder="The template's text — headings, checklists, {{blanks}}…"
        onNotation={() => setNotation(true)}
        onFile={() => setPickingFile(true)}
      />
      {notation ? <ScoreDialog scoreId={null} onClose={() => setNotation(false)} onDone={(id) => editor.current?.apply((t, s) => insertScoreBlock(t, s, id))} /> : null}
      <FilePickSheet visible={pickingFile} onClose={() => setPickingFile(false)} onPick={(n, ref) => editor.current?.apply((t, s) => insertFileLine(t, s, n, ref))} />
    </View>
  );
}
