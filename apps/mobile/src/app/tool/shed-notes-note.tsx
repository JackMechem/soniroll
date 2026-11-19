import { api } from '@jam-practice/convex/_generated/api';
import type { Id } from '@jam-practice/convex/_generated/dataModel';
import { useConvexAuth } from '@convex-dev/auth/react';
import { cleanTitle, noteSnippet, titleKey } from '@jam-practice/core/shedNotes';
import * as Clipboard from 'expo-clipboard';
import { useMutation } from 'convex/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { openBrowserAsync } from 'expo-web-browser';
import { useMemo, useRef, useState } from 'react';
import { Keyboard, Linking, Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet, type SheetAction } from '@/components/ActionSheet';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DotsVerticalIcon, FolderMoveIcon, PencilIcon, ShareIcon, TrashIcon } from '@/components/icons';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { useBackWithin } from '@/components/scoreWriter/useBackWithin';
import { FilePickSheet } from '@/components/shedNotes/FilePickSheet';
import { FolderPickSheet } from '@/components/shedNotes/FolderPickSheet';
import { CopyIcon, GearIcon, TemplatesIcon } from '@/components/shedNotes/icons';
import { LinksSection } from '@/components/shedNotes/LinksSection';
import { NoteEditor, type EditorHandle } from '@/components/shedNotes/NoteEditor';
import type { MarkdownActions } from '@/components/shedNotes/NoteMarkdown';
import { NoteView } from '@/components/shedNotes/NoteView';
import { ScoreDialog } from '@/components/shedNotes/ScoreDialog';
import { ShareSheet } from '@/components/shedNotes/ShareSheet';
import { ShedNotesGate } from '@/components/shedNotes/ShedNotesGate';
import { TemplateFillSheet, useInstantiate } from '@/components/shedNotes/TemplateFill';
import { Button } from '@/components/ui';
import { insertFileLine, insertScoreBlock, type Sel } from '@/lib/shedNotes/format';
import { lineRange, toggleTaskLine } from '@/lib/shedNotes/markdown';
import { useKeyboardHeight } from '@/lib/useKeyboardHeight';
import { SAVE_LABEL, errorText, useNote, useNoteList, useNotesConfig, useSharedWithMe, useTemplates, type NoteMeta, type NoteTemplate } from '@/lib/useShedNotes';
import { useAppTheme } from '@/theme/ThemeProvider';

/** The title a new note has until it's named ("Untitled", "Untitled - 2"). */
const DEFAULT_TITLE = /^Untitled( - \d+)?$/;

/** A title from a note's first line, once that line is finished (there's a line after it) — the
    website's rule, so a half-typed word never becomes the title. */
function titleFromBody(text: string): string | null {
  const lines = text.split('\n');
  const i = lines.findIndex((l) => l.trim());
  if (i < 0 || i === lines.length - 1) return null;
  const line = lines[i].trim();
  if (/^(```|~~~|---|\||!\[)/.test(line)) return null;
  return cleanTitle(noteSnippet(line, 80)) || null;
}

/**
 * One note on the phone (`?id=`, `&edit=1` to start writing) — the website's note pane made for
 * touch. It opens to **read**: the markdown drawn natively, checkboxes you can tick, `[[links]]`
 * that open the note (or make it), music and files in place, and under it what it's attached to,
 * backlinks, links and tags. Tap the text (or Edit) to **write**: a plain text box with a
 * formatting bar above the keyboard (`NoteEditor`); Done or Back goes back to reading. Saved a
 * moment after you stop typing. Opening a link pushes that note, so Back returns here.
 *
 * Not on the phone: vim keys and keyboard shortcuts, the command palette, per-note fonts and width,
 * Export as PDF (Copy as Markdown and Send instead), uploading new files (files already in your
 * Files can go in), and drawing older ABC notation (its text shows).
 */
function NoteScreen() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { id, edit } = useLocalSearchParams<{ id?: string; edit?: string }>();
  if (isLoading) return <ScreenSpinner />;
  if (!isAuthenticated) return <ShedNotesGate />;
  if (!id) return <Gone />;
  return <NotePage key={id} id={id} startEditing={edit === '1'} />;
}

export default withScreenLoader(NoteScreen);

function Gone() {
  const { colors } = useAppTheme();
  const router = useRouter();
  return (
    <View className="flex-1 items-center justify-center gap-3 p-6" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: '' }} />
      <Text className="font-ui text-sm" style={{ color: colors.muted }}>
        This note isn&apos;t there any more.
      </Text>
      <Button label="All notes" kind="secondary" onPress={() => router.navigate('/tool/shed-notes')} />
    </View>
  );
}

function NotePage({ id, startEditing }: { id: string; startEditing: boolean }) {
  const noteState = useNote(id);
  const notes = useNoteList();
  if (noteState.note === undefined || notes === undefined) return <ScreenSpinner />;
  if (noteState.note === null) return <Gone />;
  return <OpenNote noteState={noteState} note={noteState.note} notes={notes} startEditing={startEditing} />;
}

type LoadedNote = NonNullable<ReturnType<typeof useNote>['note']>;

function OpenNote({ noteState, note, notes, startEditing }: { noteState: ReturnType<typeof useNote>; note: LoadedNote; notes: NoteMeta[]; startEditing: boolean }) {
  const { colors, derived } = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const cfg = useNotesConfig();
  const templates = useTemplates();
  const shared = useSharedWithMe();
  const { setBody, flush, saveState, saveError } = noteState;
  const rename = useMutation(api.shedNotes.rename);
  const createMut = useMutation(api.shedNotes.create);
  const moveMut = useMutation(api.shedNotes.move);
  const removeMut = useMutation(api.shedNotes.remove);
  const setTemplateMut = useMutation(api.shedNotes.setTemplate);
  const instantiate = useInstantiate();

  const mine = note.role === 'owner';
  const canEdit = mine || note.role === 'write';
  const fontSize = Math.max(12, Math.min(28, cfg.config.fontSize || 16));

  // The text shown and edited. A change saved elsewhere (the website, a collaborator) comes in
  // when nothing typed here is waiting to be saved.
  const [text, setText] = useState(note.body);
  const [seenBody, setSeenBody] = useState(note.body);
  if (note.body !== seenBody) {
    setSeenBody(note.body);
    if (saveState === 'saved') setText(note.body);
  }
  const [editing, setEditing] = useState(startEditing && canEdit);
  const [startSel, setStartSel] = useState<Sel | undefined>(undefined);
  const [draft, setDraft] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ title: string; actions: SheetAction[] } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [moving, setMoving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [replacing, setReplacing] = useState<NoteTemplate | null>(null);
  const [filling, setFilling] = useState<{ template: NoteTemplate; mode: 'apply' | 'new'; done?: (title: string) => void } | null>(null);
  const [notation, setNotation] = useState<{ scoreId: string | null } | null>(null);
  const [pickingFile, setPickingFile] = useState(false);
  const autoTitled = useRef(false);
  const editor = useRef<EditorHandle>(null);
  const titleInput = useRef<TextInput>(null);

  const fail = (e: unknown) => setNotice(errorText(e));
  const byKey = useMemo(() => new Map(notes.map((n) => [titleKey(n.title), n])), [notes]);
  const titles = useMemo(() => notes.map((n) => ({ title: n.title, folder: n.folder })), [notes]);
  const openNote = (noteId: string) => router.push({ pathname: '/tool/shed-notes-note', params: { id: noteId } });

  function change(next: string) {
    setText(next);
    setBody(next);
    if (mine && draft === null && !autoTitled.current && DEFAULT_TITLE.test(note.title)) {
      const t = titleFromBody(next);
      if (t) {
        autoTitled.current = true;
        void rename({ id: note.id as Id<'shedNotes'>, title: t, unique: true }).catch(() => {});
      }
    }
  }

  function startEdit(sel?: Sel) {
    if (!canEdit) return;
    setStartSel(sel);
    setEditing(true);
  }
  function stopEdit() {
    Keyboard.dismiss();
    flush();
    setEditing(false);
  }
  // Back while writing goes back to reading first.
  useBackWithin(editing, stopEdit);

  async function commitTitle() {
    if (draft === null) return;
    const next = draft.trim();
    setDraft(null);
    if (!next || next === note.title) return;
    try {
      await rename({ id: note.id as Id<'shedNotes'>, title: next });
    } catch (e) {
      fail(e);
    }
  }

  async function createLinked(title: string) {
    try {
      await createMut({ title, folder: note.folder });
      return true;
    } catch (e) {
      fail(e);
      return false;
    }
  }

  const actions: MarkdownActions = {
    onTask: canEdit ? (line) => change(toggleTaskLine(text, line)) : undefined,
    onWikilink: (target) => {
      const key = titleKey(target);
      // Someone else's note: their note by that name when it's shared with you, else yours.
      if (!mine) {
        const theirs = shared?.find((s) => s.ownerId === note.ownerId && titleKey(s.title) === key);
        if (theirs) return openNote(theirs.id);
      }
      const hit = byKey.get(key);
      if (hit) return openNote(hit.id);
      if (!mine) return setNotice(`You don't have a note called “${target}”.`);
      // A link to a note that doesn't exist yet: made in this note's folder.
      void createMut({ title: target, folder: note.folder })
        .then((made) => openNote(made.id))
        .catch(fail);
    },
    onUrl: (href) => {
      const h = href.trim();
      if (/^https?:\/\//i.test(h)) void openBrowserAsync(h).catch(() => {});
      else if (/^www\./i.test(h)) void openBrowserAsync(`https://${h}`).catch(() => {});
      else if (h.startsWith('/') && !h.startsWith('//')) void openBrowserAsync(`https://www.soniroll.com${h}`).catch(() => {});
      else if (/^(mailto|tel):/i.test(h)) void Linking.openURL(h).catch(() => {});
    },
    onTag: (tag) => router.navigate({ pathname: '/tool/shed-notes', params: { q: `#${tag}` } }),
    onTapLine: canEdit
      ? (line) => {
          const at = lineRange(text, line).to;
          startEdit({ start: at, end: at });
        }
      : undefined,
    noteExists: (title) => byKey.has(titleKey(title)) || (!mine && !!shared?.some((s) => s.ownerId === note.ownerId && titleKey(s.title) === titleKey(title))),
  };

  /** Puts a template's text in place of the note's (and its title, if it has one). */
  async function applyTemplate(t: NoteTemplate, values: Record<string, string>, typedTitle: string) {
    try {
      const title = typedTitle || note.title;
      const body = await instantiate(t, values, title);
      change(body);
      await setTemplateMut({ id: note.id as Id<'shedNotes'>, templateId: t.id as Id<'shedNoteTemplates'> });
      if (typedTitle && typedTitle !== note.title) {
        const got = await rename({ id: note.id as Id<'shedNotes'>, title: typedTitle, unique: true });
        if (got !== typedTitle) setNotice(`You already had “${typedTitle}”, so this one is “${got}”`);
      }
    } catch (e) {
      fail(e);
    }
  }
  const askApply = (t: NoteTemplate) => (text.trim() ? setReplacing(t) : setFilling({ template: t, mode: 'apply' }));

  function openMenu() {
    const icon = (I: typeof PencilIcon, danger?: boolean) => <I color={danger ? colors.danger : colors.foreground} size={20} />;
    const template = note.templateId ? (templates?.find((t) => t.id === note.templateId)?.name ?? 'deleted') : null;
    setMenu({
      title: note.title,
      actions: [
        ...(mine
          ? [
              { key: 'share', icon: icon(ShareIcon), label: 'Share…', onPress: () => setSharing(true) },
              {
                key: 'rename',
                icon: icon(PencilIcon),
                label: 'Rename',
                onPress: () => {
                  setDraft(note.title);
                  setTimeout(() => titleInput.current?.focus(), 250);
                },
              },
              { key: 'move', icon: icon(FolderMoveIcon), label: note.folder ? `Move (in ${note.folder})` : 'Move to folder', onPress: () => setMoving(true) },
              ...(templates?.length
                ? [
                    {
                      key: 'template',
                      icon: icon(TemplatesIcon),
                      label: template ? `Change template (now ${template})…` : 'Apply a template…',
                      onPress: () => setMenu({ title: 'Apply a template to this note', actions: templates.map((t) => ({ key: t.id, icon: icon(TemplatesIcon), label: t.name, onPress: () => askApply(t) })) }),
                    },
                  ]
                : []),
            ]
          : []),
        {
          key: 'copy',
          icon: icon(CopyIcon),
          label: 'Copy as Markdown',
          onPress: () => void Clipboard.setStringAsync(text).then(() => setNotice('Copied the note’s text'), () => {}),
        },
        { key: 'send', icon: icon(ShareIcon), label: 'Send the text…', onPress: () => void Share.share({ title: note.title, message: `# ${note.title}\n\n${text}` }).catch(() => {}) },
        { key: 'settings', icon: icon(GearIcon), label: 'Shed Notes settings', onPress: () => router.push('/tool/shed-notes-settings') },
        ...(mine ? [{ key: 'delete', icon: icon(TrashIcon, true), label: 'Delete note', danger: true, onPress: () => setDeleting(true) }] : []),
      ],
    });
  }

  const titleField = (
    <TextInput
      ref={titleInput}
      value={draft ?? note.title}
      onChangeText={(t) => setDraft(t.replace(/\n/g, ' '))}
      onFocus={() => setDraft((d) => d ?? note.title)}
      onSubmitEditing={() => {
        void commitTitle();
        if (editing) editor.current?.focus();
      }}
      onEndEditing={() => void commitTitle()}
      editable={mine}
      multiline
      submitBehavior="blurAndSubmit"
      returnKeyType="done"
      accessibilityLabel="Note title"
      className="font-ui-extrabold text-[26px] font-extrabold"
      style={{ color: colors.foreground, paddingVertical: 2, lineHeight: 32 }}
    />
  );

  const header = (
    <Stack.Screen
      options={{
        title: '',
        headerRight: () => (
          <View className="flex-row items-center gap-1">
            {canEdit ? (
              <Text className="font-ui text-xs" style={{ color: saveState === 'error' ? colors.danger : colors.muted }} accessibilityLiveRegion="polite" accessibilityHint={saveError ?? undefined}>
                {SAVE_LABEL[saveState]}
              </Text>
            ) : null}
            {canEdit ? (
              <Pressable
                onPress={editing ? stopEdit : () => startEdit()}
                accessibilityRole="button"
                android_ripple={{ color: editing ? colors['accent-hover'] : colors['surface-hover'] }}
                className="ml-1 h-9 flex-row items-center gap-1 overflow-hidden rounded-full px-3.5"
                style={{ backgroundColor: editing ? colors.accent : derived.fill }}
              >
                {editing ? null : <PencilIcon color={colors.foreground} size={16} />}
                <Text className="font-ui-semibold text-sm font-semibold" style={{ color: editing ? colors['accent-foreground'] : colors.foreground }}>
                  {editing ? 'Done' : 'Edit'}
                </Text>
              </Pressable>
            ) : null}
            <Pressable onPress={openMenu} hitSlop={8} accessibilityLabel="Note options" className="h-9 w-9 items-center justify-center rounded-full">
              <DotsVerticalIcon color={colors.foreground} size={20} />
            </Pressable>
          </View>
        ),
      }}
    />
  );

  const sheets = (
    <>
      <ActionSheet visible={!!menu} title={menu?.title} actions={menu?.actions ?? []} onClose={() => setMenu(null)} />
      {mine ? <ShareSheet noteId={note.id} title={note.title} visible={sharing} onClose={() => setSharing(false)} /> : null}
      <FolderPickSheet visible={moving} title="Move to folder" current={note.folder} onClose={() => setMoving(false)} onPick={(folder) => void moveMut({ id: note.id as Id<'shedNotes'>, folder }).catch(fail)} />
      <ConfirmDialog
        visible={deleting}
        title={`Delete "${note.title}"?`}
        message="The note goes for good. Links to it in other notes stay, and make a new note if you open them."
        confirmLabel="Delete"
        onConfirm={() => {
          setDeleting(false);
          void removeMut({ id: note.id as Id<'shedNotes'> })
            .then(() => router.back())
            .catch(fail);
        }}
        onCancel={() => setDeleting(false)}
      />
      <ConfirmDialog
        visible={!!replacing}
        title={`Replace this note with “${replacing?.name ?? ''}”?`}
        message="Everything in the note now will be deleted and the template put in its place."
        confirmLabel="Replace"
        onConfirm={() => {
          const t = replacing;
          setReplacing(null);
          if (t) setFilling({ template: t, mode: 'apply' });
        }}
        onCancel={() => setReplacing(null)}
      />
      <TemplateFillSheet
        template={filling?.template ?? null}
        askTitle={!!filling && filling.mode === 'new' && !filling.template.title.trim()}
        confirmLabel={filling?.mode === 'new' ? 'Make note' : 'Apply'}
        onCancel={() => setFilling(null)}
        onSubmit={(values, typedTitle) => {
          const f = filling;
          setFilling(null);
          if (!f) return;
          if (f.mode === 'apply') return void applyTemplate(f.template, values, typedTitle);
          // A new note from a `[[` suggestion: made in this folder, then linked here.
          const title = typedTitle || 'Untitled';
          void instantiate(f.template, values, title)
            .then((body) => createMut({ title, folder: note.folder, body, templateId: f.template.id as Id<'shedNoteTemplates'> }))
            .then((made) => f.done?.(made.title))
            .catch(fail);
        }}
      />
      {notation ? (
        <ScoreDialog
          scoreId={notation.scoreId}
          onClose={() => setNotation(null)}
          onDone={(scoreId) => {
            if (!notation.scoreId) editor.current?.apply((t, s) => insertScoreBlock(t, s, scoreId));
          }}
        />
      ) : null}
      <FilePickSheet visible={pickingFile} onClose={() => setPickingFile(false)} onPick={(name, ref) => editor.current?.apply((t, s) => insertFileLine(t, s, name, ref))} />
    </>
  );

  const noticeView = notice ? (
    <Pressable onPress={() => setNotice(null)} className="mx-4 mb-2 rounded-lg px-3 py-2" style={{ backgroundColor: derived.fill }}>
      <Text className="font-ui text-sm" style={{ color: colors.foreground }}>
        {notice}
      </Text>
    </Pressable>
  ) : null;

  if (editing) {
    return (
      <View className="flex-1" style={{ backgroundColor: colors.background, paddingBottom: keyboard ? keyboard + insets.bottom : insets.bottom }}>
        {header}
        {noticeView}
        {mine ? <View className="px-4">{titleField}</View> : null}
        <NoteEditor
          handleRef={editor}
          value={text}
          onChange={change}
          notes={titles}
          templates={mine ? templates : undefined}
          fontSize={fontSize}
          spellcheck={cfg.config.spellcheck}
          initialSelection={startSel}
          placeholder="Start writing. [[ links a note, # makes a heading, - [ ] a checkbox."
          onNotation={mine ? () => setNotation({ scoreId: null }) : undefined}
          onFile={canEdit ? () => setPickingFile(true) : undefined}
          onCreateLinked={mine ? createLinked : undefined}
          onTemplateLink={mine ? (template, done) => setFilling({ template, mode: 'new', done }) : undefined}
        />
        {sheets}
      </View>
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      {header}
      <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: insets.bottom + 48, gap: 16 }}>
        {!mine ? (
          <View className="self-start rounded-md px-2 py-0.5" style={{ backgroundColor: derived.fill }}>
            <Text className="font-ui text-xs" style={{ color: colors.muted }}>
              @{note.owner ?? 'someone'} · {canEdit ? 'can edit' : 'view only'}
            </Text>
          </View>
        ) : note.folder ? (
          <Text numberOfLines={1} className="font-ui text-xs" style={{ color: colors.muted }}>
            {note.folder.replace(/\//g, ' / ')}
          </Text>
        ) : null}
        {mine ? titleField : (
          <Text className="font-ui-extrabold text-[26px] font-extrabold" style={{ color: colors.foreground, lineHeight: 32 }}>
            {note.title}
          </Text>
        )}
        {noticeView}

        {mine && !text.trim() ? (
          // An empty note: start it from a template.
          <View className="flex-row flex-wrap items-center gap-1.5">
            <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.muted }}>
              Start from a template:
            </Text>
            {(templates ?? []).slice(0, 6).map((t) => (
              <Pressable key={t.id} onPress={() => setFilling({ template: t, mode: 'apply' })} className="rounded-md px-2.5 py-1.5" style={{ backgroundColor: derived.fill }}>
                <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.foreground }}>
                  {t.name}
                </Text>
              </Pressable>
            ))}
            {(templates?.length ?? 0) > 6 ? (
              <Pressable onPress={openMenu} className="rounded-md px-2.5 py-1.5">
                <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.muted }}>
                  More…
                </Text>
              </Pressable>
            ) : null}
            {templates && templates.length === 0 ? (
              <Pressable onPress={() => router.push('/tool/shed-notes-templates')} className="rounded-md px-2.5 py-1.5">
                <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.muted }}>
                  Make a template
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {text.trim() ? (
          <NoteView body={text} fontSize={fontSize} actions={actions} context={mine ? undefined : { noteId: note.id }} onEditScore={mine ? (scoreId) => setNotation({ scoreId }) : undefined} />
        ) : canEdit ? (
          <Pressable onPress={() => startEdit()} className="rounded-xl px-4 py-8" style={{ backgroundColor: derived.fill }}>
            <Text className="font-ui text-center text-sm" style={{ color: colors.muted }}>
              Tap to start writing. [[ links a note, # makes a heading, - [ ] a checkbox.
            </Text>
          </Pressable>
        ) : (
          <Text className="font-ui text-sm" style={{ color: colors.muted }}>
            This note is empty.
          </Text>
        )}

        {mine ? (
          <View className="mt-2 pt-4" style={{ borderTopWidth: 1, borderColor: derived.hairline }}>
            <LinksSection note={note} body={note.body} notes={notes} onOpen={openNote} onOpenTitle={(t) => actions.onWikilink(t)} onTag={actions.onTag} />
          </View>
        ) : null}
      </ScrollView>
      {sheets}
    </View>
  );
}
