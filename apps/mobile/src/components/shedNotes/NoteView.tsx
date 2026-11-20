import { splitNotePlaced } from '@jam-practice/core/shedNoteBlocks';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';

import { AbcBlock, FileBlock, ScoreBlock, type EmbedContext } from '@/components/shedNotes/NoteEmbeds';
import { NoteMarkdown, type MarkdownActions } from '@/components/shedNotes/NoteMarkdown';

/**
 * A whole note to read: its markdown (`NoteMarkdown`) with the music and files in it drawn in place
 * — Score Writer scores as notation, older ABC as its text, pictures and other files. Tapping a
 * block (when the note can be edited) opens the editor on that line.
 */
export function NoteView({
  body,
  fontSize,
  actions,
  context,
  onEditScore,
}: {
  body: string;
  fontSize: number;
  actions: MarkdownActions;
  context?: EmbedContext;
  /** Edit a score in the note (your own notes only). */
  onEditScore?: (scoreId: string) => void;
}) {
  const parts = useMemo(() => splitNotePlaced(body), [body]);
  const tap = actions.onTapLine;
  return (
    <View className="gap-3">
      {parts.map((p) => {
        const key = `${p.kind}:${p.line}`;
        if (p.kind === 'md') return <NoteMarkdown key={key} text={p.text} line={p.line} fontSize={fontSize} actions={actions} />;
        const inner =
          p.kind === 'score' ? (
            <ScoreBlock id={p.id} context={context} onEdit={onEditScore} />
          ) : p.kind === 'abc' ? (
            <AbcBlock abc={p.abc} />
          ) : (
            <FileBlock fileRef={p.ref} name={p.name} width={p.width} context={context} />
          );
        // A long press on music or a file edits the note at its line (a tap opens the file).
        return tap ? (
          <Pressable key={key} onLongPress={() => tap(p.end + 1)} delayLongPress={350}>
            {inner}
          </Pressable>
        ) : (
          <View key={key}>{inner}</View>
        );
      })}
    </View>
  );
}
