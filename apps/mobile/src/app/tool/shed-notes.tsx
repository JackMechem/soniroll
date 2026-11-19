import { api } from '@jam-practice/convex/_generated/api';
import type { Id } from '@jam-practice/convex/_generated/dataModel';
import { useConvexAuth } from '@convex-dev/auth/react';
import { sortByText } from '@jam-practice/core/sortText';
import { cleanTitle } from '@jam-practice/core/shedNotes';
import { useMutation, useQuery } from 'convex/react';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useDeferredValue, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ActionSheet, type SheetAction } from '@/components/ActionSheet';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useTabBarSpace } from '@/components/FloatingTabBar';
import { ChevronDownIcon, ChevronRightIcon, DotsVerticalIcon, FolderMoveIcon, FolderPlusIcon, PencilIcon, PlusIcon, ShareIcon, TrashIcon } from '@/components/icons';
import { NameDialog } from '@/components/NameDialog';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { FolderPickSheet } from '@/components/shedNotes/FolderPickSheet';
import { FolderClosedIcon, FolderOpenIcon, GearIcon, ImportIcon, NoteDocIcon, NotePlusIcon, PeopleIcon, TemplatesIcon } from '@/components/shedNotes/icons';
import { ShareSheet } from '@/components/shedNotes/ShareSheet';
import { ShedNotesGate } from '@/components/shedNotes/ShedNotesGate';
import { TemplateFillSheet, useInstantiate } from '@/components/shedNotes/TemplateFill';
import { formatShortDate } from '@/components/tool/ear';
import { Segmented } from '@/components/tool/reward';
import { Button, SearchField } from '@/components/ui';
import { errorText, useNoteList, useSharedWithMe, useTemplates, type NoteMeta, type NoteTemplate } from '@/lib/useShedNotes';
import { useAppTheme } from '@/theme/ThemeProvider';

type Folder = { name: string; path: string; folders: Folder[]; notes: NoteMeta[] };

/** The folder tree: folders made on their own (they can be empty) and the ones notes are in. */
function buildTree(notes: NoteMeta[], folderPaths: string[]): Folder {
  const root: Folder = { name: '', path: '', folders: [], notes: [] };
  const folderAt = (path: string): Folder => {
    let at = root;
    for (const part of path.split('/').filter(Boolean)) {
      const next = at.path ? `${at.path}/${part}` : part;
      let child = at.folders.find((f) => f.name === part);
      if (!child) {
        child = { name: part, path: next, folders: [], notes: [] };
        at.folders.push(child);
      }
      at = child;
    }
    return at;
  };
  for (const p of folderPaths) folderAt(p);
  for (const n of notes) folderAt(n.folder).notes.push(n);
  const sort = (f: Folder) => {
    f.folders = sortByText(f.folders, (x) => x.name);
    f.notes = sortByText(f.notes, (x) => x.title);
    f.folders.forEach(sort);
  };
  sort(root);
  return root;
}

const count = (f: Folder): number => f.notes.length + f.folders.reduce((s, c) => s + count(c), 0);
const leafOf = (path: string) => path.slice(path.lastIndexOf('/') + 1);
const parentOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');

type Prompt = { kind: 'rename'; note: NoteMeta } | { kind: 'new-folder'; parent: string } | { kind: 'rename-folder'; path: string };

/**
 * Shed Notes on the phone — the website's `/shed-notes` note list (`ShedNotes.tsx` / `NoteList.tsx`):
 * your notes in folders (or most recent first), a search that matches titles, folders and #tags at
 * once and the notes' text from the server, notes shared with you, templates, and + New (a note,
 * one from a template, a folder). ⋮ on a note or folder renames, moves (a folder list stands in
 * for dragging), shares or deletes it. A note opens on its own screen (`shed-notes-note`).
 * The ⋮ at the top has Templates, importing Markdown files, and Settings. Account only.
 */
function ShedNotesScreen() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const notes = useNoteList();
  if (isLoading) return <ScreenSpinner />;
  if (!isAuthenticated) return <ShedNotesGate />;
  if (notes === undefined) return <ScreenSpinner label="Loading your notes" />;
  return <NoteList notes={notes} />;
}

export default withScreenLoader(ShedNotesScreen);

function NoteList({ notes }: { notes: NoteMeta[] }) {
  const { colors, derived } = useAppTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string }>();
  const bottom = useTabBarSpace(48);
  const folderPaths = useQuery(api.shedNotes.folders);
  const shared = useSharedWithMe();
  const templates = useTemplates();
  const createMut = useMutation(api.shedNotes.create);
  const removeMut = useMutation(api.shedNotes.remove);
  const moveMut = useMutation(api.shedNotes.move);
  const renameMut = useMutation(api.shedNotes.rename);
  const createFolderMut = useMutation(api.shedNotes.createFolder);
  const renameFolderMut = useMutation(api.shedNotes.renameFolder);
  const deleteFolderMut = useMutation(api.shedNotes.deleteFolder);
  const leaveMut = useMutation(api.shedNoteShares.leave);
  const importMut = useMutation(api.shedNotes.importNotes);
  const instantiate = useInstantiate();

  const [q, setQ] = useState(params.q ?? '');
  // Opened again with a #tag from a note: search for it.
  const [seenQ, setSeenQ] = useState(params.q);
  if (params.q !== seenQ) {
    setSeenQ(params.q);
    if (params.q) setQ(params.q);
  }
  const [sort, setSort] = useState<'folders' | 'recent'>('folders');
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ title: string; subtitle?: string; actions: SheetAction[] } | null>(null);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [moving, setMoving] = useState<{ kind: 'note'; note: NoteMeta } | { kind: 'folder'; path: string } | null>(null);
  const [deleting, setDeleting] = useState<NoteMeta | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<string | null>(null);
  const [sharing, setSharing] = useState<NoteMeta | null>(null);
  const [filling, setFilling] = useState<{ template: NoteTemplate; folder: string } | null>(null);
  const [importing, setImporting] = useState<{ notes: { title: string; folder: string; body: string }[] } | null>(null);

  const query = q.trim().toLowerCase();
  const deferred = useDeferredValue(query);
  const textHits = useQuery(api.shedNotes.search, deferred.length >= 2 && !deferred.startsWith('#') ? { q: deferred } : 'skip');
  const tree = useMemo(() => buildTree(notes, folderPaths ?? []), [notes, folderPaths]);
  const recent = useMemo(() => [...notes].sort((a, b) => b.updatedAt - a.updatedAt), [notes]);
  const titleHits = useMemo(() => {
    if (!query) return [];
    if (query.startsWith('#')) {
      const tag = query.slice(1);
      return notes.filter((n) => n.tags.some((t) => t === tag || t.startsWith(`${tag}/`)));
    }
    return notes.filter((n) => n.title.toLowerCase().includes(query) || n.folder.toLowerCase().includes(query));
  }, [notes, query]);
  const titleIds = new Set(titleHits.map((n) => n.id));
  const bodyHits = (textHits ?? []).filter((h) => !titleIds.has(h.id));

  const fail = (e: unknown) => setNotice(errorText(e));
  const open = (id: string, edit?: boolean) => router.push({ pathname: '/tool/shed-notes-note', params: { id, ...(edit ? { edit: '1' } : {}) } });

  async function newNote(folder = '') {
    try {
      const made = await createMut({ folder });
      open(made.id, true);
    } catch (e) {
      fail(e);
    }
  }

  function newMenu(folder = '') {
    setMenu({
      title: folder ? `New in ${leafOf(folder)}` : 'New',
      actions: [
        { key: 'note', icon: <NotePlusIcon color={colors.foreground} size={20} />, label: 'New note', onPress: () => void newNote(folder) },
        ...(templates?.length
          ? [
              {
                key: 'template',
                icon: <TemplatesIcon color={colors.foreground} size={20} />,
                label: 'From a template…',
                onPress: () =>
                  setMenu({
                    title: 'Make a note from a template',
                    actions: templates.map((t) => ({ key: t.id, icon: <TemplatesIcon color={colors.muted} size={20} />, label: t.name, onPress: () => setFilling({ template: t, folder }) })),
                  }),
              },
            ]
          : []),
        { key: 'folder', icon: <FolderPlusIcon color={colors.foreground} size={20} />, label: folder ? 'New folder inside' : 'New folder', onPress: () => setPrompt({ kind: 'new-folder', parent: folder }) },
      ],
    });
  }

  function noteMenu(n: NoteMeta) {
    setMenu({
      title: n.title,
      subtitle: n.folder || undefined,
      actions: [
        { key: 'rename', icon: <PencilIcon color={colors.foreground} size={20} />, label: 'Rename', onPress: () => setPrompt({ kind: 'rename', note: n }) },
        { key: 'move', icon: <FolderMoveIcon color={colors.foreground} size={20} />, label: 'Move to folder', onPress: () => setMoving({ kind: 'note', note: n }) },
        { key: 'share', icon: <ShareIcon color={colors.foreground} size={20} />, label: 'Share…', onPress: () => setSharing(n) },
        { key: 'delete', icon: <TrashIcon color={colors.danger} size={20} />, label: 'Delete', danger: true, onPress: () => setDeleting(n) },
      ],
    });
  }

  function folderMenu(path: string) {
    setMenu({
      title: leafOf(path),
      subtitle: parentOf(path) || undefined,
      actions: [
        { key: 'note', icon: <NotePlusIcon color={colors.foreground} size={20} />, label: 'New note here', onPress: () => void newNote(path) },
        { key: 'folder', icon: <FolderPlusIcon color={colors.foreground} size={20} />, label: 'New folder inside', onPress: () => setPrompt({ kind: 'new-folder', parent: path }) },
        { key: 'rename', icon: <PencilIcon color={colors.foreground} size={20} />, label: 'Rename', onPress: () => setPrompt({ kind: 'rename-folder', path }) },
        { key: 'move', icon: <FolderMoveIcon color={colors.foreground} size={20} />, label: 'Move into…', onPress: () => setMoving({ kind: 'folder', path }) },
        { key: 'delete', icon: <TrashIcon color={colors.danger} size={20} />, label: 'Delete folder', danger: true, onPress: () => setDeletingFolder(path) },
      ],
    });
  }

  async function submitPrompt(value: string) {
    const p = prompt;
    setPrompt(null);
    if (!p) return;
    try {
      if (p.kind === 'rename') await renameMut({ id: p.note.id as Id<'shedNotes'>, title: value });
      else if (p.kind === 'new-folder') {
        const path = await createFolderMut({ path: p.parent ? `${p.parent}/${value}` : value });
        setOpenFolders((s) => new Set([...s, p.parent, path].filter(Boolean)));
      } else {
        const parent = parentOf(p.path);
        await renameFolderMut({ from: p.path, to: parent ? `${parent}/${value}` : value });
      }
    } catch (e) {
      fail(e);
    }
  }

  async function pickImport() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['text/markdown', 'text/plain', 'text/x-markdown', '*/*'], copyToCacheDirectory: true, multiple: true });
      if (result.canceled || !result.assets?.length) return;
      const picked: { title: string; folder: string; body: string }[] = [];
      for (const a of result.assets) {
        if (!/\.(md|markdown|txt)$/i.test(a.name)) continue;
        picked.push({ title: cleanTitle(a.name.replace(/\.(md|markdown|txt)$/i, '')) || 'Untitled', folder: '', body: await new File(a.uri).text() });
      }
      if (!picked.length) {
        setNotice('Pick Markdown files (.md). A .zip of notes can be imported on the website.');
        return;
      }
      setImporting({ notes: picked });
    } catch (e) {
      fail(e);
    }
  }

  async function runImport(clash: 'skip' | 'replace' | 'copy') {
    const job = importing;
    setImporting(null);
    if (!job) return;
    try {
      let created = 0;
      let replaced = 0;
      let skipped = 0;
      for (let i = 0; i < job.notes.length; i += 50) {
        const r = await importMut({ notes: job.notes.slice(i, i + 50), folders: [], clash });
        created += r.created;
        replaced += r.replaced;
        skipped += r.skipped;
      }
      setNotice([`${created} imported`, replaced ? `${replaced} replaced` : '', skipped ? `${skipped} skipped` : ''].filter(Boolean).join(' · '));
    } catch (e) {
      fail(e);
    }
  }

  const noteRow = (n: NoteMeta, depth = 0, detail?: string) => (
    <Row
      key={n.id}
      depth={depth}
      icon={<NoteDocIcon color={colors.muted} size={18} />}
      title={n.title}
      detail={detail ?? (n.snippet || formatShortDate(n.updatedAt))}
      onPress={() => open(n.id)}
      onMore={() => noteMenu(n)}
    />
  );

  const folderRows = (f: Folder, depth: number): ReactNode[] =>
    f.folders.flatMap((c) => {
      const isOpen = openFolders.has(c.path);
      const toggle = () =>
        setOpenFolders((s) => {
          const next = new Set(s);
          if (next.has(c.path)) next.delete(c.path);
          else next.add(c.path);
          return next;
        });
      const n = count(c);
      return [
        <Row
          key={`folder:${c.path}`}
          depth={depth}
          icon={isOpen ? <FolderOpenIcon color={colors.accent} size={18} /> : <FolderClosedIcon color={colors.accent} size={18} />}
          title={c.name}
          bold
          detail={n ? `${n} ${n === 1 ? 'note' : 'notes'}` : 'Empty'}
          onPress={toggle}
          onMore={() => folderMenu(c.path)}
          chevron={isOpen ? 'down' : 'right'}
        />,
        ...(isOpen ? [...folderRows(c, depth + 1), ...c.notes.map((x) => noteRow(x, depth + 1))] : []),
      ];
    });

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          title: 'Shed Notes',
          headerRight: () => (
            <Pressable
              onPress={() =>
                setMenu({
                  title: 'Shed Notes',
                  actions: [
                    { key: 'templates', icon: <TemplatesIcon color={colors.foreground} size={20} />, label: 'Templates', onPress: () => router.push('/tool/shed-notes-templates') },
                    { key: 'import', icon: <ImportIcon color={colors.foreground} size={20} />, label: 'Import Markdown files…', onPress: () => void pickImport() },
                    { key: 'settings', icon: <GearIcon color={colors.foreground} size={20} />, label: 'Settings', onPress: () => router.push('/tool/shed-notes-settings') },
                  ],
                })
              }
              hitSlop={8}
              accessibilityLabel="More: templates, import, settings"
              className="h-9 w-9 items-center justify-center rounded-full"
            >
              <DotsVerticalIcon color={colors.foreground} size={20} />
            </Pressable>
          ),
        }}
      />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: bottom, gap: 14 }}>
        <View className="flex-row items-center gap-2">
          <View className="flex-1">
            <SearchField value={q} onChangeText={setQ} placeholder="Search notes, folders, #tags" />
          </View>
          <Button label="New" Icon={PlusIcon} onPress={() => newMenu()} />
        </View>

        {notice ? (
          <Pressable onPress={() => setNotice(null)} className="rounded-lg px-3 py-2" style={{ backgroundColor: derived.fill }}>
            <Text className="font-ui text-sm" style={{ color: colors.foreground }}>
              {notice}
            </Text>
          </Pressable>
        ) : null}

        {query ? (
          <View className="gap-1.5">
            {titleHits.map((n) => noteRow(n, 0, n.folder || undefined))}
            {bodyHits.map((h) => (
              <Row key={h.id} icon={<NoteDocIcon color={colors.muted} size={18} />} title={h.title} detail={h.snippet} onPress={() => open(h.id)} />
            ))}
            {!titleHits.length && !bodyHits.length ? (
              <Text className="font-ui py-6 text-center text-sm" style={{ color: colors.muted }}>
                {textHits === undefined && deferred.length >= 2 && !deferred.startsWith('#') ? 'Searching…' : 'No notes match.'}
              </Text>
            ) : null}
          </View>
        ) : (
          <>
            <Segmented
              label="Show notes"
              onPage
              value={sort}
              onChange={setSort}
              options={[
                { value: 'folders', label: tree.folders.length ? 'Folders' : 'A–Z' },
                { value: 'recent', label: 'Recent' },
              ]}
            />
            <View className="gap-1.5">
              {sort === 'recent' ? recent.map((n) => noteRow(n, 0, `${formatShortDate(n.updatedAt)}${n.folder ? ` · ${n.folder}` : ''}`)) : [...folderRows(tree, 0), ...tree.notes.map((n) => noteRow(n))]}
              {notes.length === 0 && tree.folders.length === 0 ? (
                <View className="items-center gap-3 rounded-xl px-5 py-6" style={{ backgroundColor: derived.fill }}>
                  <Text className="font-ui-semibold text-[15px] font-semibold" style={{ color: colors.foreground }}>
                    Your first note
                  </Text>
                  <Text className="font-ui text-center text-sm leading-5" style={{ color: colors.muted }}>
                    Notes are markdown. Link them with [[Title]], write notation, and attach them to your routines and tunes.
                  </Text>
                  <Button label="New note" Icon={PlusIcon} onPress={() => void newNote()} />
                </View>
              ) : null}
            </View>

            {shared && shared.length > 0 ? (
              <View className="gap-1.5">
                <Text className="font-ui-semibold px-1 pt-2 text-sm font-semibold" style={{ color: colors.muted }}>
                  Shared with me
                </Text>
                {shared.map((s) => (
                  <Row
                    key={s.id}
                    icon={<PeopleIcon color={colors.muted} size={18} />}
                    title={s.title}
                    detail={`@${s.owner ?? s.ownerName} · ${s.role === 'write' ? 'can edit' : 'view only'}${s.via ? ` · linked from ${s.via}` : ''}`}
                    onPress={() => open(s.id)}
                    onMore={
                      s.via
                        ? undefined
                        : () =>
                            setMenu({
                              title: s.title,
                              subtitle: `Shared by @${s.owner ?? s.ownerName}`,
                              actions: [{ key: 'leave', icon: <TrashIcon color={colors.danger} size={20} />, label: 'Remove from my list', danger: true, onPress: () => void leaveMut({ noteId: s.id as Id<'shedNotes'> }).catch(fail) }],
                            })
                    }
                  />
                ))}
              </View>
            ) : null}

            <Row icon={<TemplatesIcon color={colors.muted} size={18} />} title="Templates" detail={templates?.length ? `${templates.length} ${templates.length === 1 ? 'template' : 'templates'}` : 'Notes to start from'} onPress={() => router.push('/tool/shed-notes-templates')} />
          </>
        )}
      </ScrollView>

      <ActionSheet visible={!!menu} title={menu?.title} subtitle={menu?.subtitle} actions={menu?.actions ?? []} onClose={() => setMenu(null)} />
      <NameDialog
        visible={!!prompt}
        title={prompt?.kind === 'rename' ? 'Rename note' : prompt?.kind === 'rename-folder' ? 'Rename folder' : prompt?.kind === 'new-folder' && prompt.parent ? `New folder in ${leafOf(prompt.parent)}` : 'New folder'}
        initialValue={prompt?.kind === 'rename' ? prompt.note.title : prompt?.kind === 'rename-folder' ? leafOf(prompt.path) : ''}
        placeholder={prompt?.kind === 'new-folder' ? 'Folder name' : undefined}
        confirmLabel={prompt?.kind === 'new-folder' ? 'Make folder' : 'Rename'}
        onSubmit={(v) => void submitPrompt(v)}
        onClose={() => setPrompt(null)}
      />
      <FolderPickSheet
        visible={!!moving}
        title={moving?.kind === 'folder' ? `Move “${leafOf(moving.path)}” into…` : 'Move to folder'}
        current={moving ? (moving.kind === 'note' ? moving.note.folder : parentOf(moving.path)) : null}
        exclude={moving?.kind === 'folder' ? moving.path : undefined}
        onClose={() => setMoving(null)}
        onPick={(folder) => {
          const m = moving;
          if (!m) return;
          if (m.kind === 'note') void moveMut({ id: m.note.id as Id<'shedNotes'>, folder }).catch(fail);
          else void renameFolderMut({ from: m.path, to: folder ? `${folder}/${leafOf(m.path)}` : leafOf(m.path) }).catch(fail);
        }}
      />
      <ConfirmDialog
        visible={!!deleting}
        title={`Delete "${deleting?.title ?? ''}"?`}
        message="The note goes for good. Links to it in other notes stay, and make a new note if you open them."
        confirmLabel="Delete"
        onConfirm={() => {
          const n = deleting;
          setDeleting(null);
          if (n) void removeMut({ id: n.id as Id<'shedNotes'> }).catch(fail);
        }}
        onCancel={() => setDeleting(null)}
      />
      <ConfirmDialog
        visible={deletingFolder !== null}
        title={`Delete the folder "${deletingFolder ? leafOf(deletingFolder) : ''}"?`}
        message={`What's in it (notes and folders) moves up to ${deletingFolder && parentOf(deletingFolder) ? `"${leafOf(parentOf(deletingFolder))}"` : 'the top level'}. No notes are deleted.`}
        confirmLabel="Delete folder"
        onConfirm={() => {
          const path = deletingFolder;
          setDeletingFolder(null);
          if (path) void deleteFolderMut({ path }).catch(fail);
        }}
        onCancel={() => setDeletingFolder(null)}
      />
      <ShareSheet noteId={sharing?.id ?? ''} title={sharing?.title ?? ''} visible={!!sharing} onClose={() => setSharing(null)} />
      <TemplateFillSheet
        template={filling?.template ?? null}
        askTitle={!!filling && !filling.template.title.trim()}
        confirmLabel="Make note"
        onCancel={() => setFilling(null)}
        onSubmit={(values, typedTitle) => {
          const f = filling;
          setFilling(null);
          if (!f) return;
          const title = typedTitle || 'Untitled';
          void instantiate(f.template, values, title)
            .then((body) => createMut({ title, folder: f.folder, body, templateId: f.template.id as Id<'shedNoteTemplates'> }))
            .then((made) => open(made.id))
            .catch(fail);
        }}
      />
      <ActionSheet
        visible={!!importing}
        title={`Import ${importing?.notes.length ?? 0} ${importing?.notes.length === 1 ? 'note' : 'notes'}`}
        subtitle="If you already have a note by the same name:"
        onClose={() => setImporting(null)}
        actions={[
          { key: 'copy', icon: <PlusIcon color={colors.foreground} size={20} />, label: 'Keep both (the new one gets “ - 1”)', onPress: () => void runImport('copy') },
          { key: 'replace', icon: <PencilIcon color={colors.foreground} size={20} />, label: 'Replace mine', onPress: () => void runImport('replace') },
          { key: 'skip', icon: <ChevronRightIcon color={colors.foreground} size={20} />, label: 'Skip it', onPress: () => void runImport('skip') },
        ]}
      />
    </View>
  );
}

/** A row in the list: an icon, a title and a line under it, and ⋮. */
function Row({
  icon,
  title,
  detail,
  onPress,
  onMore,
  depth = 0,
  bold,
  chevron,
}: {
  icon: ReactNode;
  title: string;
  detail?: string;
  onPress: () => void;
  onMore?: () => void;
  depth?: number;
  bold?: boolean;
  chevron?: 'down' | 'right';
}) {
  const { colors, derived } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onMore}
      android_ripple={{ color: colors['surface-hover'] }}
      className="min-h-[52px] flex-row items-center gap-3 overflow-hidden rounded-lg py-2 pl-3"
      style={{ marginLeft: depth * 16, backgroundColor: derived.fill }}
    >
      {chevron ? (chevron === 'down' ? <ChevronDownIcon color={colors.muted} size={16} /> : <ChevronRightIcon color={colors.muted} size={16} />) : null}
      {icon}
      <View className="flex-1">
        <Text numberOfLines={1} className={bold ? 'font-ui-bold text-[15px] font-bold' : 'font-ui-semibold text-[15px] font-semibold'} style={{ color: colors.foreground }}>
          {title}
        </Text>
        {detail ? (
          <Text numberOfLines={1} className="font-ui text-xs" style={{ color: colors.muted }}>
            {detail}
          </Text>
        ) : null}
      </View>
      {onMore ? (
        <Pressable onPress={onMore} hitSlop={6} accessibilityLabel={`Options for ${title}`} className="h-11 w-10 items-center justify-center">
          <DotsVerticalIcon color={colors.muted} size={20} />
        </Pressable>
      ) : (
        <View className="w-3" />
      )}
    </Pressable>
  );
}
