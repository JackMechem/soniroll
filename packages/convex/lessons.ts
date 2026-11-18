import { v } from "convex/values";
import { assertUploadsOpen } from "./lib/site";
import { assertHasRoom } from "./lib/storage";
import { getAuthUserId } from "@convex-dev/auth/server";
import { action, internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { sendEmail } from "./lib/resend";
import type { Doc, Id } from "./_generated/dataModel";
import { lastPracticed, lessonRoutineId, practiceLogFrom, publicPracticeStats, routineReport, type PracticeLogData, type Routine } from "@jam-practice/core/practiceLog";
import {
  DEFAULT_FEATURES,
  FEATURE_OF_KIND,
  MAX_SUBMIT_FILES,
  MAX_SUBMIT_LINKS,
  MAX_SUBMIT_MB,
  cleanFeatures,
  cleanLink,
  cleanSubmitConfig,
  describeFiles,
  fileAllowed,
  type LessonFeatures,
} from "@jam-practice/core/lessonFiles";

/**
 * Lessons: a teacher and their students. A teacher adds a student by name, which makes an invite
 * link (`/lessons/join?invite=`); everything the teacher adds — notes, PDFs / images, chord charts,
 * assignments, Shed Log routines — is waiting there, and becomes the student's when they open the
 * link signed in and join. The teacher then sees the student's practice: their Shed Log stats and,
 * for each routine they assigned, every day of it (status, tasks, minutes, notes, recordings).
 * Both need an account. Teachers only ever see their own students; students only their own
 * teachers' things.
 */

const LOG_KEY = "jam-practice-practice-log";
const MAX_TITLE = 160;
/** Text on an item (lesson notes are Markdown and can be long). */
const MAX_BODY = 100000;
const MAX_ITEMS = 500;

const kind = v.union(v.literal("note"), v.literal("file"), v.literal("chart"), v.literal("assignment"), v.literal("routine"));

async function me(ctx: QueryCtx) {
  return getAuthUserId(ctx);
}

/** How a person shows up: their @username and picture, else their name / email. */
export async function personOf(ctx: QueryCtx, userId: Id<"users">) {
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  const user = await ctx.db.get(userId);
  const username = profile?.username || null;
  return {
    username,
    name: username ? `@${username}` : user?.name || user?.email?.split("@")[0] || "Someone",
    avatarUrl: profile?.avatarStorageId ? await ctx.storage.getUrl(profile.avatarStorageId) : null,
  };
}

async function logOf(ctx: QueryCtx, userId: Id<"users">): Promise<PracticeLogData | null> {
  const row = await ctx.db
    .query("syncedSettings")
    .withIndex("by_user_key", (q) => q.eq("userId", userId).eq("key", LOG_KEY))
    .unique();
  if (!row) return null;
  try {
    return practiceLogFrom(JSON.parse(row.value));
  } catch {
    return null;
  }
}

/** The parts of Lessons a teacher has switched on. */
export async function featuresOf(ctx: QueryCtx, teacherId: Id<"users">): Promise<LessonFeatures> {
  const row = await ctx.db
    .query("lessonPrefs")
    .withIndex("by_teacher", (q) => q.eq("teacherId", teacherId))
    .first();
  return row ? cleanFeatures(row.features) : { ...DEFAULT_FEATURES };
}

const kindOn = (features: LessonFeatures, kind: string) => features[FEATURE_OF_KIND[kind]] !== false;

async function submissionView(ctx: QueryCtx, s: Doc<"lessonSubmissions"> | null) {
  if (!s) return null;
  return {
    id: s._id,
    text: s.text,
    links: s.links,
    files: await Promise.all(s.files.map(async (f) => ({ fileId: f.fileId, name: f.name, type: f.type, size: f.size, url: await ctx.storage.getUrl(f.fileId) }))),
    status: s.status,
    feedback: s.feedback ?? null,
    reviewedAt: s.reviewedAt ?? null,
    submittedAt: s.submittedAt,
    updatedAt: s.updatedAt,
  };
}

/** Lessons the student can't see yet (booked ones, until they start). */
export async function hiddenSessions(ctx: QueryCtx, lessonId: Id<"lessonStudents">) {
  const now = Date.now();
  const rows = await ctx.db
    .query("lessonSessions")
    .withIndex("by_lesson", (q) => q.eq("lessonId", lessonId))
    .collect();
  return new Set<string>(rows.filter((r) => r.hiddenUntil && r.hiddenUntil > now).map((r) => r._id));
}

/** A lesson's items (the kinds the teacher has switched on), with each assignment's hand-in. */
async function itemsOf(
  ctx: QueryCtx,
  lessonId: Id<"lessonStudents">,
  features: LessonFeatures,
  opts: { student?: boolean; sessionId?: Id<"lessonSessions"> | null } = {},
) {
  const hidden = opts.student ? await hiddenSessions(ctx, lessonId) : new Set<string>();
  const rows = (
    await ctx.db
      .query("lessonItems")
      .withIndex("by_lesson", (q) => q.eq("lessonId", lessonId))
      .collect()
  ).filter(
    (r) =>
      kindOn(features, r.kind) &&
      !(r.sessionId && hidden.has(r.sessionId)) &&
      (opts.sessionId === undefined || (opts.sessionId === null ? !r.sessionId && r.kind !== "routine" : r.sessionId === opts.sessionId)),
  );
  rows.sort((a, b) => b.createdAt - a.createdAt);
  return Promise.all(
    rows.map(async (r) => ({
      id: r._id,
      kind: r.kind,
      sessionId: r.sessionId ?? null,
      title: r.title,
      body: r.body,
      fileUrl: r.fileId ? await ctx.storage.getUrl(r.fileId) : null,
      fileName: r.fileName ?? null,
      fileType: r.fileType ?? null,
      chart: r.chart ?? null,
      routine: (r.routine as Routine | undefined) ?? null,
      dueDate: r.dueDate ?? null,
      done: !!r.done,
      doneAt: r.doneAt ?? null,
      submit: r.submit ?? null,
      submission:
        r.kind === "assignment"
          ? await submissionView(
              ctx,
              await ctx.db
                .query("lessonSubmissions")
                .withIndex("by_item", (q) => q.eq("itemId", r._id))
                .first(),
            )
          : null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
  );
}

function newCode() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

/** The lesson row if the caller is its teacher. */
async function asTeacher(ctx: QueryCtx, lessonId: Id<"lessonStudents">) {
  const userId = await me(ctx);
  if (!userId) return null;
  const row = await ctx.db.get(lessonId);
  return row && row.teacherId === userId ? row : null;
}

async function mustTeach(ctx: MutationCtx, lessonId: Id<"lessonStudents">) {
  const row = await asTeacher(ctx, lessonId);
  if (!row) throw new Error("That student isn't one of yours.");
  return row;
}

async function mustOwnItem(ctx: MutationCtx, itemId: Id<"lessonItems">) {
  const userId = await me(ctx);
  const item = await ctx.db.get(itemId);
  if (!userId || !item || item.teacherId !== userId) throw new Error("That isn't one of your lesson items.");
  return item;
}

const clip = (s: string, n: number) => s.trim().slice(0, n);

/** A routine from the teacher's Shed Log, checked over (it's client data) before it's stored. */
function cleanRoutine(raw: unknown): Routine | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Routine;
  if (typeof r.name !== "string" || !Array.isArray(r.tasks) || !r.repeat || typeof r.repeat !== "object") return null;
  const tasks = r.tasks
    .filter((t) => t && typeof t.id === "string" && typeof t.title === "string")
    .slice(0, 60)
    .map((t) => ({
      id: t.id,
      title: clip(t.title, MAX_TITLE),
      minutes: Math.max(0, Math.min(600, Number(t.minutes) || 0)),
      time: typeof t.time === "string" ? t.time : null,
      notes: typeof t.notes === "string" ? t.notes.slice(0, 4000) : "",
      // Tunes, charts and setlists are the teacher's own — only tools mean anything to a student.
      attachments: Array.isArray(t.attachments) ? t.attachments.filter((a) => a && a.kind === "tool") : [],
      subtasks: Array.isArray(t.subtasks)
        ? t.subtasks
            .filter((st) => st && typeof st.id === "string" && typeof st.title === "string")
            .slice(0, 40)
            .map((st) => ({ id: st.id, title: clip(st.title, MAX_TITLE) }))
        : [],
    }));
  const rep = r.repeat;
  return {
    id: typeof r.id === "string" ? r.id : "routine",
    name: clip(r.name, MAX_TITLE) || "Routine",
    description: typeof r.description === "string" ? r.description.slice(0, 4000) : "",
    color: Number.isInteger(r.color) ? r.color : 0,
    ...(typeof r.icon === "string" ? { icon: r.icon } : {}),
    startTime: typeof r.startTime === "string" ? r.startTime : null,
    repeat: {
      freq: ["once", "daily", "weekly", "monthly"].includes(rep.freq) ? rep.freq : "daily",
      interval: Math.max(1, Math.min(52, Number(rep.interval) || 1)),
      weekdays: Array.isArray(rep.weekdays) ? rep.weekdays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : [],
      start: typeof rep.start === "string" ? rep.start : "2000-01-01",
      end: typeof rep.end === "string" ? rep.end : null,
    },
    tasks,
    attachments: Array.isArray(r.attachments) ? r.attachments.filter((a) => a && a.kind === "tool") : [],
    createdAt: Number(r.createdAt) || Date.now(),
    updatedAt: Number(r.updatedAt) || Date.now(),
  };
}

// ---------------------------------------------------------------- teacher

/** Your students, for the Lessons dashboard: who they are, whether they've joined, what you've
    given them and when they last practiced. */
export const students = query({
  args: { today: v.string() },
  handler: async (ctx, { today }) => {
    const userId = await me(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("lessonStudents")
      .withIndex("by_teacher", (q) => q.eq("teacherId", userId))
      .collect();
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return Promise.all(
      rows.map(async (row) => {
        const items = await ctx.db
          .query("lessonItems")
          .withIndex("by_lesson", (q) => q.eq("lessonId", row._id))
          .collect();
        const log = row.studentId ? await logOf(ctx, row.studentId) : null;
        const stats = log ? publicPracticeStats(log, today) : null;
        const subs = await ctx.db
          .query("lessonSubmissions")
          .withIndex("by_lesson", (q) => q.eq("lessonId", row._id))
          .collect();
        const sessionRows = await ctx.db
          .query("lessonSessions")
          .withIndex("by_lesson", (q) => q.eq("lessonId", row._id))
          .collect();
        return {
          id: row._id,
          name: row.name,
          code: row.code,
          joined: !!row.studentId,
          inviteEmail: row.inviteEmail ?? null,
          student: row.studentId ? await personOf(ctx, row.studentId) : null,
          counts: {
            items: items.length,
            assignmentsOpen: items.filter((i) => i.kind === "assignment" && !i.done).length,
            assignmentsDue: items.filter((i) => i.kind === "assignment" && !i.done && i.dueDate && i.dueDate < today).length,
            routines: items.filter((i) => i.kind === "routine").length,
            toReview: subs.filter((x) => x.status === "submitted").length,
          },
          lessons: sessionRows.filter((x) => !x.cancelled).length,
          nextLesson: sessionRows.filter((x) => !x.cancelled && (x.end ?? x.start) > Date.now()).sort((a, b) => a.start - b.start)[0]?.start ?? null,
          lastPracticed: log ? lastPracticed(log, today) : null,
          streak: stats?.streak ?? 0,
          hoursThisWeek: stats?.weekHours ?? 0,
        };
      }),
    );
  },
});

/** One of your students: everything you've given them, and their practice (Shed Log stats and,
    per assigned routine, a short summary — `routineReportFor` has the days). */
export const student = query({
  args: { id: v.id("lessonStudents"), today: v.string() },
  handler: async (ctx, { id, today }) => {
    const row = await asTeacher(ctx, id);
    if (!row) return null;
    const features = await featuresOf(ctx, row.teacherId);
    const items = await itemsOf(ctx, id, features);
    const log = row.studentId ? await logOf(ctx, row.studentId) : null;
    const routines = items
      .filter((i) => i.kind === "routine")
      .map((i) => {
        const report = log ? routineReport(log, lessonRoutineId(i.id), today) : null;
        return {
          itemId: i.id,
          inLog: !!report,
          totals: report?.totals ?? null,
          recent: report?.days.slice(0, 14).map((d) => ({ date: d.date, status: d.status })) ?? [],
        };
      });
    return {
      id: row._id,
      name: row.name,
      code: row.code,
      joined: !!row.studentId,
      joinedAt: row.joinedAt ?? null,
      inviteEmail: row.inviteEmail ?? null,
      invitedAt: row.invitedAt ?? null,
      student: row.studentId ? await personOf(ctx, row.studentId) : null,
      items,
      practice: log ? publicPracticeStats(log, today) : null,
      lastPracticed: log ? lastPracticed(log, today) : null,
      routines,
      features,
    };
  },
});

/** Every day of a routine you assigned, from the student's Shed Log — and the recordings they
    attached to it. */
export const routineReportFor = query({
  args: { itemId: v.id("lessonItems"), today: v.string() },
  handler: async (ctx, { itemId, today }) => {
    const userId = await me(ctx);
    const item = await ctx.db.get(itemId);
    if (!userId || !item || item.teacherId !== userId) return null;
    const row = await ctx.db.get(item.lessonId);
    if (!row?.studentId) return { joined: false as const };
    const log = await logOf(ctx, row.studentId);
    const routineId = lessonRoutineId(itemId);
    const report = log ? routineReport(log, routineId, today) : null;
    const studentId = row.studentId;
    const recs = await ctx.db
      .query("recordings")
      .withIndex("by_user_routine", (q) => q.eq("userId", studentId).eq("routineId", routineId))
      .collect();
    recs.sort((a, b) => b.createdAt - a.createdAt);
    const recordings = await Promise.all(
      recs.slice(0, 50).map(async (r) => ({
        id: r._id,
        name: r.name,
        date: r.logDate ?? null,
        durationSec: r.durationSec,
        // A take kept only on the student's device can't be played here.
        url: r.storageId ? await ctx.storage.getUrl(r.storageId) : null,
        createdAt: r.createdAt,
      })),
    );
    return { joined: true as const, report, recordings };
  },
});

export const addStudent = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const userId = await me(ctx);
    if (!userId) throw new Error("Sign in to add students.");
    const clean = clip(name, 80);
    if (!clean) throw new Error("Give your student a name.");
    const now = Date.now();
    return ctx.db.insert("lessonStudents", { teacherId: userId, name: clean, code: newCode(), createdAt: now });
  },
});

export const renameStudent = mutation({
  args: { id: v.id("lessonStudents"), name: v.string() },
  handler: async (ctx, { id, name }) => {
    await mustTeach(ctx, id);
    const clean = clip(name, 80);
    if (clean) await ctx.db.patch(id, { name: clean });
  },
});

/** A new invite link (the old one stops working). A student who already joined stays joined. */
export const newInviteLink = mutation({
  args: { id: v.id("lessonStudents") },
  handler: async (ctx, { id }) => {
    await mustTeach(ctx, id);
    await ctx.db.patch(id, { code: newCode() });
  },
});

async function deleteLesson(ctx: MutationCtx, row: Doc<"lessonStudents">) {
  const items = await ctx.db
    .query("lessonItems")
    .withIndex("by_lesson", (q) => q.eq("lessonId", row._id))
    .collect();
  for (const item of items) {
    if (item.fileId) await ctx.storage.delete(item.fileId);
    await deleteSubmissions(ctx, item._id);
    await ctx.db.delete(item._id);
  }
  for (const x of await ctx.db
    .query("lessonSessions")
    .withIndex("by_lesson", (q) => q.eq("lessonId", row._id))
    .collect())
    await ctx.db.delete(x._id);
  for (const b of await ctx.db
    .query("lessonBookings")
    .withIndex("by_lesson", (q) => q.eq("lessonId", row._id))
    .collect())
    await ctx.db.delete(b._id);
  for (const o of await ctx.db
    .query("lessonOffers")
    .withIndex("by_lesson", (q) => q.eq("lessonId", row._id))
    .collect())
    await ctx.db.delete(o._id);
  await ctx.db.delete(row._id);
}

/** Removes a student and everything you gave them. */
export const removeStudent = mutation({
  args: { id: v.id("lessonStudents") },
  handler: async (ctx, { id }) => {
    const row = await mustTeach(ctx, id);
    await deleteLesson(ctx, row);
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await assertUploadsOpen(ctx);
    const userId = await me(ctx);
    if (!userId) throw new Error("Sign in to upload files.");
    await assertHasRoom(ctx, userId);
    return ctx.storage.generateUploadUrl();
  },
});

/** Adds a note, file or assignment for a student. */
export const addItem = mutation({
  args: {
    lessonId: v.id("lessonStudents"),
    kind,
    title: v.string(),
    body: v.optional(v.string()),
    fileId: v.optional(v.id("_storage")),
    fileName: v.optional(v.string()),
    fileType: v.optional(v.string()),
    dueDate: v.optional(v.string()),
    routine: v.optional(v.any()),
    submit: v.optional(v.any()),
    sessionId: v.optional(v.id("lessonSessions")),
  },
  handler: async (ctx, a) => {
    const row = await mustTeach(ctx, a.lessonId);
    const sessionId = a.kind === "routine" ? undefined : await checkSession(ctx, row._id, a.sessionId);
    if (!kindOn(await featuresOf(ctx, row.teacherId), a.kind)) throw new Error("That's switched off in your lesson settings.");
    const count = (
      await ctx.db
        .query("lessonItems")
        .withIndex("by_lesson", (q) => q.eq("lessonId", row._id))
        .collect()
    ).length;
    if (count >= MAX_ITEMS) throw new Error("That's a lot of things for one student — remove some old ones first.");
    if (a.kind === "chart") throw new Error("Use addChart for chord charts.");
    const routine = a.kind === "routine" ? cleanRoutine(a.routine) : null;
    if (a.kind === "routine" && !routine) throw new Error("That routine couldn't be read.");
    if (a.kind === "file" && !a.fileId) throw new Error("Choose a file.");
    const now = Date.now();
    return ctx.db.insert("lessonItems", {
      lessonId: row._id,
      teacherId: row.teacherId,
      ...(sessionId ? { sessionId } : {}),
      kind: a.kind,
      title: clip(a.title, MAX_TITLE) || (routine?.name ?? a.fileName ?? "Untitled"),
      body: (a.body ?? "").slice(0, MAX_BODY),
      ...(a.fileId ? { fileId: a.fileId, fileName: clip(a.fileName ?? "file", 200), fileType: clip(a.fileType ?? "", 100) } : {}),
      ...(a.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(a.dueDate) ? { dueDate: a.dueDate } : {}),
      ...(routine ? { routine } : {}),
      ...(a.kind === "assignment" && cleanSubmitConfig(a.submit) ? { submit: cleanSubmitConfig(a.submit)! } : {}),
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Gives a student a copy of one of your chord charts. */
export const addChart = mutation({
  args: { lessonId: v.id("lessonStudents"), songId: v.id("chordChartSongs"), body: v.optional(v.string()), sessionId: v.optional(v.id("lessonSessions")) },
  handler: async (ctx, { lessonId, songId, body, sessionId: rawSession }) => {
    const row = await mustTeach(ctx, lessonId);
    const sessionId = await checkSession(ctx, row._id, rawSession);
    if (!(await featuresOf(ctx, row.teacherId)).charts) throw new Error("Chord charts are switched off in your lesson settings.");
    const song = await ctx.db.get(songId);
    if (!song || song.userId !== row.teacherId) throw new Error("That chart isn't in your library.");
    const bars = await ctx.db
      .query("chordChartSongBars")
      .withIndex("by_song", (q) => q.eq("songId", songId))
      .first();
    const now = Date.now();
    return ctx.db.insert("lessonItems", {
      lessonId,
      teacherId: row.teacherId,
      ...(sessionId ? { sessionId } : {}),
      kind: "chart",
      title: song.title,
      body: (body ?? "").slice(0, MAX_BODY),
      chart: { title: song.title, composer: song.composer, style: song.style, key: song.key, timeSignature: song.timeSignature, bars: bars?.bars ?? [] },
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateItem = mutation({
  args: {
    itemId: v.id("lessonItems"),
    title: v.optional(v.string()),
    body: v.optional(v.string()),
    dueDate: v.optional(v.union(v.string(), v.null())),
    routine: v.optional(v.any()),
    /** An assignment's hand-in settings; `null` = nothing to hand in (just tick it off). */
    submit: v.optional(v.any()),
  },
  handler: async (ctx, a) => {
    const item = await mustOwnItem(ctx, a.itemId);
    const patch: Partial<Doc<"lessonItems">> = { updatedAt: Date.now() };
    if (a.title !== undefined) patch.title = clip(a.title, MAX_TITLE) || item.title;
    if (a.body !== undefined) patch.body = a.body.slice(0, MAX_BODY);
    if (a.dueDate !== undefined) patch.dueDate = a.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(a.dueDate) ? a.dueDate : undefined;
    if (a.submit !== undefined && item.kind === "assignment") patch.submit = cleanSubmitConfig(a.submit) ?? undefined;
    if (a.routine !== undefined && item.kind === "routine") {
      const routine = cleanRoutine(a.routine);
      if (!routine) throw new Error("That routine couldn't be read.");
      patch.routine = routine;
    }
    await ctx.db.patch(a.itemId, patch);
  },
});

export const removeItem = mutation({
  args: { itemId: v.id("lessonItems") },
  handler: async (ctx, { itemId }) => {
    const item = await mustOwnItem(ctx, itemId);
    if (item.fileId) await ctx.storage.delete(item.fileId);
    await deleteSubmissions(ctx, itemId);
    await ctx.db.delete(itemId);
  },
});

/** A lesson's notes, for its notes page — the teacher's (to write) or the student's (to read). */
export const notes = query({
  args: { lessonId: v.id("lessonStudents"), sessionId: v.optional(v.union(v.id("lessonSessions"), v.null())) },
  handler: async (ctx, { lessonId, sessionId }) => {
    const userId = await me(ctx);
    const row = await ctx.db.get(lessonId);
    if (!userId || !row) return null;
    const role = row.teacherId === userId ? ("teacher" as const) : row.studentId === userId ? ("student" as const) : null;
    if (!role) return null;
    if (!(await featuresOf(ctx, row.teacherId)).notes) return null;
    const hidden = role === "student" ? await hiddenSessions(ctx, lessonId) : new Set<string>();
    if (sessionId && hidden.has(sessionId)) return null;
    const session = sessionId ? await ctx.db.get(sessionId) : null;
    if (sessionId && (!session || session.lessonId !== lessonId)) return null;
    const items = await ctx.db
      .query("lessonItems")
      .withIndex("by_lesson", (q) => q.eq("lessonId", lessonId))
      .collect();
    const list = items
      .filter((i) => i.kind === "note" && !(i.sessionId && hidden.has(i.sessionId)))
      .filter((i) => (sessionId === undefined ? true : sessionId === null ? !i.sessionId : i.sessionId === sessionId))
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((i) => ({ id: i._id, title: i.title, body: i.body, createdAt: i.createdAt, updatedAt: i.updatedAt }));
    return {
      role,
      studentName: row.name,
      other: role === "teacher" ? (row.studentId ? await personOf(ctx, row.studentId) : null) : await personOf(ctx, row.teacherId),
      notes: list,
      session: session ? { id: session._id, title: session.title, start: session.start } : null,
    };
  },
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** How soon the same student's invite can be emailed again. */
const RESEND_AFTER_MS = 60_000;

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export const inviteDetails = internalQuery({
  args: { id: v.id("lessonStudents"), userId: v.id("users") },
  handler: async (ctx, { id, userId }) => {
    const row = await ctx.db.get(id);
    if (!row || row.teacherId !== userId) return null;
    return { code: row.code, name: row.name, joined: !!row.studentId, invitedAt: row.invitedAt ?? 0, teacher: await personOf(ctx, userId) };
  },
});

export const markInvited = internalMutation({
  args: { id: v.id("lessonStudents"), email: v.string() },
  handler: async (ctx, { id, email }) => {
    await ctx.db.patch(id, { inviteEmail: email, invitedAt: Date.now() });
  },
});

/** Emails a student their invite link (with an optional note from you). */
export const emailInvite = action({
  args: { id: v.id("lessonStudents"), email: v.string(), message: v.optional(v.string()) },
  handler: async (ctx, { id, email, message }): Promise<{ sentTo: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to send invites.");
    const to = email.trim().toLowerCase();
    if (!EMAIL_RE.test(to) || to.length > 200) throw new Error("That doesn't look like an email address.");
    const info = await ctx.runQuery(internal.lessons.inviteDetails, { id, userId });
    if (!info) throw new Error("That student isn't one of yours.");
    if (info.joined) throw new Error(`${info.name} has already joined.`);
    if (Date.now() - info.invitedAt < RESEND_AFTER_MS) throw new Error("You just sent this invite — give it a minute before sending it again.");
    const site = (process.env.SITE_URL ?? "https://www.soniroll.com").replace(/\/$/, "");
    const link = `${site}/lessons/join?invite=${info.code}`;
    const from = info.teacher.name;
    const note = (message ?? "").trim().slice(0, 1000);
    const text = [
      `Hi ${info.name},`,
      "",
      `${from} invited you to their lessons on soniroll — where they'll share lesson notes, assignments, chord charts and practice routines with you.`,
      ...(note ? ["", `“${note}”`, `— ${from}`] : []),
      "",
      `Open this link to join (sign up free if you don't have an account):`,
      link,
      "",
      "If you weren't expecting this, you can ignore it.",
    ].join("\n");
    const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111">
  <p style="font-size:13px;font-weight:700;color:#6366f1;margin:0 0 8px">Lessons on soniroll</p>
  <h1 style="font-size:22px;margin:0 0 12px">${escapeHtml(from)} invited you to their lessons</h1>
  <p style="font-size:15px;line-height:1.6;margin:0 0 16px">Hi ${escapeHtml(info.name)} — ${escapeHtml(from)} will share lesson notes, assignments, chord charts and practice routines with you here, and their routines go straight into your practice log.</p>
  ${note ? `<blockquote style="margin:0 0 16px;padding:10px 14px;border-left:3px solid #6366f1;background:#f4f4f6;font-size:15px;line-height:1.5">${escapeHtml(note).replace(/\n/g, "<br>")}<br><span style="color:#666">— ${escapeHtml(from)}</span></blockquote>` : ""}
  <p style="margin:24px 0"><a href="${link}" style="background:#6366f1;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px;display:inline-block">Join ${escapeHtml(from)}'s lessons</a></p>
  <p style="font-size:13px;color:#666;line-height:1.5;margin:0">Don't have an account? You can sign up free on the page. Or copy this link: <br><a href="${link}" style="color:#6366f1;word-break:break-all">${link}</a></p>
  <p style="font-size:12px;color:#999;margin-top:24px">If you weren't expecting this, you can ignore it.</p>
</div>`;
    await sendEmail({ to, subject: `${from} invited you to their lessons on soniroll`, text, html });
    await ctx.runMutation(internal.lessons.markInvited, { id, email: to });
    return { sentTo: to };
  },
});

// ---------------------------------------------------------------- student

/** What an invite link is for — open to anyone with the link. */
export const invite = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const row = await ctx.db
      .query("lessonStudents")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();
    if (!row) return null;
    const userId = await me(ctx);
    const items = await ctx.db
      .query("lessonItems")
      .withIndex("by_lesson", (q) => q.eq("lessonId", row._id))
      .collect();
    return {
      id: row._id,
      teacher: await personOf(ctx, row.teacherId),
      studentName: row.name,
      itemCount: items.length,
      isTeacher: !!userId && userId === row.teacherId,
      joinedByMe: !!userId && row.studentId === userId,
      taken: !!row.studentId && row.studentId !== userId,
    };
  },
});

export const join = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const userId = await me(ctx);
    if (!userId) throw new Error("Sign in to join.");
    const row = await ctx.db
      .query("lessonStudents")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();
    if (!row) throw new Error("This invite link doesn't work anymore — ask your teacher for a new one.");
    if (row.teacherId === userId) throw new Error("This is your own invite link — send it to your student.");
    if (row.studentId && row.studentId !== userId) throw new Error("Someone has already joined with this link — ask your teacher for a new one.");
    if (!row.studentId) await ctx.db.patch(row._id, { studentId: userId, joinedAt: Date.now() });
    return row._id;
  },
});

/** Your teachers and everything they've given you. */
export const myTeachers = query({
  args: {},
  handler: async (ctx) => {
    const userId = await me(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("lessonStudents")
      .withIndex("by_student", (q) => q.eq("studentId", userId))
      .collect();
    return Promise.all(
      rows.map(async (row) => ({
        id: row._id,
        name: row.name,
        joinedAt: row.joinedAt ?? row.createdAt,
        teacher: await personOf(ctx, row.teacherId),
        features: await featuresOf(ctx, row.teacherId),
        items: await itemsOf(ctx, row._id, await featuresOf(ctx, row.teacherId), { student: true }),
      })),
    );
  },
});

/** Ticks an assignment done (or not) — the student's side. */
export const setDone = mutation({
  args: { itemId: v.id("lessonItems"), done: v.boolean() },
  handler: async (ctx, { itemId, done }) => {
    const userId = await me(ctx);
    const item = await ctx.db.get(itemId);
    if (!userId || !item || item.kind !== "assignment") throw new Error("That assignment isn't here.");
    const row = await ctx.db.get(item.lessonId);
    if (!row || row.studentId !== userId) throw new Error("That assignment isn't yours.");
    if (item.submit) throw new Error("Hand this one in instead.");
    await ctx.db.patch(itemId, done ? { done: true, doneAt: Date.now() } : { done: false, doneAt: undefined });
  },
});

/** Leaves a teacher: they stop seeing your practice, and their things go from your Lessons. */
export const leave = mutation({
  args: { id: v.id("lessonStudents") },
  handler: async (ctx, { id }) => {
    const userId = await me(ctx);
    const row = await ctx.db.get(id);
    if (!userId || !row || row.studentId !== userId) return;
    await ctx.db.patch(id, { studentId: undefined, joinedAt: undefined, code: newCode() });
  },
});

/** For account deletion: a teacher's students (and their things) go; a student is unlinked. */
export async function deleteLessonsFor(ctx: MutationCtx, userId: Id<"users">) {
  const teaching = await ctx.db
    .query("lessonStudents")
    .withIndex("by_teacher", (q) => q.eq("teacherId", userId))
    .collect();
  for (const row of teaching) await deleteLesson(ctx, row);
  const prefs = await ctx.db
    .query("lessonPrefs")
    .withIndex("by_teacher", (q) => q.eq("teacherId", userId))
    .first();
  if (prefs) await ctx.db.delete(prefs._id);
  const av = await ctx.db
    .query("lessonAvailability")
    .withIndex("by_teacher", (q) => q.eq("teacherId", userId))
    .first();
  if (av) await ctx.db.delete(av._id);
  const learning = await ctx.db
    .query("lessonStudents")
    .withIndex("by_student", (q) => q.eq("studentId", userId))
    .collect();
  for (const row of learning) await ctx.db.patch(row._id, { studentId: undefined, joinedAt: undefined });
}

// ---------------------------------------------------------------- hand-ins

async function deleteSubmissions(ctx: MutationCtx, itemId: Id<"lessonItems">) {
  for (const sub of await ctx.db
    .query("lessonSubmissions")
    .withIndex("by_item", (q) => q.eq("itemId", itemId))
    .collect()) {
    for (const f of sub.files) await ctx.storage.delete(f.fileId);
    await ctx.db.delete(sub._id);
  }
}

/** An upload URL for a hand-in file (any signed-in student). */
export const generateSubmitUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await assertUploadsOpen(ctx);
    const userId = await me(ctx);
    if (!userId) throw new Error("Sign in first.");
    const learning = await ctx.db
      .query("lessonStudents")
      .withIndex("by_student", (q) => q.eq("studentId", userId))
      .first();
    if (!learning) throw new Error("Only students can hand work in.");
    await assertHasRoom(ctx, userId);
    return ctx.storage.generateUploadUrl();
  },
});

async function mustStudentItem(ctx: MutationCtx, itemId: Id<"lessonItems">) {
  const userId = await me(ctx);
  const item = await ctx.db.get(itemId);
  if (!userId || !item || item.kind !== "assignment") throw new Error("That assignment isn't here.");
  const row = await ctx.db.get(item.lessonId);
  if (!row || row.studentId !== userId) throw new Error("That assignment isn't yours.");
  if (item.sessionId && (await hiddenSessions(ctx, row._id)).has(item.sessionId)) throw new Error("That assignment isn't here.");
  return { item, row, userId };
}

/** Hands in (or re-hands in) an assignment: text, links and uploaded files, checked against what
    the teacher asked for. Handing in again replaces the last one (and its files). */
export const submitWork = mutation({
  args: {
    itemId: v.id("lessonItems"),
    text: v.optional(v.string()),
    links: v.optional(v.array(v.string())),
    files: v.optional(v.array(v.object({ fileId: v.id("_storage"), name: v.string() }))),
  },
  handler: async (ctx, a) => {
    const { item, row, userId } = await mustStudentItem(ctx, a.itemId);
    const existing = await ctx.db
      .query("lessonSubmissions")
      .withIndex("by_item", (q) => q.eq("itemId", item._id))
      .first();
    const earlier = new Set<string>(existing?.files.map((f) => f.fileId) ?? []);
    // On a refusal, only the files uploaded just now go; the ones kept from before stay.
    const dropUploads = async () => {
      for (const f of a.files ?? []) if (!earlier.has(f.fileId)) await ctx.storage.delete(f.fileId);
    };
    const config = item.submit;
    if (!config) {
      await dropUploads();
      throw new Error("This assignment doesn't take hand-ins — just tick it off.");
    }
    const text = config.text ? (a.text ?? "").trim().slice(0, MAX_BODY) : "";
    const links: string[] = [];
    for (const raw of config.link ? (a.links ?? []) : []) {
      if (!raw.trim()) continue;
      const link = cleanLink(raw);
      if (!link) {
        await dropUploads();
        throw new Error(`"${raw.slice(0, 60)}" isn't a link.`);
      }
      links.push(link);
    }
    if (links.length > MAX_SUBMIT_LINKS) {
      await dropUploads();
      throw new Error(`Up to ${MAX_SUBMIT_LINKS} links.`);
    }
    const files: Doc<"lessonSubmissions">["files"] = [];
    if ((a.files?.length ?? 0) > 0 && !config.file) {
      await dropUploads();
      throw new Error("This assignment doesn't take files.");
    }
    if ((a.files?.length ?? 0) > MAX_SUBMIT_FILES) {
      await dropUploads();
      throw new Error(`Up to ${MAX_SUBMIT_FILES} files.`);
    }
    for (const f of a.files ?? []) {
      const meta = await ctx.db.system.get(f.fileId);
      if (!meta) {
        await dropUploads();
        throw new Error("A file didn't upload — try again.");
      }
      const name = f.name.trim().slice(0, 200) || "file";
      const type = meta.contentType ?? "";
      if (meta.size > MAX_SUBMIT_MB * 1024 * 1024) {
        await dropUploads();
        throw new Error(`${name} is over ${MAX_SUBMIT_MB} MB.`);
      }
      if (!fileAllowed(config, name, type)) {
        await dropUploads();
        throw new Error(`${name} isn't a file this assignment takes (${describeFiles(config)}).`);
      }
      files.push({ fileId: f.fileId, name, type, size: meta.size });
    }
    if (!text && links.length === 0 && files.length === 0) {
      await dropUploads();
      throw new Error("Add something to hand in.");
    }
    // Keep files the student kept (re-sent by id); delete the ones they dropped.
    const keptIds = new Set(files.map((f) => f.fileId));
    if (existing) for (const f of existing.files) if (!keptIds.has(f.fileId)) await ctx.storage.delete(f.fileId);
    const now = Date.now();
    const doc = { text, links, files, status: "submitted" as const, submittedAt: now, updatedAt: now };
    if (existing) await ctx.db.patch(existing._id, doc);
    else await ctx.db.insert("lessonSubmissions", { itemId: item._id, lessonId: row._id, teacherId: row.teacherId, studentId: userId, ...doc });
    await ctx.db.patch(item._id, { done: true, doneAt: now });
  },
});

/** Takes a hand-in back (before the teacher has reviewed it). */
export const withdrawSubmission = mutation({
  args: { itemId: v.id("lessonItems") },
  handler: async (ctx, { itemId }) => {
    const { item } = await mustStudentItem(ctx, itemId);
    const sub = await ctx.db
      .query("lessonSubmissions")
      .withIndex("by_item", (q) => q.eq("itemId", item._id))
      .first();
    if (!sub) return;
    if (sub.status === "reviewed") throw new Error("Your teacher has already reviewed this.");
    await deleteSubmissions(ctx, item._id);
    await ctx.db.patch(item._id, { done: false, doneAt: undefined });
  },
});

/** The teacher's feedback on a hand-in: `reviewed` (done), or `changes` (hand it in again). */
export const reviewSubmission = mutation({
  args: { itemId: v.id("lessonItems"), status: v.union(v.literal("reviewed"), v.literal("changes")), feedback: v.string() },
  handler: async (ctx, { itemId, status, feedback }) => {
    const item = await mustOwnItem(ctx, itemId);
    const sub = await ctx.db
      .query("lessonSubmissions")
      .withIndex("by_item", (q) => q.eq("itemId", item._id))
      .first();
    if (!sub) throw new Error("Nothing has been handed in yet.");
    const now = Date.now();
    await ctx.db.patch(sub._id, { status, feedback: feedback.trim().slice(0, MAX_BODY), reviewedAt: now });
    await ctx.db.patch(item._id, status === "changes" ? { done: false, doneAt: undefined } : { done: true, doneAt: item.doneAt ?? now });
  },
});

// ---------------------------------------------------------------- features

export const myFeatures = query({
  args: {},
  handler: async (ctx) => {
    const userId = await me(ctx);
    return userId ? featuresOf(ctx, userId) : null;
  },
});

/** Switches parts of Lessons on or off for all your students (nothing is deleted). */
export const setFeatures = mutation({
  args: { features: v.any() },
  handler: async (ctx, { features }) => {
    const userId = await me(ctx);
    if (!userId) throw new Error("Sign in first.");
    const clean = cleanFeatures({ ...(await featuresOf(ctx, userId)), ...(features && typeof features === "object" ? features : {}) });
    const row = await ctx.db
      .query("lessonPrefs")
      .withIndex("by_teacher", (q) => q.eq("teacherId", userId))
      .first();
    if (row) await ctx.db.patch(row._id, { features: clean, updatedAt: Date.now() });
    else await ctx.db.insert("lessonPrefs", { teacherId: userId, features: clean, updatedAt: Date.now() });
  },
});

// ---------------------------------------------------------------- lessons (sessions)

/** A session id from the client, checked to belong to this teacher–student pair. */
async function checkSession(ctx: QueryCtx, lessonId: Id<"lessonStudents">, sessionId: Id<"lessonSessions"> | undefined) {
  if (!sessionId) return undefined;
  const s = await ctx.db.get(sessionId);
  if (!s || s.lessonId !== lessonId) throw new Error("That lesson isn't this student's.");
  return sessionId;
}

/** Who the caller is to a teacher–student pair. */
async function pairRole(ctx: QueryCtx, lessonId: Id<"lessonStudents">) {
  const userId = await me(ctx);
  const row = await ctx.db.get(lessonId);
  if (!userId || !row) return null;
  if (row.teacherId === userId) return { row, role: "teacher" as const };
  if (row.studentId === userId) return { row, role: "student" as const };
  return null;
}

function countsOf(items: Doc<"lessonItems">[], subs: Map<string, Doc<"lessonSubmissions">>) {
  const assignments = items.filter((i) => i.kind === "assignment");
  return {
    notes: items.filter((i) => i.kind === "note").length,
    assignments: assignments.length,
    files: items.filter((i) => i.kind === "file").length,
    charts: items.filter((i) => i.kind === "chart").length,
    open: assignments.filter((i) => !i.done).length,
    toReview: assignments.filter((i) => subs.get(i._id)?.status === "submitted").length,
  };
}

/** A student's lessons, newest first — every one for the teacher; for the student, the ones they
    can see. Items from before lessons existed come back as `earlier`. */
export const sessions = query({
  args: { lessonId: v.id("lessonStudents") },
  handler: async (ctx, { lessonId }) => {
    const who = await pairRole(ctx, lessonId);
    if (!who) return null;
    const now = Date.now();
    const features = await featuresOf(ctx, who.row.teacherId);
    const rows = await ctx.db
      .query("lessonSessions")
      .withIndex("by_lesson", (q) => q.eq("lessonId", lessonId))
      .collect();
    const items = (
      await ctx.db
        .query("lessonItems")
        .withIndex("by_lesson", (q) => q.eq("lessonId", lessonId))
        .collect()
    ).filter((i) => i.kind !== "routine" && kindOn(features, i.kind));
    const subs = new Map(
      (
        await ctx.db
          .query("lessonSubmissions")
          .withIndex("by_lesson", (q) => q.eq("lessonId", lessonId))
          .collect()
      ).map((x) => [x.itemId as string, x]),
    );
    const visible = rows.filter((r) => who.role === "teacher" || !r.hiddenUntil || r.hiddenUntil <= now);
    visible.sort((a, b) => b.start - a.start);
    const earlier = items.filter((i) => !i.sessionId);
    return {
      role: who.role,
      features,
      sessions: visible.map((r) => ({
        id: r._id,
        title: r.title,
        start: r.start,
        end: r.end ?? null,
        booked: !!r.bookingId,
        cancelled: !!r.cancelled,
        hiddenUntil: r.hiddenUntil && r.hiddenUntil > now ? r.hiddenUntil : null,
        counts: countsOf(
          items.filter((i) => i.sessionId === r._id),
          subs,
        ),
      })),
      earlier: earlier.length ? countsOf(earlier, subs) : null,
    };
  },
});

/** One lesson and everything in it (`sessionId` left out = the "Earlier" items). */
export const session = query({
  args: { lessonId: v.id("lessonStudents"), sessionId: v.optional(v.id("lessonSessions")) },
  handler: async (ctx, { lessonId, sessionId }) => {
    const who = await pairRole(ctx, lessonId);
    if (!who) return null;
    const now = Date.now();
    const s = sessionId ? await ctx.db.get(sessionId) : null;
    if (sessionId && (!s || s.lessonId !== lessonId)) return null;
    if (s && who.role === "student" && s.hiddenUntil && s.hiddenUntil > now) return null;
    const features = await featuresOf(ctx, who.row.teacherId);
    return {
      role: who.role,
      features,
      lessonId,
      studentName: who.row.name,
      other: who.role === "teacher" ? (who.row.studentId ? await personOf(ctx, who.row.studentId) : null) : await personOf(ctx, who.row.teacherId),
      session: s
        ? {
            id: s._id,
            title: s.title,
            start: s.start,
            end: s.end ?? null,
            booked: !!s.bookingId,
            cancelled: !!s.cancelled,
            hiddenUntil: s.hiddenUntil && s.hiddenUntil > now ? s.hiddenUntil : null,
          }
        : null,
      items: await itemsOf(ctx, lessonId, features, { student: who.role === "student", sessionId: sessionId ?? null }),
    };
  },
});

export const createSession = mutation({
  args: { lessonId: v.id("lessonStudents"), title: v.string(), start: v.number(), end: v.optional(v.number()), hidden: v.optional(v.boolean()) },
  handler: async (ctx, a) => {
    const row = await mustTeach(ctx, a.lessonId);
    const now = Date.now();
    const start = Number.isFinite(a.start) ? a.start : now;
    return ctx.db.insert("lessonSessions", {
      lessonId: row._id,
      teacherId: row.teacherId,
      title: clip(a.title, MAX_TITLE) || "Lesson",
      start,
      ...(a.end && a.end > start ? { end: a.end } : {}),
      ...(a.hidden && start > now ? { hiddenUntil: start } : {}),
      createdAt: now,
      updatedAt: now,
    });
  },
});

async function mustOwnSession(ctx: MutationCtx, sessionId: Id<"lessonSessions">) {
  const userId = await me(ctx);
  const s = await ctx.db.get(sessionId);
  if (!userId || !s || s.teacherId !== userId) throw new Error("That lesson isn't yours.");
  return s;
}

/** Renames / re-dates a lesson, or shows it to the student now (`hidden: false`) or hides it until
    it starts (`hidden: true`). */
export const updateSession = mutation({
  args: {
    sessionId: v.id("lessonSessions"),
    title: v.optional(v.string()),
    start: v.optional(v.number()),
    end: v.optional(v.union(v.number(), v.null())),
    hidden: v.optional(v.boolean()),
  },
  handler: async (ctx, a) => {
    const s = await mustOwnSession(ctx, a.sessionId);
    const patch: Partial<Doc<"lessonSessions">> = { updatedAt: Date.now() };
    if (a.title !== undefined) patch.title = clip(a.title, MAX_TITLE) || s.title;
    if (a.start !== undefined && Number.isFinite(a.start)) patch.start = a.start;
    if (a.end !== undefined) patch.end = a.end && a.end > (patch.start ?? s.start) ? a.end : undefined;
    if (a.hidden !== undefined) patch.hiddenUntil = a.hidden ? (patch.start ?? s.start) : undefined;
    else if (patch.start !== undefined && s.hiddenUntil) patch.hiddenUntil = patch.start;
    await ctx.db.patch(a.sessionId, patch);
  },
});

/** Deletes a lesson and everything in it (notes, assignments and their hand-ins, files, charts). */
export const removeSession = mutation({
  args: { sessionId: v.id("lessonSessions") },
  handler: async (ctx, { sessionId }) => {
    const s = await mustOwnSession(ctx, sessionId);
    for (const item of await ctx.db
      .query("lessonItems")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .collect()) {
      if (item.fileId) await ctx.storage.delete(item.fileId);
      await deleteSubmissions(ctx, item._id);
      await ctx.db.delete(item._id);
    }
    await ctx.db.delete(s._id);
  },
});

/** Moves an item into a lesson (from "Earlier", or another lesson). */
export const moveItem = mutation({
  args: { itemId: v.id("lessonItems"), sessionId: v.id("lessonSessions") },
  handler: async (ctx, { itemId, sessionId }) => {
    const item = await mustOwnItem(ctx, itemId);
    if (item.kind === "routine") throw new Error("Routines aren't in a lesson.");
    await checkSession(ctx, item.lessonId, sessionId);
    await ctx.db.patch(itemId, { sessionId, updatedAt: Date.now() });
  },
});

/** For booking: a booked lesson gets its own lesson, hidden from the student until it starts. */
export async function sessionForBooking(ctx: MutationCtx, b: Doc<"lessonBookings">) {
  const av = await ctx.db
    .query("lessonAvailability")
    .withIndex("by_teacher", (q) => q.eq("teacherId", b.teacherId))
    .first();
  const tz = av?.timeZone ?? b.studentTz ?? "UTC";
  const existing = await ctx.db
    .query("lessonSessions")
    .withIndex("by_booking", (q) => q.eq("bookingId", b._id))
    .first();
  const now = Date.now();
  if (existing) {
    await ctx.db.patch(existing._id, { start: b.start, end: b.end, hiddenUntil: b.start, cancelled: undefined, updatedAt: now });
    return existing._id;
  }
  return ctx.db.insert("lessonSessions", {
    lessonId: b.lessonId,
    teacherId: b.teacherId,
    title: `Lesson — ${new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" }).format(b.start)}`,
    start: b.start,
    end: b.end,
    bookingId: b._id,
    hiddenUntil: b.start,
    createdAt: now,
    updatedAt: now,
  });
}

/** For booking: a cancelled booking's lesson goes if it's empty, else it's marked cancelled. */
export async function sessionCancelled(ctx: MutationCtx, bookingId: Id<"lessonBookings">) {
  const s = await ctx.db
    .query("lessonSessions")
    .withIndex("by_booking", (q) => q.eq("bookingId", bookingId))
    .first();
  if (!s) return;
  const has = await ctx.db
    .query("lessonItems")
    .withIndex("by_session", (q) => q.eq("sessionId", s._id))
    .first();
  if (has) await ctx.db.patch(s._id, { cancelled: true, updatedAt: Date.now() });
  else await ctx.db.delete(s._id);
}

/** One-off: booked lessons from before lessons had pages get their lesson (run with `npx convex run`). */
export const backfillBookingSessions = internalMutation({
  args: {},
  handler: async (ctx) => {
    let made = 0;
    for (const b of await ctx.db.query("lessonBookings").collect()) {
      if (b.status !== "confirmed") continue;
      const has = await ctx.db
        .query("lessonSessions")
        .withIndex("by_booking", (q) => q.eq("bookingId", b._id))
        .first();
      if (has) continue;
      await sessionForBooking(ctx, b);
      made++;
    }
    return made;
  },
});

/** Every upcoming lesson across your students (teaching) and teachers (learning), soonest first.
    A student's lesson that's still hidden comes back `locked` — its time only. */
export const upcomingLessons = query({
  args: {},
  handler: async (ctx) => {
    const userId = await me(ctx);
    if (!userId) return [];
    const now = Date.now();
    const out: {
      id: Id<"lessonSessions">;
      lessonId: Id<"lessonStudents">;
      role: "teacher" | "student";
      with: string;
      avatarUrl: string | null;
      title: string;
      start: number;
      end: number | null;
      booked: boolean;
      hidden: boolean;
      locked: boolean;
    }[] = [];
    const add = async (row: Doc<"lessonStudents">, role: "teacher" | "student") => {
      const other = role === "teacher" ? (row.studentId ? await personOf(ctx, row.studentId) : null) : await personOf(ctx, row.teacherId);
      for (const s of await ctx.db
        .query("lessonSessions")
        .withIndex("by_lesson", (q) => q.eq("lessonId", row._id))
        .collect()) {
        if (s.cancelled || (s.end ?? s.start + 3_600_000) < now) continue;
        const hidden = !!s.hiddenUntil && s.hiddenUntil > now;
        const locked = role === "student" && hidden;
        out.push({
          id: s._id,
          lessonId: row._id,
          role,
          with: role === "teacher" ? row.name : (other?.name ?? "Your teacher"),
          avatarUrl: other?.avatarUrl ?? null,
          title: locked ? "Lesson" : s.title,
          start: s.start,
          end: s.end ?? null,
          booked: !!s.bookingId,
          hidden,
          locked,
        });
      }
    };
    for (const row of await ctx.db
      .query("lessonStudents")
      .withIndex("by_teacher", (q) => q.eq("teacherId", userId))
      .collect())
      await add(row, "teacher");
    for (const row of await ctx.db
      .query("lessonStudents")
      .withIndex("by_student", (q) => q.eq("studentId", userId))
      .collect())
      await add(row, "student");
    out.sort((a, b) => a.start - b.start);
    return out.slice(0, 30);
  },
});

/** Everything given across all of a pair's lessons (not routines) — the "All materials" page —
    with each lesson's title and date. Students only get lessons they can see. */
export const materials = query({
  args: { lessonId: v.id("lessonStudents") },
  handler: async (ctx, { lessonId }) => {
    const who = await pairRole(ctx, lessonId);
    if (!who) return null;
    const now = Date.now();
    const features = await featuresOf(ctx, who.row.teacherId);
    const sessionRows = await ctx.db
      .query("lessonSessions")
      .withIndex("by_lesson", (q) => q.eq("lessonId", lessonId))
      .collect();
    const visible = sessionRows.filter((s) => who.role === "teacher" || !s.hiddenUntil || s.hiddenUntil <= now);
    const items = (await itemsOf(ctx, lessonId, features, { student: who.role === "student" })).filter((i) => i.kind !== "routine");
    return {
      role: who.role,
      features,
      studentName: who.row.name,
      other: who.role === "teacher" ? (who.row.studentId ? await personOf(ctx, who.row.studentId) : null) : await personOf(ctx, who.row.teacherId),
      sessions: visible
        .map((s) => ({ id: s._id, title: s.title, start: s.start, hidden: !!s.hiddenUntil && s.hiddenUntil > now, cancelled: !!s.cancelled }))
        .sort((a, b) => b.start - a.start),
      items,
    };
  },
});
