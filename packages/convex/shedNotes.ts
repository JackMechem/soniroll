import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  MAX_BODY,
  cleanFolder,
  cleanTitle,
  findTags,
  linkKeys,
  noteSnippet,
  parseTargetKey,
  renameLinks,
  titleKey,
  uniqueTitle,
} from "@jam-practice/core/shedNotes";

/**
 * Shed Notes — markdown notes private to their owner, linked to each other with `[[Title]]` and
 * attachable to a day, a routine on a day, or a tune (`shedNoteLinks`). Titles are unique per
 * account (compared case-insensitively), so a `[[link]]` always means one note; renaming a note
 * rewrites the links to it in the owner's other notes.
 */

async function me(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Sign in to use Shed Notes.");
  return userId;
}

async function ownNote(ctx: QueryCtx | MutationCtx, userId: Id<"users">, noteId: Id<"shedNotes">) {
  const note = await ctx.db.get(noteId);
  if (!note || note.userId !== userId) throw new Error("That note isn't there any more.");
  return note;
}

/** The most notes sharing one note can bring along (its linked notes, theirs, and so on). */
export const MAX_SHARED_LINKED = 300;

/**
 * Every note of the owner's that `root` leads to by following [[links]] — the notes it links to,
 * the notes those link to, and so on (not `root` itself), nearest first; only the first level when
 * the note shares just that (`shareDepth: "one"`). With `stopAt` (a title key), stops as soon as
 * that note is found.
 */
export async function reachableNotes(ctx: QueryCtx, root: Doc<"shedNotes">, stopAt?: string): Promise<Doc<"shedNotes">[]> {
  const out: Doc<"shedNotes">[] = [];
  const seen = new Set([root.titleKey]);
  const queue = [...root.links];
  // The first level is `root.links`; anything queued after it is deeper.
  let firstLevel = root.links.length;
  const oneLevel = root.shareDepth === "one";
  while (queue.length && out.length < MAX_SHARED_LINKED) {
    if (oneLevel && firstLevel-- <= 0) break;
    const key = queue.shift()!;
    if (seen.has(key)) continue;
    seen.add(key);
    const hit = await ctx.db
      .query("shedNotes")
      .withIndex("by_user_title", (q) => q.eq("userId", root.userId).eq("titleKey", key))
      .first();
    if (!hit) continue;
    out.push(hit);
    if (key === stopAt) break;
    queue.push(...hit.links);
  }
  return out;
}

/** Whether `note` comes along with `parent`'s sharing (`shareLinked`, and reachable through links). */
export async function sharedAlong(ctx: QueryCtx, parent: Doc<"shedNotes">, note: Doc<"shedNotes">) {
  if (!parent.shareLinked || parent.userId !== note.userId || parent._id === note._id) return false;
  return (await reachableNotes(ctx, parent, note.titleKey)).some((n) => n._id === note._id);
}

/** What `userId` may do with a note: "owner", "write", "read" or null. Shared with them directly,
    or reached through the links of a note of the same owner that's shared with them and shares its
    linked notes (`shareLinked`) — then they get that note's role. */
export async function noteAccess(ctx: QueryCtx | MutationCtx, note: Doc<"shedNotes">, userId: Id<"users"> | null): Promise<"owner" | "write" | "read" | null> {
  if (!userId) return null;
  if (note.userId === userId) return "owner";
  const shares = await ctx.db
    .query("shedNoteShares")
    .withIndex("by_note", (q) => q.eq("noteId", note._id))
    .collect();
  const direct = shares.find((s) => s.userId === userId)?.role;
  if (direct === "write") return direct;
  let role: "write" | "read" | null = direct ?? null;
  const mine = await ctx.db
    .query("shedNoteShares")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  for (const s of mine) {
    if (s.ownerId !== note.userId || s.noteId === note._id || (role === "read" && s.role === "read")) continue;
    const parent = await ctx.db.get(s.noteId);
    if (parent && (await sharedAlong(ctx, parent, note))) role = s.role === "write" ? "write" : (role ?? "read");
    if (role === "write") break;
  }
  return role;
}

/** A note reached through another note's link (`/note/<token>?n=Title`): the owner's note with
    that title, if the linking note shares its linked notes and leads to it. */
export async function linkedThrough(ctx: QueryCtx, parent: Doc<"shedNotes">, title: string): Promise<Doc<"shedNotes"> | null> {
  const key = titleKey(title);
  if (!parent.shareLinked) return null;
  return (await reachableNotes(ctx, parent, key)).find((n) => n.titleKey === key) ?? null;
}

async function allNotes(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
  return ctx.db
    .query("shedNotes")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
}

async function titleTaken(ctx: QueryCtx | MutationCtx, userId: Id<"users">, key: string, except?: Id<"shedNotes">) {
  const hit = await ctx.db
    .query("shedNotes")
    .withIndex("by_user_title", (q) => q.eq("userId", userId).eq("titleKey", key))
    .first();
  return !!hit && hit._id !== except;
}

const meta = (n: Doc<"shedNotes">) => ({
  id: n._id as string,
  title: n.title,
  folder: n.folder,
  links: n.links,
  tags: n.tags,
  snippet: noteSnippet(n.body),
  createdAt: n.createdAt,
  updatedAt: n.updatedAt,
});

/** Every note's title, folder, links and a snippet (not the bodies) — the note list, the
    `[[` suggestions, backlinks and forward links all come from this. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return (await allNotes(ctx, userId)).map(meta);
  },
});

/** One note with its body and what it's attached to. Null when it's gone (or you can't see it).
    Shared with you: `role` is "read" or "write", and the owner's own bits (folder, attachments)
    are left out. */
export const get = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const noteId = ctx.db.normalizeId("shedNotes", id);
    if (!noteId) return null;
    const note = await ctx.db.get(noteId);
    if (!note) return null;
    const role = await noteAccess(ctx, note, userId);
    if (!role) return null;
    if (role !== "owner") {
      const owner = await ctx.db
        .query("profiles")
        .withIndex("by_user", (q) => q.eq("userId", note.userId))
        .first();
      return {
        ...meta(note),
        folder: "",
        view: note.view ?? {},
        body: note.body,
        attached: [] as { target: string; label: string }[],
        templateId: null as string | null,
        role,
        owner: owner?.username ?? null,
        ownerId: note.userId as string,
      };
    }
    const attached = await ctx.db
      .query("shedNoteLinks")
      .withIndex("by_note", (q) => q.eq("noteId", noteId))
      .collect();
    return {
      ...meta(note),
      view: note.view ?? {},
      body: note.body,
      attached: attached.map((a) => ({ target: a.target, label: a.label })),
      templateId: (note.templateId ?? null) as string | null,
      role: "owner" as const,
      owner: null as string | null,
      ownerId: note.userId as string,
    };
  },
});

/** Full-text search over the bodies (titles are matched on the client from `list`). */
export const search = query({
  args: { q: v.string() },
  handler: async (ctx, { q }) => {
    const userId = await getAuthUserId(ctx);
    const text = q.trim();
    if (!userId || !text) return [];
    const hits = await ctx.db
      .query("shedNotes")
      .withSearchIndex("search_body", (s) => s.search("body", text).eq("userId", userId))
      .take(30);
    // The bit of text around the first word searched for (what the search menu shows).
    const words = text.toLowerCase().split(/\s+/).filter(Boolean);
    return hits.map((n) => {
      const lower = n.body.toLowerCase();
      const at = Math.min(...words.map((w) => lower.indexOf(w)).filter((i) => i >= 0), Infinity);
      const excerpt = Number.isFinite(at) ? noteSnippet(n.body.slice(Math.max(0, at - 50), at + 110), 150) : noteSnippet(n.body, 150);
      return { id: n._id as string, title: n.title, folder: n.folder, snippet: excerpt };
    });
  },
});

/** The notes attached to targets starting with `prefix` (a whole `targetKey`, or `day:<date>` for
    a day and its routines), with each one's title and snippet. */
export const attachedTo = query({
  args: { prefix: v.string() },
  handler: async (ctx, { prefix }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId || !prefix) return [];
    const rows = await ctx.db
      .query("shedNoteLinks")
      .withIndex("by_user_target", (q) => q.eq("userId", userId).gte("target", prefix).lt("target", `${prefix}￿`))
      .take(200);
    const out = [];
    for (const r of rows) {
      const note = await ctx.db.get(r.noteId);
      if (!note) continue;
      out.push({ target: r.target, noteId: r.noteId as string, title: note.title, snippet: noteSnippet(note.body, 120), updatedAt: note.updatedAt });
    }
    return out;
  },
});

const attachArg = v.optional(v.object({ target: v.string(), label: v.string() }));

async function attach(ctx: MutationCtx, userId: Id<"users">, noteId: Id<"shedNotes">, target: string, label: string) {
  if (!parseTargetKey(target)) throw new Error("Can't attach a note there.");
  const existing = await ctx.db
    .query("shedNoteLinks")
    .withIndex("by_user_target", (q) => q.eq("userId", userId).eq("target", target))
    .collect();
  if (existing.some((e) => e.noteId === noteId)) return;
  if (existing.length >= 50) throw new Error("That has as many notes attached as it can take.");
  await ctx.db.insert("shedNoteLinks", { userId, noteId, target, label: label.slice(0, 200), createdAt: Date.now() });
}

/** A new note. The title is made unique ("Untitled - 1"); returns its id and the title it got. */
export const create = mutation({
  args: { title: v.optional(v.string()), folder: v.optional(v.string()), body: v.optional(v.string()), attach: attachArg, templateId: v.optional(v.id("shedNoteTemplates")) },
  handler: async (ctx, args) => {
    const userId = await me(ctx);
    const taken = new Set((await allNotes(ctx, userId)).map((n) => n.titleKey));
    if (taken.size >= 5000) throw new Error("You've reached the most notes an account can hold.");
    const title = uniqueTitle(args.title ?? "Untitled", taken);
    const body = (args.body ?? "").slice(0, MAX_BODY);
    const now = Date.now();
    const id = await ctx.db.insert("shedNotes", {
      userId,
      title,
      titleKey: titleKey(title),
      folder: cleanFolder(args.folder ?? ""),
      body,
      links: linkKeys(body),
      tags: findTags(body),
      ...(args.templateId ? { templateId: args.templateId } : {}),
      createdAt: now,
      updatedAt: now,
    });
    if (args.attach) await attach(ctx, userId, id, args.attach.target, args.attach.label);
    return { id: id as string, title };
  },
});

/** Adds a line at the end of a note (a task note's link in its routine's notes, a recording just
    made for a task). Only for a note that isn't open in an editor: the open one adds it there. */
export const appendLine = mutation({
  args: { id: v.id("shedNotes"), line: v.string() },
  handler: async (ctx, { id, line }) => {
    const userId = await me(ctx);
    const note = await ctx.db.get(id);
    if (!note) throw new Error("That note isn't there any more.");
    const role = await noteAccess(ctx, note, userId);
    if (role !== "owner" && role !== "write") throw new Error("You can only read this note.");
    const clean = line.replace(/[\r\n]+/g, " ").trim().slice(0, 1000);
    if (!clean) return;
    const body = note.body.replace(/\s*$/, "") + (note.body.trim() ? "\n" : "") + clean + "\n";
    if (body.length > MAX_BODY) throw new Error(`A note can hold up to ${MAX_BODY.toLocaleString()} characters.`);
    await ctx.db.patch(id, { body, links: linkKeys(body), tags: findTags(body), updatedAt: Date.now() });
  },
});

/** Saves a note's text (the editor autosaves) — its owner, or someone it's shared with to edit. */
export const save = mutation({
  args: { id: v.id("shedNotes"), body: v.string() },
  handler: async (ctx, { id, body }) => {
    const userId = await me(ctx);
    const note = await ctx.db.get(id);
    if (!note) throw new Error("That note isn't there any more.");
    const role = await noteAccess(ctx, note, userId);
    if (role !== "owner" && role !== "write") throw new Error("You can only read this note.");
    if (body.length > MAX_BODY) throw new Error(`A note can hold up to ${MAX_BODY.toLocaleString()} characters.`);
    if (body === note.body) return;
    await ctx.db.patch(id, { body, links: linkKeys(body), tags: findTags(body), updatedAt: Date.now() });
  },
});

/** Renames a note and rewrites `[[Old title]]` links in your other notes. Returns the new title.
    If another note already has it, throws — or, with `unique` (a template giving the note its
    title), numbers it like a new note ("Title - 1"). */
export const rename = mutation({
  args: { id: v.id("shedNotes"), title: v.string(), unique: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const userId = await me(ctx);
    const note = await ownNote(ctx, userId, args.id);
    let title = cleanTitle(args.title);
    if (!title) throw new Error("Give the note a title.");
    if (title === note.title) return title;
    if (args.unique) {
      const taken = new Set((await allNotes(ctx, userId)).filter((n) => n._id !== note._id).map((n) => n.titleKey));
      title = uniqueTitle(title, taken);
      if (title === note.title) return title;
    }
    const key = titleKey(title);
    if (await titleTaken(ctx, userId, key, note._id)) throw new Error(`There's already a note called "${title}".`);
    const now = Date.now();
    if (key !== note.titleKey) {
      for (const other of await allNotes(ctx, userId)) {
        if (!other.links.includes(note.titleKey)) continue;
        const body = renameLinks(other.body, note.title, title);
        const self = other._id === note._id;
        if (body !== other.body) await ctx.db.patch(other._id, { body, links: linkKeys(body), ...(self ? {} : { updatedAt: now }) });
      }
      // Templates' links too, so notes made from them link to the right note.
      const templates = await ctx.db
        .query("shedNoteTemplates")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      for (const t of templates) {
        const body = renameLinks(t.body, note.title, title);
        if (body !== t.body) await ctx.db.patch(t._id, { body });
      }
    }
    await ctx.db.patch(note._id, { title, titleKey: key, updatedAt: now });
    return title;
  },
});

/** How a note is shown: full width or not (null = follow the general setting), and its font
    (null = the site's font). Doesn't change when it was last edited. */
export const setView = mutation({
  args: { id: v.id("shedNotes"), fullWidth: v.optional(v.union(v.boolean(), v.null())), font: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, a) => {
    const userId = await me(ctx);
    const note = await ownNote(ctx, userId, a.id);
    const view = { ...(note.view ?? {}) };
    if (a.fullWidth !== undefined) {
      if (a.fullWidth === null) delete view.fullWidth;
      else view.fullWidth = a.fullWidth;
    }
    if (a.font !== undefined) {
      if (a.font === null) delete view.font;
      else view.font = a.font.slice(0, 40);
    }
    await ctx.db.patch(a.id, { view });
  },
});

/** Moves a note into a folder ("" = the top level). */
export const move = mutation({
  args: { id: v.id("shedNotes"), folder: v.string() },
  handler: async (ctx, args) => {
    const userId = await me(ctx);
    await ownNote(ctx, userId, args.id);
    await ctx.db.patch(args.id, { folder: cleanFolder(args.folder) });
  },
});

async function folderRows(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
  return ctx.db
    .query("shedNoteFolders")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
}

const inside = (path: string, folder: string) => folder === path || folder.startsWith(`${path}/`);

/** Every folder made on its own (paths like "Practice/Scales"); notes' folders come with `list`. */
export const folders = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return (await folderRows(ctx, userId)).map((f) => f.path);
  },
});

/** Makes a folder (it can stay empty). "A/B" makes B inside A. */
export const createFolder = mutation({
  args: { path: v.string() },
  handler: async (ctx, args) => {
    const userId = await me(ctx);
    const path = cleanFolder(args.path);
    if (!path) throw new Error("Give the folder a name.");
    const rows = await folderRows(ctx, userId);
    if (rows.length >= 2000) throw new Error("That's as many folders as an account can hold.");
    if (rows.some((r) => r.path === path)) return path;
    await ctx.db.insert("shedNoteFolders", { userId, path, createdAt: Date.now() });
    return path;
  },
});

/** Renames or moves a folder — everything in it (subfolders and notes) goes along: "A/B" → "C/B"
    moves B into C. A folder can't go inside itself. */
export const renameFolder = mutation({
  args: { from: v.string(), to: v.string() },
  handler: async (ctx, args) => {
    const userId = await me(ctx);
    const from = cleanFolder(args.from);
    const to = cleanFolder(args.to);
    if (!from || !to || from === to) return;
    if (inside(from, to)) throw new Error("A folder can't go inside itself.");
    for (const n of await allNotes(ctx, userId)) {
      if (inside(from, n.folder)) await ctx.db.patch(n._id, { folder: to + n.folder.slice(from.length) });
    }
    const rows = await folderRows(ctx, userId);
    const taken = new Set(rows.filter((r) => !inside(from, r.path)).map((r) => r.path));
    for (const r of rows) {
      if (!inside(from, r.path)) continue;
      const next = to + r.path.slice(from.length);
      if (taken.has(next)) await ctx.db.delete(r._id);
      else {
        await ctx.db.patch(r._id, { path: next });
        taken.add(next);
      }
    }
    if (!taken.has(to)) await ctx.db.insert("shedNoteFolders", { userId, path: to, createdAt: Date.now() });
  },
});

/** Deletes a folder. What's inside (notes and subfolders) moves up into its parent — nothing is lost. */
export const deleteFolder = mutation({
  args: { path: v.string() },
  handler: async (ctx, args) => {
    const userId = await me(ctx);
    const path = cleanFolder(args.path);
    if (!path) return;
    const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    const up = (p: string) => (p === path ? parent : cleanFolder(`${parent}/${p.slice(path.length + 1)}`));
    for (const n of await allNotes(ctx, userId)) {
      if (inside(path, n.folder)) await ctx.db.patch(n._id, { folder: up(n.folder) });
    }
    const rows = await folderRows(ctx, userId);
    const taken = new Set(rows.filter((r) => !inside(path, r.path)).map((r) => r.path));
    for (const r of rows) {
      if (!inside(path, r.path)) continue;
      const next = r.path === path ? null : up(r.path);
      if (!next || taken.has(next)) await ctx.db.delete(r._id);
      else {
        await ctx.db.patch(r._id, { path: next });
        taken.add(next);
      }
    }
  },
});

/** Deletes a note and its attachments to days and tunes. Links to it in other notes stay (as
    links to a note that doesn't exist, which can make it again — the way Obsidian does it). */
export const remove = mutation({
  args: { id: v.id("shedNotes") },
  handler: async (ctx, { id }) => {
    const userId = await me(ctx);
    await ownNote(ctx, userId, id);
    const links = await ctx.db
      .query("shedNoteLinks")
      .withIndex("by_note", (q) => q.eq("noteId", id))
      .collect();
    for (const l of links) await ctx.db.delete(l._id);
    const shares = await ctx.db
      .query("shedNoteShares")
      .withIndex("by_note", (q) => q.eq("noteId", id))
      .collect();
    for (const s of shares) await ctx.db.delete(s._id);
    await ctx.db.delete(id);
  },
});

/** Attaches an existing note to a day, a routine on a day, or a tune. */
export const attachNote = mutation({
  args: { noteId: v.id("shedNotes"), target: v.string(), label: v.string() },
  handler: async (ctx, args) => {
    const userId = await me(ctx);
    await ownNote(ctx, userId, args.noteId);
    await attach(ctx, userId, args.noteId, args.target, args.label);
  },
});

/** Takes a note off a day, routine or tune (the note itself stays). */
export const detachNote = mutation({
  args: { noteId: v.id("shedNotes"), target: v.string() },
  handler: async (ctx, args) => {
    const userId = await me(ctx);
    const rows = await ctx.db
      .query("shedNoteLinks")
      .withIndex("by_user_target", (q) => q.eq("userId", userId).eq("target", args.target))
      .collect();
    for (const r of rows) if (r.noteId === args.noteId) await ctx.db.delete(r._id);
  },
});

/** Import (a chunk of) notes — from an export's .zip, or a folder of Markdown files. A note whose
    title you already have is skipped, replaces yours, or comes in as a copy ("Title - 1"). Folders
    are made too (they can be empty). */
export const importNotes = mutation({
  args: {
    notes: v.array(
      v.object({
        title: v.string(),
        folder: v.string(),
        body: v.string(),
        view: v.optional(v.object({ fullWidth: v.optional(v.boolean()), font: v.optional(v.string()) })),
        createdAt: v.optional(v.number()),
        updatedAt: v.optional(v.number()),
      }),
    ),
    folders: v.array(v.string()),
    clash: v.union(v.literal("skip"), v.literal("replace"), v.literal("copy")),
  },
  handler: async (ctx, args) => {
    const userId = await me(ctx);
    if (args.notes.length > 100 || args.folders.length > 2000) throw new Error("Too many notes at once.");
    const now = Date.now();
    const result = { created: 0, replaced: 0, skipped: 0 };

    const rows = await folderRows(ctx, userId);
    const have = new Set(rows.map((r) => r.path));
    for (const f of args.folders) {
      const path = cleanFolder(f);
      if (!path || have.has(path) || have.size >= 2000) continue;
      have.add(path);
      await ctx.db.insert("shedNoteFolders", { userId, path, createdAt: now });
    }

    for (const n of args.notes) {
      const title = cleanTitle(n.title) || "Untitled";
      const body = n.body.slice(0, MAX_BODY);
      const folder = cleanFolder(n.folder);
      const view = n.view && (n.view.fullWidth !== undefined || n.view.font) ? { ...(n.view.fullWidth !== undefined ? { fullWidth: n.view.fullWidth } : {}), ...(n.view.font ? { font: n.view.font.slice(0, 40) } : {}) } : undefined;
      const existing = await ctx.db
        .query("shedNotes")
        .withIndex("by_user_title", (q) => q.eq("userId", userId).eq("titleKey", titleKey(title)))
        .first();
      if (existing && args.clash === "skip") {
        result.skipped++;
        continue;
      }
      if (existing && args.clash === "replace") {
        await ctx.db.patch(existing._id, { body, folder, links: linkKeys(body), tags: findTags(body), updatedAt: now, ...(view ? { view } : {}) });
        result.replaced++;
        continue;
      }
      let final = title;
      for (let i = 1; existing && (await titleTaken(ctx, userId, titleKey(final))); i++) final = `${title} - ${i}`;
      await ctx.db.insert("shedNotes", {
        userId,
        title: final,
        titleKey: titleKey(final),
        folder,
        body,
        links: linkKeys(body),
        tags: findTags(body),
        ...(view ? { view } : {}),
        createdAt: n.createdAt ?? now,
        updatedAt: n.updatedAt ?? now,
      });
      result.created++;
    }
    return result;
  },
});

/** Records which template a note now follows (Apply / Change template). */
export const setTemplate = mutation({
  args: { id: v.id("shedNotes"), templateId: v.union(v.id("shedNoteTemplates"), v.null()) },
  handler: async (ctx, { id, templateId }) => {
    const userId = await me(ctx);
    await ownNote(ctx, userId, id);
    await ctx.db.patch(id, { templateId: templateId ?? undefined });
  },
});
