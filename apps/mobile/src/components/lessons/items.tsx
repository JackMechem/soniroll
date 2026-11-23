import { api } from '@jam-practice/convex/_generated/api';
import type { Id } from '@jam-practice/convex/_generated/dataModel';
import type { IRealSong } from '@jam-practice/core/iRealPro';
import type { SubmitConfig } from '@jam-practice/core/lessonFiles';
import { addDays, describeRepeat, formatMinutesShort, lessonRoutineId, totalMinutes, type Routine } from '@jam-practice/core/practiceLog';
import { noteSnippet } from '@jam-practice/core/shedNotes';
import { useMutation } from 'convex/react';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { CheckIcon, PencilIcon, TrashIcon } from '@/components/icons';
import { AssignmentWork, EMPTY_SUBMIT, StatusChip, SubmitSettings } from '@/components/lessons/assignment';
import { FileView, pickFiles, uploadFile, type PickedFile } from '@/components/lessons/files';
import {
  AssignmentIcon,
  Badge,
  ErrorLine,
  FieldLabel,
  FileIcon,
  KIND_ICON,
  KIND_LABEL,
  Tick,
  ago,
  dateKeyLabel,
  errorText,
  type LessonItem,
} from '@/components/lessons/parts';
import { LinkedChartModal } from '@/components/LinkedChartModal';
import { DateInput } from '@/components/shedLog/inputs';
import { ChoicePill, Field, GhostIcon, RoutineIcon, SmallButton } from '@/components/shedLog/parts';
import { ToolSheet } from '@/components/tool/SettingChip';
import { useGradeColors } from '@/components/tool/ear';
import { Button } from '@/components/ui';
import { useChartLinker } from '@/lib/useTuneList';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';

/**
 * One thing a teacher gave a student, as a card (the website's `ItemCard`). The teacher gets edit
 * and remove; the student ticks an assignment off (or hands it in), saves a chart to their own
 * charts, and opens a routine in their Shed Log.
 */

/** A note as one line: each line of it (a list item, a paragraph) joined with " · " rather than run
    together ("Slow the bridge down · Sing the melody"); a fenced block stays one piece. */
function notePreview(body: string, max: number): string {
  const chunks: string[] = [];
  let fence: string[] | null = null;
  for (const line of body.split('\n')) {
    if (fence) {
      fence.push(line);
      if (/^(```|~~~)\s*$/.test(line.trim())) {
        chunks.push(fence.join('\n'));
        fence = null;
      }
    } else if (/^\s*(```|~~~)/.test(line)) fence = [line];
    else if (line.trim()) chunks.push(line);
  }
  if (fence) chunks.push(fence.join('\n'));
  const text = chunks.map((c) => noteSnippet(c, max)).filter(Boolean).join(' · ');
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export function ItemCard({
  item,
  teacher,
  today,
  now,
  studentName,
  saveChartsAs,
  onOpenNotes,
  onEdit,
  onRemove,
  onToggleDone,
}: {
  item: LessonItem;
  teacher: boolean;
  today: string;
  now: number;
  studentName?: string;
  saveChartsAs?: string;
  onOpenNotes?: () => void;
  onEdit?: () => void;
  onRemove?: () => void;
  onToggleDone?: (done: boolean) => void;
}) {
  const { colors } = useAppTheme();
  const grade = useGradeColors();
  const router = useRouter();
  const Icon = KIND_ICON[item.kind];
  const overdue = item.kind === 'assignment' && !item.done && !!item.dueDate && item.dueDate < today;
  /** Hand-in assignments show their hand-in status instead of "Done". */
  const shownDone = item.done && !item.submit;
  const status = item.submission?.status;
  const hasMore =
    item.kind === 'note'
      ? !!item.body.trim() || !!onOpenNotes
      : !!item.body || !!item.fileUrl || !!item.chart || !!item.routine || (item.kind === 'assignment' && !!item.submit) || (item.kind === 'routine' && !teacher);
  return (
    <View className="gap-3 rounded-xl p-4" style={{ backgroundColor: colors.surface, borderWidth: overdue ? 1 : 0, borderColor: withAlpha(colors.danger, 0.4) }}>
      <View className="flex-row items-start gap-3">
        <View className="pt-0.5">
          {item.kind === 'assignment' && item.submit ? (
            <View
              className="h-6 w-6 items-center justify-center rounded-md"
              style={{ backgroundColor: status === 'reviewed' ? grade.correct : status === 'submitted' ? colors.accent : status === 'changes' ? withAlpha(grade.partial, 0.2) : 'transparent' }}
            >
              {status === 'reviewed' || status === 'submitted' ? (
                <CheckIcon color={status === 'reviewed' ? '#ffffff' : colors['accent-foreground']} size={16} />
              ) : (
                <AssignmentIcon color={status === 'changes' ? grade.partial : colors.muted} size={17} />
              )}
            </View>
          ) : item.kind === 'assignment' && (onToggleDone || item.done) ? (
            // Only the student ticks it off; the teacher sees the tick once it's done, else the icon.
            <Tick checked={item.done} label={item.done ? (onToggleDone ? 'Mark as not done' : 'Done') : 'Mark as done'} onPress={onToggleDone ? () => onToggleDone(!item.done) : undefined} />
          ) : (
            <View className="h-6 w-6 items-center justify-center">
              <Icon color={colors.muted} size={18} />
            </View>
          )}
        </View>
        <View className="flex-1 gap-1">
          <Text
            className="font-ui-semibold text-[15px] font-semibold"
            style={{ color: shownDone ? colors.muted : colors.foreground, textDecorationLine: shownDone ? 'line-through' : 'none' }}
          >
            {item.title}
          </Text>
          <View className="flex-row flex-wrap items-center gap-1.5">
            <Badge>{KIND_LABEL[item.kind]}</Badge>
            {item.kind === 'assignment' && item.dueDate ? (
              <Badge tone={overdue ? 'danger' : shownDone ? 'success' : 'muted'}>{shownDone ? 'Done' : `${overdue ? 'Overdue · ' : 'Due '}${dateKeyLabel(item.dueDate)}`}</Badge>
            ) : null}
            {item.submission ? <StatusChip status={item.submission.status} /> : null}
            {item.kind === 'assignment' && item.done && !item.dueDate && !item.submit ? <Badge tone="success">Done</Badge> : null}
          </View>
          <Text className="font-ui text-xs" style={{ color: colors.muted }}>
            {item.updatedAt > item.createdAt + 60000 ? `Updated ${ago(item.updatedAt, now)}` : `Added ${ago(item.createdAt, now)}`}
            {item.done && item.doneAt && !item.submit ? ` · done ${ago(item.doneAt, now)}` : ''}
          </Text>
        </View>
        {teacher && (onEdit || onRemove) ? (
          <View className="-mr-2 -mt-1 flex-row">
            {onEdit ? <GhostIcon Icon={PencilIcon} label={`Edit ${item.title}`} onPress={onEdit} /> : null}
            {onRemove ? <GhostIcon Icon={TrashIcon} label={`Remove ${item.title}`} onPress={onRemove} /> : null}
          </View>
        ) : null}
      </View>
      {/* What's under the heading lines up with the title, not the tick. */}
      {hasMore ? (
        <View className="gap-3" style={{ marginLeft: 36 }}>
          {item.kind === 'note' ? (
            <>
              {item.body.trim() ? (
                <Text numberOfLines={3} className="font-ui text-sm leading-5" style={{ color: colors.foreground }}>
                  {notePreview(item.body, 320)}
                </Text>
              ) : null}
              {onOpenNotes ? (
                <View className="self-start">
                  <SmallButton label={teacher ? 'Open in notes' : 'Read the notes'} onPress={onOpenNotes} />
                </View>
              ) : null}
            </>
          ) : item.body ? (
            <Text selectable className="font-ui text-sm leading-5" style={{ color: colors.foreground }}>
              {item.body}
            </Text>
          ) : null}
          {item.fileUrl ? <FileView url={item.fileUrl} name={item.fileName ?? item.title} type={item.fileType ?? ''} /> : null}
          {item.chart ? <ChartView chart={item.chart as IRealSong} saveAs={saveChartsAs} /> : null}
          {item.routine ? <RoutineSummary routine={item.routine} /> : null}
          {item.kind === 'assignment' && item.submit ? <AssignmentWork item={item} teacher={teacher} studentName={studentName} now={now} /> : null}
          {item.kind === 'routine' && !teacher ? (
            <View className="self-start">
              <SmallButton primary label="Open in your Shed Log" onPress={() => router.push({ pathname: '/tool/shed-log-routine', params: { id: lessonRoutineId(item.id) } })} />
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** A chart: open it full screen, and (student) save a copy into your own charts. */
function ChartView({ chart, saveAs }: { chart: IRealSong; saveAs?: string }) {
  const { colors } = useAppTheme();
  const [open, setOpen] = useState(false);
  // Lessons are signed in, so straight to the account's charts (not the whole library hook, which
  // loads every chart).
  const importSongs = useMutation(api.chordCharts.importSongs);
  const linkToTunes = useChartLinker();
  const [saved, setSaved] = useState<string | null>(null);
  return (
    <View className="gap-2">
      <View className="flex-row flex-wrap gap-2">
        <SmallButton label="Show chart" onPress={() => setOpen(true)} />
        {saveAs ? (
          <SmallButton
            primary
            label="Save to my charts"
            disabled={!!saved}
            onPress={async () => {
              try {
                const { added, ids } = await importSongs({ playlistName: saveAs, songs: [chart] });
                // On the tune with its name (or a new one in the Library list), as on the website.
                if (added && ids[0]) linkToTunes([{ id: ids[0], title: chart.title, timeSignature: chart.timeSignature }]);
                setSaved(added ? `Saved to your charts, in "${saveAs}".` : "It's already in your charts.");
              } catch (e) {
                setSaved(errorText(e, "Couldn't save it."));
              }
            }}
          />
        ) : null}
      </View>
      {saved ? (
        <Text className="font-ui text-xs" style={{ color: colors.muted }}>
          {saved}
        </Text>
      ) : null}
      <LinkedChartModal chart={open ? chart : null} onClose={() => setOpen(false)} />
    </View>
  );
}

function RoutineSummary({ routine }: { routine: Routine }) {
  const { colors } = useAppTheme();
  return (
    <View className="gap-2 rounded-xl p-3" style={{ backgroundColor: colors.background }}>
      <View className="flex-row items-center gap-2.5">
        <RoutineIcon icon={routine.icon} color={routine.color} size={32} />
        <View className="flex-1">
          <Text numberOfLines={1} className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
            {routine.name}
          </Text>
          <Text numberOfLines={1} className="font-ui text-xs" style={{ color: colors.muted }}>
            {describeRepeat(routine.repeat)} · {formatMinutesShort(totalMinutes(routine))}
          </Text>
        </View>
      </View>
      {routine.tasks.map((t, i) => (
        <View key={t.id} className="flex-row gap-2">
          <Text className="font-ui w-4 text-right text-xs" style={{ color: colors.muted, fontVariant: ['tabular-nums'] }}>
            {i + 1}
          </Text>
          <Text numberOfLines={1} className="font-ui flex-1 text-sm" style={{ color: colors.foreground }}>
            {t.title}
          </Text>
          <Text className="font-ui text-xs" style={{ color: colors.muted, fontVariant: ['tabular-nums'] }}>
            {formatMinutesShort(t.minutes)}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------- add / edit

export const MAX_FILE_MB = 25;
const FILE_TYPES = ['application/pdf', 'image/*', 'audio/*'];

export type ItemEdit = { kind: 'assignment' | 'file'; item?: LessonItem };

/** Add or edit an assignment or a file (title, text, due date, how it's handed in, the file). */
export function ItemSheet({
  lessonId,
  sessionId,
  edit,
  today,
  onClose,
}: {
  lessonId: Id<'lessonStudents'>;
  /** The lesson a new item goes in. */
  sessionId?: Id<'lessonSessions'>;
  edit: ItemEdit | null;
  today: string;
  onClose: () => void;
}) {
  const editing = !!edit?.item;
  const title = edit ? `${editing ? 'Edit' : edit.kind === 'file' ? 'Add a' : 'New'} ${edit.kind === 'assignment' ? 'assignment' : 'file'}` : '';
  return (
    <ToolSheet visible={!!edit} onClose={onClose} title={title}>
      {edit ? <ItemForm key={edit.item?.id ?? edit.kind} lessonId={lessonId} sessionId={sessionId} edit={edit} today={today} onClose={onClose} /> : null}
    </ToolSheet>
  );
}

function ItemForm({ lessonId, sessionId, edit, today, onClose }: { lessonId: Id<'lessonStudents'>; sessionId?: Id<'lessonSessions'>; edit: ItemEdit; today: string; onClose: () => void }) {
  const { colors } = useAppTheme();
  const add = useMutation(api.lessons.addItem);
  const update = useMutation(api.lessons.updateItem);
  const generate = useMutation(api.lessons.generateUploadUrl);
  const { kind, item } = edit;
  const [title, setTitle] = useState(item?.title ?? '');
  const [body, setBody] = useState(item?.body ?? '');
  const [due, setDue] = useState<string | null>(item ? item.dueDate : null);
  const [submit, setSubmit] = useState<SubmitConfig | null>(item ? item.submit : EMPTY_SUBMIT);
  const [file, setFile] = useState<PickedFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editing = !!item;
  const needsFile = kind === 'file' && !editing;

  async function choose() {
    const [f] = await pickFiles(FILE_TYPES);
    if (!f) return;
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`That file is over ${MAX_FILE_MB} MB.`);
      return;
    }
    setError(null);
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (item) {
        await update({ itemId: item.id, title, body, ...(kind === 'assignment' ? { dueDate: due, submit } : {}) });
      } else {
        const fileArgs = file ? { fileId: await uploadFile(file, generate), fileName: file.name, fileType: file.type } : {};
        await add({
          lessonId,
          kind,
          ...(sessionId ? { sessionId } : {}),
          title: title || file?.name || '',
          body,
          ...(kind === 'assignment' && due ? { dueDate: due } : {}),
          ...(kind === 'assignment' && submit ? { submit } : {}),
          ...fileArgs,
        });
      }
      onClose();
    } catch (e) {
      setError(errorText(e, "Couldn't save that."));
      setBusy(false);
    }
  }

  return (
    <>
      {!editing ? (
        <Pressable
          onPress={() => void choose()}
          accessibilityRole="button"
          android_ripple={{ color: colors['surface-hover'] }}
          className="items-center gap-1 overflow-hidden rounded-xl p-4"
          style={{ backgroundColor: colors.background }}
        >
          <FileIcon color={colors.muted} size={22} />
          <Text numberOfLines={1} className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
            {file ? file.name : kind === 'file' ? 'Choose a PDF, image or audio file' : 'Attach a sheet, image or recording'}
          </Text>
          <Text className="font-ui text-xs" style={{ color: colors.muted }}>
            {kind === 'file' ? '' : 'Optional · '}up to {MAX_FILE_MB} MB
          </Text>
        </Pressable>
      ) : null}
      <View className="gap-1.5">
        <FieldLabel>Title</FieldLabel>
        <Field value={title} onChangeText={setTitle} placeholder={kind === 'assignment' ? 'e.g. Learn the head of Autumn Leaves' : 'File name'} autoFocus={kind === 'assignment' && !editing} />
      </View>
      <View className="gap-1.5">
        <FieldLabel aside={kind === 'file' ? '(optional)' : undefined}>{kind === 'assignment' ? 'Details' : 'Note'}</FieldLabel>
        <Field value={body} onChangeText={setBody} multiline placeholder={kind === 'assignment' ? 'What to do, and how' : ''} label={kind === 'assignment' ? 'Details' : 'Note'} />
      </View>
      {kind === 'assignment' ? (
        <>
          <View className="gap-2">
            <FieldLabel>Due</FieldLabel>
            <View className="flex-row gap-2">
              <ChoicePill label="No due date" on={!due} onPress={() => setDue(null)} />
              <ChoicePill label="Due on a day" on={!!due} onPress={() => setDue((d) => d ?? addDays(today, 7))} />
            </View>
            {due ? <DateInput value={due} onChange={setDue} /> : null}
          </View>
          <SubmitSettings value={submit} onChange={setSubmit} />
        </>
      ) : null}
      <ErrorLine>{error}</ErrorLine>
      <View className="flex-row justify-end gap-2">
        <Button label="Cancel" kind="secondary" onPress={onClose} />
        <Button label={busy ? 'Saving…' : editing ? 'Save' : 'Add'} disabled={busy || (needsFile && !file) || (!title.trim() && !file)} onPress={() => void save()} />
      </View>
    </>
  );
}
