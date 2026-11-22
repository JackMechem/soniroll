import { api } from '@jam-practice/convex/_generated/api';
import type { Id } from '@jam-practice/convex/_generated/dataModel';
import { formatShortDate } from '@jam-practice/core/practiceLog';
import { TASK_NOTE_START, addRecordingToNote, targetKey, type NoteTarget } from '@jam-practice/core/shedNotes';
import { useConvex, useMutation } from 'convex/react';

/**
 * A task's notes, as the website's task page makes them (`PageNotes` on `TaskPage.tsx`): a Shed
 * Note attached to the task (`routine:<id>/task:<task>`, or `day:<date>/task:<task>` for a day's
 * own task), titled "<Routine> · <Task>" ("<Task> · <date>" for a day's task), starting with
 * "## Notes". A routine task's new note gets a `- [[title]]` line in the routine's own notes when
 * it has some, so they're all reachable from there. A recording made for the task goes in with
 * `shedNotes.addRecording` (under "## Recordings"), or makes the note with it.
 */

/** The task a note or recording is for. */
export type TaskPlace = {
  routineId: string | null;
  taskId: string;
  /** The day (a day's own task lives on it; for a routine's task, the day it was looked at). */
  date: string;
  routineName?: string;
  taskTitle: string;
};

export function taskNoteTarget(p: TaskPlace): NoteTarget {
  return p.routineId ? { kind: 'task', routineId: p.routineId, taskId: p.taskId } : { kind: 'dayTask', date: p.date, taskId: p.taskId };
}

/** A new note's title, and the label its "Attached to" shows. */
export function taskNoteNames(p: TaskPlace): { title: string; label: string } {
  const task = p.taskTitle || 'Untitled task';
  if (p.routineId) {
    const both = `${p.routineName || 'Routine'} · ${task}`;
    return { title: both, label: both };
  }
  return { title: `${task} · ${formatShortDate(p.date)}`, label: `${task} (${formatShortDate(p.date)})` };
}

/** A recording's player line in a note (the website's `embedText`). */
export function recordingEmbed(name: string, id: string): string {
  const clean = name.replace(/[[\]|\n]+/g, ' ').trim() || 'File';
  return `![${clean}](file:recording/${id})`;
}

export function useTaskNoteActions() {
  const convex = useConvex();
  const create = useMutation(api.shedNotes.create);
  const addRecording = useMutation(api.shedNotes.addRecording);
  const appendLine = useMutation(api.shedNotes.appendLine);

  /** The note attached to exactly this target (the first one, as the website takes it). */
  async function mainNote(target: NoteTarget) {
    const key = targetKey(target);
    const rows = await convex.query(api.shedNotes.attachedTo, { prefix: key });
    return rows.find((r) => r.target === key) ?? null;
  }

  async function linkFromRoutine(routineId: string, title: string) {
    const main = await mainNote({ kind: 'routineNotes', routineId });
    if (main) await appendLine({ id: main.noteId as Id<'shedNotes'>, line: `- [[${title}]]` });
  }

  /** Makes the task's note (linked from its routine's notes); returns its id and title. */
  async function startNote(p: TaskPlace, body: string = TASK_NOTE_START) {
    const { title, label } = taskNoteNames(p);
    const made = await create({ title, body, attach: { target: targetKey(taskNoteTarget(p)), label } });
    // The link is a nicety: the note is made either way.
    if (p.routineId) await linkFromRoutine(p.routineId, made.title).catch(() => undefined);
    return made;
  }

  /** Puts a recording's player in the task's note, or makes the note with it. */
  async function addRecordingLine(p: TaskPlace, line: string) {
    const main = await mainNote(taskNoteTarget(p));
    if (main) await addRecording({ id: main.noteId as Id<'shedNotes'>, line });
    else await startNote(p, addRecordingToNote(TASK_NOTE_START, line));
  }

  return { startNote, addRecordingLine };
}
