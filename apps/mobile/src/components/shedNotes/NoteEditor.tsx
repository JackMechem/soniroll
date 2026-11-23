import { titleKey } from '@jam-practice/core/shedNotes';
import { useEffect, useImperativeHandle, useMemo, useRef, useState, type ComponentType, type Ref } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { PlusIcon, type IconProps } from '@/components/icons';
import {
  BoldIcon,
  BulletIcon,
  ChecklistIcon,
  CodeIcon,
  H1Icon,
  H2Icon,
  H3Icon,
  ImageIcon,
  IndentIcon,
  ItalicIcon,
  NoteDocIcon,
  NumberedIcon,
  OutdentIcon,
  QuoteIcon,
  RedoIcon,
  RuleIcon,
  ScoreNoteIcon,
  StrikeIcon,
  TableIcon,
  TemplatesIcon,
  UndoIcon,
} from '@/components/shedNotes/icons';
import {
  completeLink,
  continueList,
  indentLines,
  insertRule,
  insertTable,
  insertWikilink,
  linkQueryAt,
  setHeading,
  toggleChecklist,
  toggleList,
  toggleWrap,
  type Edit,
  type Sel,
} from '@/lib/shedNotes/format';
import type { NoteTemplate } from '@/lib/useShedNotes';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';
import { TextInput } from '@/components/ThemedTextInput';

export type EditorHandle = {
  /** Runs an edit on the text at the cursor (inserting a score or a file from outside). */
  apply: (fn: (text: string, sel: Sel) => Edit) => void;
  focus: () => void;
};

type ToolId = 'undo' | 'redo' | 'h1' | 'h2' | 'h3' | 'bold' | 'italic' | 'strike' | 'check' | 'bullet' | 'number' | 'indent' | 'outdent' | 'link' | 'quote' | 'table' | 'rule' | 'code' | 'notation' | 'file';

type Suggestion =
  | { kind: 'note'; title: string; folder: string }
  | { kind: 'template'; template: NoteTemplate }
  | { kind: 'create'; title: string };

/**
 * The phone's note editor: the markdown in a plain text box (no CodeMirror on a phone), with a
 * formatting bar above the keyboard (undo, headings, bold, italic, strikethrough, lists, checklist,
 * indent, quote, `[[link]]`, table, divider, code, and — when allowed — notation and files). Typing
 * `[[` lists your notes to link (and templates to make one from, or "Create …"); a new line after a
 * list item carries the list on (an empty item ends it).
 */
export function NoteEditor({
  value,
  onChange,
  notes,
  templates,
  fontSize,
  spellcheck,
  initialSelection,
  placeholder,
  onNotation,
  onFile,
  onCreateLinked,
  onTemplateLink,
  handleRef,
  autoFocus = true,
  self,
}: {
  value: string;
  onChange: (text: string) => void;
  /** Your notes, for the `[[` suggestions. */
  notes: { title: string; folder: string }[];
  /** Templates offered in the `[[` suggestions (leave out to offer none). */
  templates?: NoteTemplate[];
  fontSize: number;
  spellcheck: boolean;
  initialSelection?: Sel;
  placeholder?: string;
  /** Write music notation here (the score editor; then a ```score block goes in). */
  onNotation?: () => void;
  /** Put a file from your Files here. */
  onFile?: () => void;
  /** Make a note for a `[[link]]` to one that doesn't exist yet. */
  onCreateLinked?: (title: string) => Promise<boolean>;
  /** Make a note from a template; `done` gets its title, to link it. */
  onTemplateLink?: (template: NoteTemplate, done: (title: string) => void) => void;
  handleRef?: Ref<EditorHandle>;
  /** Open the keyboard straight away (a note opened to write in). */
  autoFocus?: boolean;
  /** The title of the note being written, left out of the `[[` suggestions (a note doesn't link
      to itself). */
  self?: string;
}) {
  const { colors, derived } = useAppTheme();
  const input = useRef<TextInput>(null);
  const [sel, setSel] = useState<Sel>(initialSelection ?? { start: value.length, end: value.length });
  // A selection we set (after a button): applied once, then the box is left to the finger again.
  const [forced, setForced] = useState<Sel | null>(initialSelection ?? null);
  const [past, setPast] = useState<{ text: string; sel: Sel; at: number }[]>([]);
  const [future, setFuture] = useState<{ text: string; sel: Sel }[]>([]);

  /** Every change goes through here, so it can be undone. Typing within a second or so is one step. */
  function commit(text: string, nextSel: Sel | null, group: boolean) {
    if (text === value) {
      if (nextSel) {
        setForced(nextSel);
        setSel(nextSel);
      }
      return;
    }
    const now = Date.now();
    setPast((p) => {
      const last = p[p.length - 1];
      if (group && last && now - last.at < 1200) return [...p.slice(0, -1), { ...last, at: now }];
      return [...p.slice(-99), { text: value, sel, at: now }];
    });
    setFuture([]);
    onChange(text);
    if (nextSel) {
      setForced(nextSel);
      setSel(nextSel);
    }
  }

  function apply(fn: (text: string, sel: Sel) => Edit) {
    const edit = fn(value, sel);
    commit(edit.text, edit.sel, false);
    input.current?.focus();
  }

  useImperativeHandle(handleRef, () => ({ apply, focus: () => input.current?.focus() }));
  // For edits that land later (a note made for a link): the newest `apply`, not this render's.
  const applyRef = useRef(apply);
  useEffect(() => {
    applyRef.current = apply;
  });

  function undo() {
    const last = past[past.length - 1];
    if (!last) return;
    setPast(past.slice(0, -1));
    setFuture([{ text: value, sel }, ...future]);
    onChange(last.text);
    setForced(last.sel);
    setSel(last.sel);
  }
  function redo() {
    const next = future[0];
    if (!next) return;
    setFuture(future.slice(1));
    setPast([...past, { text: value, sel, at: 0 }]);
    onChange(next.text);
    setForced(next.sel);
    setSel(next.sel);
  }

  // The `[[` being typed, and what to offer for it.
  const query = sel.start === sel.end ? linkQueryAt(value, sel.start) : null;
  const suggestions = useMemo((): Suggestion[] => {
    if (!query) return [];
    const q = titleKey(query.query);
    const selfKey = self === undefined ? null : titleKey(self);
    const matching = notes
      .filter((n) => titleKey(n.title) !== selfKey && (!q || titleKey(n.title).includes(q)))
      .sort((a, b) => Number(!titleKey(a.title).startsWith(q)) - Number(!titleKey(b.title).startsWith(q)))
      .slice(0, 5)
      .map((n): Suggestion => ({ kind: 'note', title: n.title, folder: n.folder }));
    const fromTemplates = (templates ?? [])
      .filter((t) => q && t.name.toLowerCase().includes(q))
      .slice(0, 2)
      .map((t): Suggestion => ({ kind: 'template', template: t }));
    const exact = notes.some((n) => titleKey(n.title) === q);
    const create: Suggestion[] = q && !exact && onCreateLinked ? [{ kind: 'create', title: query.query.trim() }] : [];
    return [...fromTemplates, ...matching, ...create];
  }, [query, notes, templates, onCreateLinked, self]);

  function pick(s: Suggestion) {
    if (!query) return;
    const at = { from: query.from, cursor: sel.start };
    const link = (title: string) => applyRef.current((text, cur) => (text.slice(at.from, at.from + 2) === '[[' && at.cursor <= text.length ? completeLink(text, at.cursor, at.from, title) : completeLink(text, cur.start, cur.start, title)));
    if (s.kind === 'note') link(s.title);
    else if (s.kind === 'create') {
      void onCreateLinked?.(s.title).then((ok) => ok && link(s.title));
    } else onTemplateLink?.(s.template, link);
  }

  /** The formatting bar's buttons; what each does is in `runTool` (event time only). */
  const tools: { id: ToolId; label: string; Icon: ComponentType<IconProps>; disabled?: boolean; accent?: boolean }[] = [
    { id: 'undo', label: 'Undo', Icon: UndoIcon, disabled: !past.length },
    { id: 'redo', label: 'Redo', Icon: RedoIcon, disabled: !future.length },
    { id: 'h1', label: 'Heading 1', Icon: H1Icon },
    { id: 'h2', label: 'Heading 2', Icon: H2Icon },
    { id: 'h3', label: 'Heading 3', Icon: H3Icon },
    { id: 'bold', label: 'Bold', Icon: BoldIcon },
    { id: 'italic', label: 'Italic', Icon: ItalicIcon },
    { id: 'strike', label: 'Strikethrough', Icon: StrikeIcon },
    { id: 'check', label: 'Checklist item', Icon: ChecklistIcon },
    { id: 'bullet', label: 'Bulleted list', Icon: BulletIcon },
    { id: 'number', label: 'Numbered list', Icon: NumberedIcon },
    { id: 'indent', label: 'Indent', Icon: IndentIcon },
    { id: 'outdent', label: 'Outdent', Icon: OutdentIcon },
    { id: 'link', label: 'Link to a note', Icon: NoteDocIcon },
    { id: 'quote', label: 'Quote', Icon: QuoteIcon },
    { id: 'table', label: 'Table', Icon: TableIcon },
    { id: 'rule', label: 'Divider line', Icon: RuleIcon },
    { id: 'code', label: 'Code', Icon: CodeIcon },
    ...(onNotation ? [{ id: 'notation' as const, label: 'Write music notation', Icon: ScoreNoteIcon, accent: true }] : []),
    ...(onFile ? [{ id: 'file' as const, label: 'Insert a file from your files', Icon: ImageIcon, accent: true }] : []),
  ];

  function runTool(id: ToolId) {
    switch (id) {
      case 'undo':
        return undo();
      case 'redo':
        return redo();
      case 'h1':
      case 'h2':
      case 'h3':
        return apply((t, s) => setHeading(t, s, Number(id[1])));
      case 'bold':
        return apply((t, s) => toggleWrap(t, s, '**'));
      case 'italic':
        return apply((t, s) => toggleWrap(t, s, '*'));
      case 'strike':
        return apply((t, s) => toggleWrap(t, s, '~~'));
      case 'check':
        return apply(toggleChecklist);
      case 'bullet':
      case 'number':
      case 'quote':
        return apply((t, s) => toggleList(t, s, id));
      case 'indent':
        return apply((t, s) => indentLines(t, s, false));
      case 'outdent':
        return apply((t, s) => indentLines(t, s, true));
      case 'link':
        return apply(insertWikilink);
      case 'table':
        return apply(insertTable);
      case 'rule':
        return apply(insertRule);
      case 'code':
        return apply((t, s) => toggleWrap(t, s, '`'));
      case 'notation':
        return onNotation?.();
      case 'file':
        return onFile?.();
    }
  }

  return (
    <View className="flex-1">
      <TextInput
        ref={input}
        value={value}
        onChangeText={(next) => {
          const cont = continueList(value, next, sel.start);
          if (cont) commit(cont.text, cont.sel, true);
          else commit(next, null, true);
        }}
        selection={forced ?? undefined}
        onSelectionChange={(e) => {
          setSel(e.nativeEvent.selection);
          if (forced) setForced(null);
        }}
        multiline
        autoFocus={autoFocus}
        scrollEnabled
        textAlignVertical="top"
        autoCapitalize="sentences"
        autoCorrect={spellcheck}
        spellCheck={spellcheck}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        accessibilityLabel="Note text"
        className="font-ui flex-1"
        style={{ color: colors.foreground, fontSize, lineHeight: Math.round(fontSize * 1.45), paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 }}
      />

      {suggestions.length ? (
        <View style={{ backgroundColor: colors.surface, borderTopWidth: 1, borderColor: derived.hairline }}>
          <ScrollView keyboardShouldPersistTaps="always" style={{ maxHeight: 220 }} contentContainerStyle={{ paddingVertical: 4 }}>
            {suggestions.map((s) => {
              const label = s.kind === 'note' ? s.title : s.kind === 'template' ? `New from “${s.template.name}”` : `Create “${s.title}”`;
              const detail = s.kind === 'note' ? s.folder : s.kind === 'template' ? 'template' : 'new note';
              const Icon = s.kind === 'note' ? NoteDocIcon : s.kind === 'template' ? TemplatesIcon : PlusIcon;
              return (
                <Pressable
                  key={`${s.kind}:${label}`}
                  onPress={() => pick(s)}
                  android_ripple={{ color: colors['surface-hover'] }}
                  className="flex-row items-center gap-3 px-4"
                  style={{ minHeight: 44 }}
                >
                  <Icon color={s.kind === 'note' ? colors.muted : colors.accent} size={18} />
                  <Text numberOfLines={1} className="font-ui-semibold flex-1 text-[15px] font-semibold" style={{ color: colors.foreground }}>
                    {label}
                  </Text>
                  {detail ? (
                    <Text numberOfLines={1} className="font-ui max-w-[40%] text-xs" style={{ color: colors.muted }}>
                      {detail}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      <View style={{ backgroundColor: colors.surface, borderTopWidth: 1, borderColor: derived.hairline }}>
        <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 6, paddingVertical: 4, gap: 2 }}>
          {tools.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => runTool(t.id)}
              disabled={t.disabled}
              accessibilityRole="button"
              accessibilityLabel={t.label}
              accessibilityState={{ disabled: !!t.disabled }}
              android_ripple={{ color: colors['surface-hover'] }}
              className="h-11 w-11 items-center justify-center overflow-hidden rounded-lg"
              style={{ opacity: t.disabled ? 0.35 : 1, backgroundColor: t.accent ? withAlpha(colors.accent, 0.12) : colors.surface }}
            >
              <t.Icon color={t.accent ? colors.accent : colors.foreground} size={22} />
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}
