import { api } from '@jam-practice/convex/_generated/api';
import { cleanScore } from '@jam-practice/core/bassTranscription';
import { useQuery } from 'convex/react';
import { useMemo, useRef, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View, type TextStyle } from 'react-native';

import { CheckIcon, NoteIcon } from '@/components/icons';
import { openUrl } from '@/components/lessons/files';
import { FileIcon } from '@/components/lessons/parts';
import { FileBlock } from '@/components/shedNotes/NoteEmbeds';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import Score from '@/components/notation/Score';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';
import { TextInput } from '@/components/ThemedTextInput';

/**
 * Lesson notes on the phone. Notes are Markdown (`lessonItems.body`, written in the website's Shed
 * Notes editor), so this is a small Markdown reader — headings, paragraphs, bold / italic / strike /
 * code / links, lists and checklists, quotes, code blocks, rules, pictures — plus the teacher's
 * Score Writer scores (```score blocks, read through the lesson so the student can see them). ABC
 * notation shows as a line saying it's on the website; pictures and attached files open in the
 * file viewer (`FileBlock`, read through the lesson).
 *
 * And `NoteTextEditor`: a plain, touch-friendly editor for the teacher — the Markdown text with a
 * row of buttons that add the formatting (heading, bold, italic, lists, checklist, quote, link).
 * Kept here, not shared with Shed Notes (ported separately with its own editor); either could
 * become the shared one later.
 */

// ---------------------------------------------------------------- parsing

type ListItem = { indent: number; ordered: boolean; n: number; task: boolean; checked: boolean; text: string };
type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'para'; text: string }
  | { kind: 'list'; items: ListItem[] }
  | { kind: 'quote'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'score'; id: string }
  | { kind: 'abc' }
  | { kind: 'hr' }
  | { kind: 'image'; url: string; alt: string }
  | { kind: 'file'; name: string; ref: string };

const FENCE = /^\s*(```|~~~)\s*(\S*)/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const LIST = /^(\s*)([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?(.*)$/;
const EMBED = /^\s*!\[([^\]\n]*)\]\(\s*(file:[^\s)]+|https:\/\/[^\s)]+)\s*\)\s*$/;

function parse(body: string): Block[] {
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ kind: 'para', text: para.join(' ') });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = FENCE.exec(line);
    if (fence) {
      flush();
      const close = new RegExp(`^\\s*${fence[1]}\\s*$`);
      const inner: string[] = [];
      for (i++; i < lines.length && !close.test(lines[i]); i++) inner.push(lines[i]);
      const lang = fence[2].toLowerCase();
      if (lang === 'score') out.push({ kind: 'score', id: inner.join('\n').trim().split(/\s+/)[0] ?? '' });
      else if (lang === 'abc' || lang === 'music') out.push({ kind: 'abc' });
      else out.push({ kind: 'code', text: inner.join('\n') });
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    const embed = EMBED.exec(line);
    if (embed) {
      flush();
      const name = embed[1].split('|')[0].trim();
      out.push(embed[2].startsWith('https://') ? { kind: 'image', url: embed[2], alt: name } : { kind: 'file', name: name || 'A file', ref: embed[2].slice('file:'.length) });
      continue;
    }
    const h = HEADING.exec(line);
    if (h) {
      flush();
      out.push({ kind: 'heading', level: h[1].length, text: h[2] });
      continue;
    }
    if (HR.test(line)) {
      flush();
      out.push({ kind: 'hr' });
      continue;
    }
    const q = QUOTE.exec(line);
    if (q) {
      flush();
      const text = [q[1]];
      while (i + 1 < lines.length && QUOTE.test(lines[i + 1])) text.push(QUOTE.exec(lines[++i])![1]);
      out.push({ kind: 'quote', text: text.join('\n') });
      continue;
    }
    const li = LIST.exec(line);
    if (li) {
      flush();
      const items: ListItem[] = [];
      let m: RegExpExecArray | null = li;
      while (m) {
        const marker = m[2];
        items.push({
          indent: Math.floor(m[1].replace(/\t/g, '    ').length / 2),
          ordered: /\d/.test(marker),
          n: parseInt(marker, 10) || 0,
          task: !!m[3],
          checked: !!m[3] && /x/i.test(m[3]),
          text: m[4],
        });
        // A list item's lazy continuation lines join it.
        while (i + 1 < lines.length && lines[i + 1].trim() && !LIST.test(lines[i + 1]) && /^\s{2,}/.test(lines[i + 1])) items[items.length - 1].text += ` ${lines[++i].trim()}`;
        m = i + 1 < lines.length ? LIST.exec(lines[i + 1]) : null;
        if (m) i++;
      }
      out.push({ kind: 'list', items });
      continue;
    }
    para.push(line.trim());
  }
  flush();
  return out;
}

// ---------------------------------------------------------------- inline

const INLINE = /(\*\*|__)(.+?)\1|~~(.+?)~~|`([^`]+)`|\[\[([^\]\n]+?)\]\]|\[([^\]\n]+)\]\(([^)\s]+)\)|(\*|_)([^*_\s](?:[^*_\n]*?[^*_\s])?)\8|(https?:\/\/[^\s)]+)/;

function Inline({ text, style }: { text: string; style?: TextStyle }): ReactNode {
  const { colors, derived } = useAppTheme();
  const out: ReactNode[] = [];
  let rest = text;
  let key = 0;
  while (rest) {
    const m = INLINE.exec(rest);
    if (!m) {
      out.push(rest);
      break;
    }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    const k = key++;
    if (m[2] !== undefined)
      out.push(
        <Text key={k} className="font-ui-bold font-bold">
          <Inline text={m[2]} />
        </Text>,
      );
    else if (m[3] !== undefined)
      out.push(
        <Text key={k} style={{ textDecorationLine: 'line-through' }}>
          <Inline text={m[3]} />
        </Text>,
      );
    else if (m[4] !== undefined)
      out.push(
        <Text key={k} style={{ fontFamily: 'monospace', backgroundColor: derived.fill }}>
          {` ${m[4]} `}
        </Text>,
      );
    else if (m[5] !== undefined) out.push(m[5].split('|').pop());
    else if (m[6] !== undefined) {
      const url = m[7];
      out.push(
        <Text key={k} style={{ color: colors.accent, textDecorationLine: 'underline' }} onPress={/^https?:\/\//.test(url) ? () => openUrl(url) : undefined}>
          {m[6]}
        </Text>,
      );
    } else if (m[9] !== undefined)
      out.push(
        <Text key={k} style={{ fontStyle: 'italic' }}>
          <Inline text={m[9]} />
        </Text>,
      );
    else if (m[10] !== undefined) {
      const url = m[10];
      out.push(
        <Text key={k} style={{ color: colors.accent, textDecorationLine: 'underline' }} onPress={() => openUrl(url)}>
          {url}
        </Text>,
      );
    }
    rest = rest.slice(m.index + m[0].length);
  }
  return <Text style={style}>{out}</Text>;
}

// ---------------------------------------------------------------- the reader

const HEADING_SIZE = [24, 20, 18, 16, 15, 15];

/** A note's Markdown, rendered. `lessonId` lets the student see the teacher's scores in it. */
export function MarkdownView({ body, lessonId }: { body: string; lessonId: string }) {
  const { colors, derived } = useAppTheme();
  const blocks = useMemo(() => parse(body), [body]);
  const text = { color: colors.foreground, fontSize: 15, lineHeight: 23 };
  return (
    <View className="gap-3">
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'heading':
            return (
              <Text key={i} className="font-ui-bold font-bold" style={{ color: colors.foreground, fontSize: HEADING_SIZE[b.level - 1], lineHeight: HEADING_SIZE[b.level - 1] * 1.3, marginTop: i ? 6 : 0 }}>
                <Inline text={b.text} />
              </Text>
            );
          case 'para':
            return (
              <Text key={i} selectable className="font-ui" style={text}>
                <Inline text={b.text} />
              </Text>
            );
          case 'list':
            return (
              <View key={i} className="gap-1.5">
                {b.items.map((it, j) => (
                  <View key={j} className="flex-row gap-2" style={{ paddingLeft: it.indent * 18 }}>
                    {it.task ? (
                      <View
                        className="mt-0.5 h-5 w-5 items-center justify-center rounded"
                        style={{ backgroundColor: it.checked ? colors.accent : 'transparent', borderWidth: it.checked ? 0 : 1.5, borderColor: withAlpha(colors.foreground, 0.3) }}
                      >
                        {it.checked ? <CheckIcon color={colors['accent-foreground']} size={14} /> : null}
                      </View>
                    ) : (
                      <Text className="font-ui" style={{ ...text, color: colors.muted, minWidth: it.ordered ? 20 : 10 }}>
                        {it.ordered ? `${it.n}.` : '•'}
                      </Text>
                    )}
                    <Text selectable className="font-ui flex-1" style={{ ...text, color: it.checked ? colors.muted : colors.foreground, textDecorationLine: it.checked ? 'line-through' : 'none' }}>
                      <Inline text={it.text} />
                    </Text>
                  </View>
                ))}
              </View>
            );
          case 'quote':
            return (
              <View key={i} className="py-0.5 pl-3" style={{ borderLeftWidth: 3, borderColor: withAlpha(colors.foreground, 0.2) }}>
                <Text selectable className="font-ui" style={{ ...text, color: colors.muted }}>
                  <Inline text={b.text} />
                </Text>
              </View>
            );
          case 'code':
            return (
              <ScrollView key={i} horizontal className="rounded-lg" style={{ backgroundColor: derived.fill }} contentContainerStyle={{ padding: 12 }}>
                <Text selectable className="font-ui" style={{ fontFamily: 'monospace', fontSize: 13, color: colors.foreground }}>
                  {b.text}
                </Text>
              </ScrollView>
            );
          case 'hr':
            return <View key={i} style={{ height: 1, backgroundColor: withAlpha(colors.foreground, 0.15), marginVertical: 4 }} />;
          case 'score':
            return <LessonScore key={i} id={b.id} lessonId={lessonId} />;
          case 'abc':
            return <Placeholder key={i} Icon={NoteIcon} text="Music notation — open these notes on the website to see it." />;
          case 'file':
            // Read through the lesson, so the student can open the teacher's files (and the other way).
            return <FileBlock key={i} fileRef={b.ref} name={b.name} context={{ lessonId }} />;
          case 'image':
            return <FileBlock key={i} fileRef={b.url} name={b.alt} />;
        }
        return null;
      })}
    </View>
  );
}

function Placeholder({ Icon, text }: { Icon: typeof FileIcon; text: string }) {
  const { colors, derived } = useAppTheme();
  return (
    <View className="flex-row items-center gap-2 rounded-lg px-3 py-2.5" style={{ backgroundColor: derived.fill }}>
      <Icon color={colors.muted} size={16} />
      <Text className="font-ui flex-1 text-sm" style={{ color: colors.muted }}>
        {text}
      </Text>
    </View>
  );
}

/** A Score Writer score in a note, read through the lesson (so the student can see the teacher's). */
function LessonScore({ id, lessonId }: { id: string; lessonId: string }) {
  const { colors } = useAppTheme();
  const row = useQuery(api.scores.get, id ? { id, lessonId } : 'skip');
  const data = row?.data;
  const score = useMemo(() => (data ? cleanScore(data) : null), [data]);
  if (row === undefined)
    return (
      <View className="items-center rounded-lg p-4" style={{ backgroundColor: colors.background }}>
        <LoadingSpinner />
      </View>
    );
  if (!score) return <Placeholder Icon={NoteIcon} text="A score that isn't shared with you (or was deleted)." />;
  return (
    <View className="gap-1.5 rounded-lg p-2" style={{ backgroundColor: colors.background }}>
      {score.title ? (
        <View className="flex-row items-center gap-1.5 px-1">
          <NoteIcon color={colors.muted} size={14} />
          <Text numberOfLines={1} className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
            {score.title}
          </Text>
        </View>
      ) : null}
      <Score transcription={score} />
    </View>
  );
}

// ---------------------------------------------------------------- the editor

type Sel = { start: number; end: number };
type TextInputWithSelection = TextInput & { setSelection?: (start: number, end: number) => void };

const TOOLS: { id: string; label: string; title: string; style?: TextStyle }[] = [
  { id: 'h', label: 'H', title: 'Heading' },
  { id: 'b', label: 'B', title: 'Bold' },
  { id: 'i', label: 'I', title: 'Italic', style: { fontStyle: 'italic' } },
  { id: 'ul', label: '•', title: 'Bulleted list' },
  { id: 'ol', label: '1.', title: 'Numbered list' },
  { id: 'task', label: '☐', title: 'Checklist' },
  { id: 'quote', label: '❝', title: 'Quote' },
  { id: 'link', label: 'Link', title: 'Link' },
];

const LINE_PREFIX: Record<string, string> = { h: '## ', ul: '- ', ol: '1. ', task: '- [ ] ', quote: '> ' };
const ANY_PREFIX = /^(#{1,6}\s+|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+|>\s?)/;

/** Applies a toolbar button to the text: wraps the selection (bold, italic, link) or sets the
    selected lines' prefix (heading, lists, quote — again to take it off). */
function apply(tool: string, text: string, sel: Sel): { text: string; sel: Sel } {
  const { start, end } = sel;
  if (tool === 'b' || tool === 'i') {
    const mark = tool === 'b' ? '**' : '*';
    const inner = text.slice(start, end);
    const next = `${text.slice(0, start)}${mark}${inner}${mark}${text.slice(end)}`;
    return { text: next, sel: inner ? { start: start + mark.length, end: end + mark.length } : { start: start + mark.length, end: start + mark.length } };
  }
  if (tool === 'link') {
    const inner = text.slice(start, end) || 'link';
    const next = `${text.slice(0, start)}[${inner}](https://)${text.slice(end)}`;
    const urlAt = start + inner.length + 3;
    return { text: next, sel: { start: urlAt, end: urlAt + 8 } };
  }
  const prefix = LINE_PREFIX[tool];
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = text.indexOf('\n', end) === -1 ? text.length : text.indexOf('\n', end);
  const lines = text.slice(lineStart, lineEnd).split('\n');
  const allHave = lines.every((l) => l.startsWith(prefix));
  const changed = lines.map((l) => (allHave ? l.slice(prefix.length) : prefix + l.replace(ANY_PREFIX, ''))).join('\n');
  const next = text.slice(0, lineStart) + changed + text.slice(lineEnd);
  const at = lineStart + changed.length;
  return { text: next, sel: { start: at, end: at } };
}

/** The teacher's note editor: a toolbar over a multiline text box. Controlled by `value`. */
export function NoteTextEditor({ value, onChange, placeholder }: { value: string; onChange: (text: string) => void; placeholder?: string }) {
  const { colors, derived } = useAppTheme();
  const input = useRef<TextInputWithSelection>(null);
  const sel = useRef<Sel>({ start: value.length, end: value.length });

  function run(tool: string) {
    const r = apply(tool, value, sel.current);
    onChange(r.text);
    sel.current = r.sel;
    // After the new text is in, put the cursor where the change ends.
    setTimeout(() => {
      input.current?.focus();
      input.current?.setSelection?.(r.sel.start, r.sel.end);
    }, 0);
  }

  return (
    <View className="gap-2">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={{ gap: 4 }}>
        {TOOLS.map((t) => (
          <Pressable
            key={t.id}
            onPress={() => run(t.id)}
            accessibilityRole="button"
            accessibilityLabel={t.title}
            android_ripple={{ color: colors['surface-hover'] }}
            className="h-10 min-w-10 items-center justify-center overflow-hidden rounded-lg px-2.5"
            style={{ backgroundColor: derived.fill }}
          >
            <Text className={t.id === 'b' ? 'font-ui-bold text-[15px] font-bold' : 'font-ui-semibold text-[15px] font-semibold'} style={[{ color: colors.foreground }, t.style]}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <TextInput
        ref={input}
        value={value}
        onChangeText={onChange}
        onSelectionChange={(e) => {
          sel.current = e.nativeEvent.selection;
        }}
        multiline
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        accessibilityLabel="Note text"
        className="font-ui rounded-xl px-3.5 text-[15px]"
        style={{ minHeight: 320, backgroundColor: colors.surface, color: colors.foreground, paddingTop: 12, paddingBottom: 12, textAlignVertical: 'top', lineHeight: 22 }}
      />
    </View>
  );
}
