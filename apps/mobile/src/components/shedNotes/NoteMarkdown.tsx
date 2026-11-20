import { Fragment, memo, useMemo, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, Text, View, type TextStyle } from 'react-native';

import { BoxCheckedIcon, BoxEmptyIcon } from '@/components/shedNotes/icons';
import { inlineText, parseMarkdown, type Align, type Block, type Inline } from '@/lib/shedNotes/markdown';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';

export const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

export type MarkdownActions = {
  /** Tick or untick the checklist item on this line (left out when the note can't be edited). */
  onTask?: (line: number) => void;
  /** A `[[link]]` tapped. */
  onWikilink: (target: string) => void;
  /** A web or site link tapped. */
  onUrl: (href: string) => void;
  onTag: (tag: string) => void;
  /** Tapping text elsewhere: edit the note there (left out when it can't be edited). */
  onTapLine?: (line: number) => void;
  /** Whether a note by this title exists (a link to one that doesn't is shown dimmed). */
  noteExists: (title: string) => boolean;
};

/**
 * A note's markdown drawn natively — the phone's reading view of a note (the website's live
 * preview): headings, paragraphs, lists with checkboxes you can tick, quotes, code, dividers,
 * tables, and in the text bold, italic, strikethrough, code, highlights, links, `[[note links]]`
 * as accent pills and #tags. Tapping any text (not a link or checkbox) calls `onTapLine` with its
 * line, so the editor opens there.
 */
export const NoteMarkdown = memo(function NoteMarkdown({ text, line, fontSize, actions }: { text: string; line: number; fontSize: number; actions: MarkdownActions }) {
  const blocks = useMemo(() => parseMarkdown(text, line), [text, line]);
  return (
    <View className="gap-3">
      {blocks.map((b) => (
        <BlockView key={`${b.kind}:${b.line}`} block={b} fontSize={fontSize} actions={actions} />
      ))}
    </View>
  );
});

function Tappable({ line, actions, children }: { line: number; actions: MarkdownActions; children: ReactNode }) {
  if (!actions.onTapLine) return <View>{children}</View>;
  const tap = actions.onTapLine;
  return (
    <Pressable onPress={() => tap(line)} accessibilityHint="Edits the note here">
      {children}
    </Pressable>
  );
}

function BlockView({ block, fontSize, actions }: { block: Block; fontSize: number; actions: MarkdownActions }) {
  const { colors, derived } = useAppTheme();
  const body: TextStyle = { color: colors.foreground, fontSize, lineHeight: Math.round(fontSize * 1.5) };
  switch (block.kind) {
    case 'heading': {
      const scale = [0, 1.6, 1.35, 1.17, 1.05, 1, 0.92][block.level] ?? 1;
      const size = Math.round(fontSize * scale);
      return (
        <Tappable line={block.line} actions={actions}>
          <Text className={block.level <= 2 ? 'font-ui-extrabold font-extrabold' : 'font-ui-bold font-bold'} style={{ color: colors.foreground, fontSize: size, lineHeight: Math.round(size * 1.25), marginTop: block.level <= 2 ? 6 : 2 }}>
            <InlineText nodes={block.inline} actions={actions} />
          </Text>
        </Tappable>
      );
    }
    case 'paragraph':
      return (
        <Tappable line={block.line} actions={actions}>
          <Text className="font-ui" style={body}>
            <InlineText nodes={block.inline} actions={actions} />
          </Text>
        </Tappable>
      );
    case 'list': {
      // Numbered items count on from the first one at their depth (as markdown does).
      const counters: number[] = [];
      return (
        <View className="gap-1.5">
          {block.items.map((item) => {
            counters.length = item.depth + 1;
            counters[item.depth] = item.ordered ? (counters[item.depth] === undefined ? item.number : counters[item.depth] + 1) : 0;
            const done = item.task === true;
            return (
              <View key={item.line} className="flex-row items-start gap-2" style={{ paddingLeft: item.depth * 20 }}>
                {item.task !== null ? (
                  <Pressable
                    onPress={actions.onTask ? () => actions.onTask?.(item.line) : undefined}
                    disabled={!actions.onTask}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: done, disabled: !actions.onTask }}
                    hitSlop={8}
                    style={{ height: body.lineHeight, justifyContent: 'center' }}
                  >
                    {done ? <BoxCheckedIcon color={colors.accent} size={Math.round(fontSize * 1.25)} /> : <BoxEmptyIcon color={colors.muted} size={Math.round(fontSize * 1.25)} />}
                  </Pressable>
                ) : (
                  <Text className="font-ui-semibold font-semibold" style={{ ...body, color: colors.muted, minWidth: item.ordered ? fontSize * 1.3 : fontSize * 0.8 }}>
                    {item.ordered ? `${counters[item.depth]}.` : item.depth % 2 ? '◦' : '•'}
                  </Text>
                )}
                <View className="flex-1">
                  <Tappable line={item.line} actions={actions}>
                    <Text className="font-ui" style={{ ...body, ...(done ? { color: colors.muted, textDecorationLine: 'line-through' } : {}) }}>
                      <InlineText nodes={item.inline} actions={actions} />
                    </Text>
                  </Tappable>
                </View>
              </View>
            );
          })}
        </View>
      );
    }
    case 'quote':
      return (
        <Tappable line={block.line} actions={actions}>
          <View className="flex-row gap-3">
            <View className="w-1 rounded-full" style={{ backgroundColor: withAlpha(colors.accent, 0.5) }} />
            <View className="flex-1 gap-1">
              {block.lines.map((l, i) => (
                <Text key={i} className="font-ui" style={{ ...body, color: colors.muted }}>
                  <InlineText nodes={l} actions={actions} />
                </Text>
              ))}
            </View>
          </View>
        </Tappable>
      );
    case 'code':
      return (
        <Tappable line={block.line} actions={actions}>
          <View className="overflow-hidden rounded-lg" style={{ backgroundColor: derived.fill }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 12 }}>
              <Text className="font-ui" style={{ fontFamily: MONO, fontSize: fontSize * 0.85, lineHeight: Math.round(fontSize * 1.3), color: colors.foreground }}>
                {block.text || ' '}
              </Text>
            </ScrollView>
          </View>
        </Tappable>
      );
    case 'rule':
      return (
        <Tappable line={block.line} actions={actions}>
          <View className="py-2">
            <View style={{ height: 1, backgroundColor: derived.hairline }} />
          </View>
        </Tappable>
      );
    case 'table':
      return <TableView block={block} fontSize={fontSize} actions={actions} />;
  }
}

/** A table: columns sized from their longest text (within limits), so rows line up; scrolls
    sideways when it's wider than the screen. */
function TableView({ block, fontSize, actions }: { block: Extract<Block, { kind: 'table' }>; fontSize: number; actions: MarkdownActions }) {
  const { colors, derived } = useAppTheme();
  const cols = Math.max(block.header.length, ...block.rows.map((r) => r.length));
  const widths = Array.from({ length: cols }, (_, c) => {
    const longest = Math.max(inlineText(block.header[c] ?? []).length, ...block.rows.map((r) => inlineText(r[c] ?? []).length));
    return Math.max(64, Math.min(220, Math.round(longest * fontSize * 0.55) + 24));
  });
  const textAlign = (a: Align | undefined) => (a === 'center' ? 'center' : a === 'right' ? 'right' : 'left');
  const row = (cells: Inline[][], header: boolean, key: string) => (
    <View key={key} className="flex-row" style={header ? { backgroundColor: derived.fill } : { borderTopWidth: 1, borderColor: derived.hairline }}>
      {widths.map((w, c) => (
        <View key={c} style={{ width: w, paddingHorizontal: 10, paddingVertical: 7 }}>
          <Text className={header ? 'font-ui-semibold font-semibold' : 'font-ui'} style={{ color: colors.foreground, fontSize: fontSize * 0.9, lineHeight: Math.round(fontSize * 1.3), textAlign: textAlign(block.align[c]) }}>
            <InlineText nodes={cells[c] ?? []} actions={actions} />
          </Text>
        </View>
      ))}
    </View>
  );
  return (
    <Tappable line={block.line} actions={actions}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="overflow-hidden rounded-lg" style={{ borderWidth: 1, borderColor: derived.hairline }}>
          {row(block.header, true, 'h')}
          {block.rows.map((r, i) => row(r, false, String(i)))}
        </View>
      </ScrollView>
    </Tappable>
  );
}

/** Inline nodes as nested `<Text>`s (each with its own font class — Geist has no synthetic bold). */
function InlineText({ nodes, actions }: { nodes: Inline[]; actions: MarkdownActions }) {
  const { colors, derived } = useAppTheme();
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.kind) {
          case 'text':
            return <Fragment key={i}>{n.text}</Fragment>;
          case 'break':
            return <Fragment key={i}>{'\n'}</Fragment>;
          case 'bold':
            return (
              <Text key={i} className="font-ui-bold font-bold">
                <InlineText nodes={n.children} actions={actions} />
              </Text>
            );
          case 'italic':
            return (
              <Text key={i} className="font-ui" style={{ fontStyle: 'italic' }}>
                <InlineText nodes={n.children} actions={actions} />
              </Text>
            );
          case 'strike':
            return (
              <Text key={i} className="font-ui" style={{ textDecorationLine: 'line-through' }}>
                <InlineText nodes={n.children} actions={actions} />
              </Text>
            );
          case 'highlight':
            return (
              <Text key={i} className="font-ui" style={{ backgroundColor: withAlpha(colors.accent, 0.25) }}>
                <InlineText nodes={n.children} actions={actions} />
              </Text>
            );
          case 'code':
            return (
              <Text key={i} className="font-ui" style={{ fontFamily: MONO, backgroundColor: derived.fill }}>
                {` ${n.text} `}
              </Text>
            );
          case 'link':
            return (
              <Text key={i} className="font-ui" onPress={() => actions.onUrl(n.href)} accessibilityRole="link" style={{ color: colors.accent, textDecorationLine: 'underline' }}>
                <InlineText nodes={n.children} actions={actions} />
              </Text>
            );
          case 'wikilink': {
            const exists = actions.noteExists(n.target);
            return (
              <Text
                key={i}
                className="font-ui-semibold font-semibold"
                onPress={() => actions.onWikilink(n.target)}
                accessibilityRole="link"
                accessibilityHint={exists ? `Opens ${n.target}` : `Makes a note called ${n.target}`}
                style={exists ? { color: colors.accent, backgroundColor: withAlpha(colors.accent, 0.12) } : { color: colors.muted, textDecorationLine: 'underline', textDecorationStyle: 'dashed' }}
              >
                {` ${n.label} `}
              </Text>
            );
          }
          case 'tag':
            return (
              <Text key={i} className="font-ui-semibold font-semibold" onPress={() => actions.onTag(n.tag)} accessibilityRole="link" style={{ color: colors.accent }}>
                #{n.tag}
              </Text>
            );
        }
      })}
    </>
  );
}
