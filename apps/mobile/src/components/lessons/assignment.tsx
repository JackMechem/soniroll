import { api } from '@jam-practice/convex/_generated/api';
import type { Id } from '@jam-practice/convex/_generated/dataModel';
import {
  FILE_KINDS,
  MAX_SUBMIT_FILES,
  MAX_SUBMIT_LINKS,
  MAX_SUBMIT_MB,
  cleanExtension,
  describeFiles,
  describeSubmit,
  fileAllowed,
  type SubmitConfig,
} from '@jam-practice/core/lessonFiles';
import { useMutation } from 'convex/react';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { CheckIcon, CloseIcon, LinkIcon, PlusIcon } from '@/components/icons';
import { FileView, openUrl, pickFiles, sizeLabel, uploadFile, type PickedFile } from '@/components/lessons/files';
import { Badge, ErrorLine, FieldLabel, FileIcon, ago, errorText, type Submission, type Tone } from '@/components/lessons/parts';
import { ChoicePill, Field, SmallButton } from '@/components/shedLog/parts';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * Assignments' hand-ins on the phone (the website's `components/lessons/assignment.tsx`): the
 * teacher's "How they hand it in" settings, the student's hand-in form (files, text, links — what
 * the teacher asked for), what was handed in, and the teacher's feedback.
 */

export const EMPTY_SUBMIT: SubmitConfig = { file: true, text: false, link: false, fileKinds: [], extensions: [] };

/** The teacher's "How they hand it in". `null` = nothing to hand in (they tick it off). */
export function SubmitSettings({ value, onChange }: { value: SubmitConfig | null; onChange: (v: SubmitConfig | null) => void }) {
  const { colors } = useAppTheme();
  const [ext, setExt] = useState('');
  const on = value !== null;
  const c = value ?? EMPTY_SUBMIT;
  const set = (p: Partial<SubmitConfig>) => {
    const next = { ...c, ...p };
    onChange(next.file || next.text || next.link ? next : null);
  };
  const toggleKind = (id: string) => {
    if (id === 'any') return set({ fileKinds: c.fileKinds.includes('any') ? [] : ['any'], extensions: [] });
    const kinds = c.fileKinds.filter((k) => k !== 'any');
    set({ fileKinds: kinds.includes(id) ? kinds.filter((k) => k !== id) : [...kinds, id] });
  };
  const anyFile = (c.fileKinds.length === 0 && c.extensions.length === 0) || c.fileKinds.includes('any');
  function addExt() {
    const e = cleanExtension(ext);
    if (e && !c.extensions.includes(e)) set({ extensions: [...c.extensions, e], fileKinds: c.fileKinds.filter((k) => k !== 'any') });
    setExt('');
  }
  return (
    <View className="gap-3 rounded-xl p-3.5" style={{ backgroundColor: colors.background }}>
      <View className="gap-2">
        <FieldLabel>How they hand it in</FieldLabel>
        <View className="flex-row flex-wrap gap-2">
          <ChoicePill label="Just tick it off" on={!on} onPress={() => onChange(null)} />
          <ChoicePill label="Upload a file" on={on && c.file} onPress={() => set({ file: !(on && c.file) })} />
          <ChoicePill label="Write text" on={on && c.text} onPress={() => set(on ? { text: !c.text } : { ...EMPTY_SUBMIT, file: false, text: true })} />
          <ChoicePill label="Paste a link" on={on && c.link} onPress={() => set(on ? { link: !c.link } : { ...EMPTY_SUBMIT, file: false, link: true })} />
        </View>
        <Text className="font-ui text-xs" style={{ color: colors.muted }}>
          {on ? `They hand in ${describeSubmit(c)}; you review it and give feedback.` : "No hand-in — they tick it off when it's done."}
        </Text>
      </View>
      {on && c.file ? (
        <View className="gap-2">
          <FieldLabel>Files you&apos;ll take</FieldLabel>
          <View className="flex-row flex-wrap gap-2">
            {FILE_KINDS.map((k) => (
              <ChoicePill key={k.id} label={k.label} on={k.id === 'any' ? anyFile : c.fileKinds.includes(k.id)} onPress={() => toggleKind(k.id)} />
            ))}
            {c.extensions.map((e) => (
              <Pressable
                key={e}
                onPress={() => set({ extensions: c.extensions.filter((x) => x !== e) })}
                accessibilityLabel={`Remove ${e}`}
                className="h-9 flex-row items-center gap-1 rounded-full pl-3.5 pr-2.5"
                style={{ backgroundColor: colors.accent }}
              >
                <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors['accent-foreground'] }}>
                  {e}
                </Text>
                <CloseIcon color={colors['accent-foreground']} size={14} />
              </Pressable>
            ))}
          </View>
          <View className="flex-row items-center gap-2">
            <View className="flex-1">
              <Field value={ext} onChangeText={setExt} placeholder="Another type, e.g. .logicx" onSubmit={addExt} />
            </View>
            <SmallButton label="Add" onPress={addExt} disabled={!cleanExtension(ext)} />
          </View>
          <Text className="font-ui text-xs" style={{ color: colors.muted }}>
            Taking {describeFiles(c)} · up to {MAX_SUBMIT_FILES} files, {MAX_SUBMIT_MB} MB each.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const STATUS_LABEL: Record<Submission['status'], string> = { submitted: 'Handed in', reviewed: 'Reviewed', changes: 'Needs changes' };
const STATUS_TONE: Record<Submission['status'], Tone> = { submitted: 'muted', reviewed: 'success', changes: 'warn' };

export function StatusChip({ status }: { status: Submission['status'] }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}

/** A link that looks like one (the server checks it properly). */
const looksLikeLink = (s: string) => /^(https?:\/\/)?[^\s/.]+(\.[^\s/.]+)+(\/\S*)?$/i.test(s.trim());

/** What was handed in: text, links, files. */
function SubmissionView({ s }: { s: Submission }) {
  const { colors } = useAppTheme();
  return (
    <View className="gap-2">
      {s.text ? (
        <Text selectable className="font-ui rounded-lg px-3 py-2 text-sm leading-5" style={{ color: colors.foreground, backgroundColor: colors.background }}>
          {s.text}
        </Text>
      ) : null}
      {s.links.map((l) => (
        <Pressable key={l} onPress={() => openUrl(l)} accessibilityRole="link" className="flex-row items-center gap-2 rounded-lg px-3 py-2" style={{ backgroundColor: colors.background }}>
          <LinkIcon color={colors.accent} size={16} />
          <Text numberOfLines={1} className="font-ui-semibold flex-1 text-sm font-semibold" style={{ color: colors.accent }}>
            {l}
          </Text>
        </Pressable>
      ))}
      {s.files.map((f) => (f.url ? <FileView key={f.fileId} url={f.url} name={f.name} type={f.type} /> : null))}
    </View>
  );
}

function Feedback({ label, text }: { label: string; text: string }) {
  const { colors } = useAppTheme();
  return (
    <View className="gap-0.5 py-0.5 pl-3" style={{ borderLeftWidth: 2, borderColor: colors.accent }}>
      <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.muted }}>
        {label}
      </Text>
      <Text selectable className="font-ui text-sm leading-5" style={{ color: colors.foreground }}>
        {text}
      </Text>
    </View>
  );
}

type Item = { id: Id<'lessonItems'>; title: string; submit: SubmitConfig | null; submission: Submission | null };

/** An assignment's hand-in, under its card. Student: the form, then what they handed in and the
    feedback. Teacher: what came in, and feedback — "Mark reviewed" or "Ask for changes". */
export function AssignmentWork({ item, teacher, studentName, now }: { item: Item; teacher: boolean; studentName?: string; now: number }) {
  const { colors } = useAppTheme();
  const s = item.submission;
  const [editing, setEditing] = useState(false);
  if (!item.submit) return null;
  if (teacher) {
    return (
      <View className="gap-2 rounded-xl p-3" style={{ backgroundColor: colors.background }}>
        {s ? (
          <>
            <View className="flex-row flex-wrap items-center gap-2">
              <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
                {studentName ?? 'Your student'} handed this in
              </Text>
              <StatusChip status={s.status} />
              <Text className="font-ui text-xs" style={{ color: colors.muted }}>
                {ago(s.updatedAt, now)}
              </Text>
            </View>
            <SubmissionView s={s} />
            <ReviewForm key={`${s.id}-${s.status}`} itemId={item.id} s={s} />
          </>
        ) : (
          <Text className="font-ui text-sm" style={{ color: colors.muted }}>
            Not handed in yet · they&apos;ll hand in {describeSubmit(item.submit)}.
          </Text>
        )}
      </View>
    );
  }
  const open = !s || editing || s.status === 'changes';
  return (
    <View className="gap-2 rounded-xl p-3" style={{ backgroundColor: colors.background }}>
      {s ? (
        <>
          <View className="flex-row flex-wrap items-center gap-2">
            <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
              Your hand-in
            </Text>
            <StatusChip status={s.status} />
            <Text className="font-ui text-xs" style={{ color: colors.muted }}>
              {ago(s.updatedAt, now)}
            </Text>
          </View>
          {s.feedback ? <Feedback label="Feedback" text={s.feedback} /> : null}
          {!open ? <SubmissionView s={s} /> : null}
        </>
      ) : null}
      {open ? (
        <HandInForm item={item} config={item.submit} previous={s} onDone={() => setEditing(false)} onCancel={s && s.status !== 'changes' ? () => setEditing(false) : undefined} />
      ) : (
        <StudentActions itemId={item.id} s={s!} onEdit={() => setEditing(true)} />
      )}
    </View>
  );
}

function StudentActions({ itemId, s, onEdit }: { itemId: Id<'lessonItems'>; s: Submission; onEdit: () => void }) {
  const withdraw = useMutation(api.lessons.withdrawSubmission);
  const [error, setError] = useState<string | null>(null);
  return (
    <View className="gap-1.5">
      <View className="flex-row flex-wrap gap-2">
        <SmallButton label={s.status === 'reviewed' ? 'Hand in again' : 'Change your hand-in'} onPress={onEdit} />
        {s.status === 'submitted' ? (
          <SmallButton label="Take it back" onPress={() => void withdraw({ itemId }).catch((e) => setError(errorText(e, "Couldn't take it back.")))} />
        ) : null}
      </View>
      <ErrorLine>{error}</ErrorLine>
    </View>
  );
}

function HandInForm({ item, config, previous, onDone, onCancel }: { item: Item; config: SubmitConfig; previous: Submission | null; onDone: () => void; onCancel?: () => void }) {
  const { colors } = useAppTheme();
  const submit = useMutation(api.lessons.submitWork);
  const generate = useMutation(api.lessons.generateSubmitUploadUrl);
  const [text, setText] = useState(previous?.text ?? '');
  const [links, setLinks] = useState<string[]>(previous?.links.length ? previous.links : ['']);
  const [kept, setKept] = useState(previous?.files ?? []);
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const total = kept.length + files.length;

  async function pick() {
    setError(null);
    const picked = await pickFiles([], true);
    const add: PickedFile[] = [];
    for (const f of picked) {
      if (!fileAllowed(config, f.name, f.type)) {
        setError(`${f.name} isn't a file this assignment takes (${describeFiles(config)}).`);
        continue;
      }
      if (f.size > MAX_SUBMIT_MB * 1024 * 1024) {
        setError(`${f.name} is over ${MAX_SUBMIT_MB} MB.`);
        continue;
      }
      add.push(f);
    }
    setFiles((cur) => [...cur, ...add].slice(0, MAX_SUBMIT_FILES - kept.length));
  }

  const badLink = config.link && links.some((l) => l.trim() && !looksLikeLink(l));
  const hasSomething = (config.text && text.trim()) || (config.link && links.some((l) => looksLikeLink(l))) || (config.file && total > 0);

  async function send() {
    setError(null);
    try {
      const uploaded: { fileId: Id<'_storage'>; name: string }[] = [];
      for (const [i, f] of files.entries()) {
        setBusy(`Uploading ${i + 1} of ${files.length}…`);
        uploaded.push({ fileId: await uploadFile(f, generate), name: f.name });
      }
      setBusy('Handing in…');
      await submit({
        itemId: item.id,
        ...(config.text ? { text } : {}),
        ...(config.link ? { links: links.filter((l) => l.trim()) } : {}),
        ...(config.file ? { files: [...kept.map((f) => ({ fileId: f.fileId, name: f.name })), ...uploaded] } : {}),
      });
      setFiles([]);
      onDone();
    } catch (e) {
      setError(errorText(e, "Couldn't hand it in."));
    } finally {
      setBusy(null);
    }
  }

  const fileRows = [
    ...kept.map((f) => ({ key: f.fileId as string, name: f.name, size: f.size, drop: () => setKept((k) => k.filter((x) => x.fileId !== f.fileId)) })),
    ...files.map((f, i) => ({ key: `new-${i}-${f.name}`, name: f.name, size: f.size, drop: () => setFiles((cur) => cur.filter((_, j) => j !== i)) })),
  ];

  return (
    <View className="gap-3">
      <Text className="font-ui text-xs" style={{ color: colors.muted }}>
        Hand in {describeSubmit(config)}.
      </Text>
      {config.text ? <Field value={text} onChangeText={setText} placeholder="Your answer…" multiline label="Your answer" /> : null}
      {config.link ? (
        <View className="gap-2">
          {links.map((l, i) => (
            <View key={i} className="flex-row items-center gap-2">
              <View className="flex-1">
                <Field value={l} onChangeText={(t) => setLinks((cur) => cur.map((x, j) => (j === i ? t : x)))} placeholder="https://… (a video, a recording, a doc)" label={`Link ${i + 1}`} />
              </View>
              {links.length > 1 ? (
                <Pressable onPress={() => setLinks((cur) => cur.filter((_, j) => j !== i))} accessibilityLabel="Remove link" hitSlop={6} className="h-9 w-9 items-center justify-center">
                  <CloseIcon color={colors.muted} size={18} />
                </Pressable>
              ) : null}
            </View>
          ))}
          {badLink ? <ErrorLine>That doesn&apos;t look like a link.</ErrorLine> : null}
          {links.length < MAX_SUBMIT_LINKS ? (
            <Pressable onPress={() => setLinks((cur) => [...cur, ''])} className="flex-row items-center gap-1 self-start py-1">
              <PlusIcon color={colors.muted} size={16} />
              <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.muted }}>
                Another link
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {config.file ? (
        <View className="gap-2">
          {fileRows.map((f) => (
            <View key={f.key} className="flex-row items-center gap-2 rounded-lg py-1.5 pl-3 pr-1" style={{ backgroundColor: colors.surface }}>
              <FileIcon color={colors.muted} size={16} />
              <Text numberOfLines={1} className="font-ui-semibold flex-1 text-sm font-semibold" style={{ color: colors.foreground }}>
                {f.name}
              </Text>
              <Text className="font-ui text-xs" style={{ color: colors.muted }}>
                {sizeLabel(f.size)}
              </Text>
              <Pressable onPress={f.drop} accessibilityLabel={`Remove ${f.name}`} hitSlop={6} className="h-8 w-8 items-center justify-center">
                <CloseIcon color={colors.muted} size={16} />
              </Pressable>
            </View>
          ))}
          {total < MAX_SUBMIT_FILES ? (
            <Pressable
              onPress={() => void pick()}
              accessibilityRole="button"
              className="items-center gap-1 rounded-xl p-4"
              style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: colors['surface-hover'] }}
            >
              <FileIcon color={colors.muted} size={20} />
              <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
                {total ? 'Add another file' : 'Choose a file'}
              </Text>
              <Text className="font-ui text-xs" style={{ color: colors.muted }}>
                {describeFiles(config).replace(/^./, (ch) => ch.toUpperCase())} · up to {MAX_SUBMIT_MB} MB
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <ErrorLine>{error}</ErrorLine>
      <View className="flex-row justify-end gap-2">
        {onCancel ? <SmallButton label="Cancel" onPress={onCancel} /> : null}
        <SmallButton primary label={busy ?? (previous ? 'Hand in again' : 'Hand in')} disabled={!!busy || !hasSomething || badLink} onPress={() => void send()} />
      </View>
    </View>
  );
}

function ReviewForm({ itemId, s }: { itemId: Id<'lessonItems'>; s: Submission }) {
  const { colors } = useAppTheme();
  const review = useMutation(api.lessons.reviewSubmission);
  const [feedback, setFeedback] = useState(s.feedback ?? '');
  const [open, setOpen] = useState(s.status === 'submitted');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go(status: 'reviewed' | 'changes') {
    setBusy(true);
    setError(null);
    try {
      await review({ itemId, status, feedback });
      setOpen(false);
    } catch (e) {
      setError(errorText(e, "Couldn't save that."));
    } finally {
      setBusy(false);
    }
  }
  if (!open)
    return (
      <View className="gap-1.5">
        {s.feedback ? <Feedback label="Your feedback" text={s.feedback} /> : null}
        <Pressable onPress={() => setOpen(true)} className="self-start py-1">
          <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.accent }}>
            {s.feedback ? 'Change feedback' : 'Give feedback'}
          </Text>
        </Pressable>
      </View>
    );
  return (
    <View className="gap-2">
      <Field value={feedback} onChangeText={setFeedback} placeholder="Feedback for them (optional)" multiline label="Feedback" />
      <ErrorLine>{error}</ErrorLine>
      <View className="flex-row flex-wrap justify-end gap-2">
        <SmallButton label="Ask for changes" disabled={busy} onPress={() => void go('changes')} />
        <SmallButton primary Icon={CheckIcon} label="Mark reviewed" disabled={busy} onPress={() => void go('reviewed')} />
      </View>
    </View>
  );
}
