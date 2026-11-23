import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalAction, internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { communityHidden, assertUploadsOpen } from "./lib/site";
import { resolveLinkedChart } from "./lib/chordCharts";
import { ownerTune } from "./lib/tunes";
import { sharedInLesson, sharedInNote } from "./scores";
import { FREE_CLOUD_BYTES, MAX_FILE_BYTES, assertFits, assertHasRoom, assertPlanForOnline, bytesUsed, planFor, quotaFor, storedItems, type DeviceRef, type StoredKind } from "./lib/storage";
import type { PublicRecording, PublicTune } from "@jam-practice/core/profileTunes";
import { allFolderPaths } from "@jam-practice/core/fileFolders";
import { dropMeta, madeFolders, metaMap, writeMeta } from "./lib/fileFolders";

/**
 * Files: anything a person uploads to keep with their account (PDFs, images, audio, video,
 * notation, documents), on its own or attached to one of their tunes. Online (a storage plan, or
 * shared): the usual two steps, `generateUploadUrl`, POST the file there, then `create` with the
 * returned `storageId`. On the device (free accounts): the web app keeps the data and calls
 * `createOnDevice` with its key. `moveOnline` / `moveToDevice` move any file, recording or song
 * between the two (see `lib/storage.ts`).
 *
 * Also here: `storage` (everything the account stores — files, recordings, tune songs, lesson
 * files, hand-ins, profile pictures — for the Files page), renaming, deleting and sharing any of
 * those by kind (`renameItem`, `removeItem`, `shareItem` → `/file/<id>`), and sharing a tune by link
 * (`/tune/<id>`), which shows the tune with its chord chart, files and recordings.
 */

const MAX_NAME = 200;

/** Everything the caller's account stores, plus how much space it takes. `sharedId` is the item's
    link id when it's shared by link (`/file/<id>`). */
export const storage = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const shares = await ctx.db.query("sharedFiles").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
    const shareOf = new Map(shares.map((row) => [`${row.kind}:${row.itemId}`, row._id as string]));
    const meta = await metaMap(ctx, userId);
    const items = (await storedItems(ctx, userId, true)).map((item) => {
      const m = meta.get(`${item.kind}:${item.id}`);
      return { ...item, sharedId: shareOf.get(`${item.kind}:${item.id}`) ?? null, folder: m?.folder ?? "", tags: m?.tags ?? [] };
    });
    const { plan, gift, hasPlan, cloudBytes } = await planFor(ctx, userId);
    return {
      items,
      /** Every folder (A–Z): made with New folder, or with something in it, and their parents. */
      folders: allFolderPaths(
        (await madeFolders(ctx, userId)).map((f) => f.path),
        items.map((i) => i.folder),
      ),
      /** Bytes online (what counts towards `quota`) and on devices. */
      used: items.reduce((sum, item) => sum + (item.device ? 0 : item.size), 0),
      onDevices: items.reduce((sum, item) => sum + (item.device ? item.size : 0), 0),
      quota: cloudBytes,
      freeQuota: FREE_CLOUD_BYTES,
      plan,
      gift,
      hasPlan,
      maxFile: MAX_FILE_BYTES,
    };
  },
});

/** The caller's plan and online storage: where their new files go (online with a plan, on the
    device without one) and how much room is left online. Null when signed out. */
export const storagePlan = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const { plan, gift, hasPlan, cloudBytes } = await planFor(ctx, userId);
    const items = await storedItems(ctx, userId, false);
    // On the free plan, the files, recordings and songs still online from before files moved to
    // devices (shared ones stay online): the move notice asks people to back these up or move them.
    const shared = new Set(
      (await ctx.db.query("sharedFiles").withIndex("by_user", (q) => q.eq("userId", userId)).collect()).map((r) => `${r.kind}:${r.itemId}`),
    );
    const toMove = hasPlan
      ? []
      : items.filter((i) => !i.device && !i.keepOnline && (i.kind === "file" || i.kind === "recording" || i.kind === "song") && !shared.has(`${i.kind}:${i.id}`));
    return {
      userId,
      /** The paid plan (Polar), the gifted one, and whether there's either. */
      plan,
      gift,
      hasPlan,
      quota: cloudBytes,
      used: items.reduce((sum, item) => sum + (item.device ? 0 : item.size), 0),
      freeQuota: FREE_CLOUD_BYTES,
      maxFile: MAX_FILE_BYTES,
      toMove: { count: toMove.length, bytes: toMove.reduce((sum, i) => sum + i.size, 0) },
    };
  },
});

// ---------------------------------------------------------------- any stored item, by kind

export const kindArg = v.union(
  v.literal("file"),
  v.literal("recording"),
  v.literal("song"),
  v.literal("lesson"),
  v.literal("handin"),
  v.literal("profile"),
);

/** `storageId` is missing when the item is only on a device (`device`). */
type OwnedItem = { storageId?: Id<"_storage">; device?: DeviceRef; name: string; mimeType: string; size: number; createdAt: number };

/** One of `userId`'s stored files, by its kind and id (as `storage` lists them), or null if it
    doesn't exist or isn't theirs. Ids come from the client, so every kind re-checks ownership. */
export async function ownedItem(ctx: QueryCtx, userId: Id<"users">, kind: StoredKind, id: string): Promise<OwnedItem | null> {
  const sizeOf = async (storageId: Id<"_storage">) => (await ctx.db.system.get(storageId))?.size ?? 0;
  if (kind === "file") {
    const fileId = ctx.db.normalizeId("files", id);
    const row = fileId && (await ctx.db.get(fileId));
    return row && row.userId === userId ? { storageId: row.storageId, device: row.device, name: row.name, mimeType: row.mimeType, size: row.size, createdAt: row.createdAt } : null;
  }
  if (kind === "recording") {
    const recId = ctx.db.normalizeId("recordings", id);
    const row = recId && (await ctx.db.get(recId));
    return row && row.userId === userId ? { storageId: row.storageId, device: row.device, name: row.name, mimeType: row.mimeType, size: row.storageId ? await sizeOf(row.storageId) : (row.size ?? 0), createdAt: row.createdAt } : null;
  }
  if (kind === "song") {
    const songId = ctx.db.normalizeId("tuneSongs", id);
    const row = songId && (await ctx.db.get(songId));
    return row && row.userId === userId ? { storageId: row.storageId, device: row.device, name: row.name, mimeType: row.mimeType, size: row.storageId ? await sizeOf(row.storageId) : (row.size ?? 0), createdAt: row.createdAt } : null;
  }
  if (kind === "lesson") {
    const itemId = ctx.db.normalizeId("lessonItems", id);
    const item = itemId && (await ctx.db.get(itemId));
    if (!item || item.teacherId !== userId || !item.fileId) return null;
    const meta = await ctx.db.system.get(item.fileId);
    return { storageId: item.fileId, name: item.fileName || item.title, mimeType: item.fileType || meta?.contentType || "", size: meta?.size ?? 0, createdAt: item.createdAt };
  }
  if (kind === "handin") {
    const [subPart, filePart] = id.split(":");
    const subId = ctx.db.normalizeId("lessonSubmissions", subPart ?? "");
    const sub = subId && (await ctx.db.get(subId));
    if (!sub || sub.studentId !== userId) return null;
    const f = sub.files.find((file) => file.fileId === filePart);
    return f ? { storageId: f.fileId, name: f.name, mimeType: f.type, size: f.size, createdAt: sub.submittedAt } : null;
  }
  const profile = await ctx.db.query("profiles").withIndex("by_user", (q) => q.eq("userId", userId)).unique();
  const which = profile?.avatarStorageId === id ? "Profile picture" : profile?.bannerStorageId === id ? "Profile banner" : null;
  if (!profile || !which) return null;
  const meta = await ctx.db.system.get(id as Id<"_storage">);
  return { storageId: id as Id<"_storage">, name: which, mimeType: meta?.contentType ?? "image/jpeg", size: meta?.size ?? 0, createdAt: meta?._creationTime ?? 0 };
}

/** Who stores an item (by its kind and id), whoever is asking. Profile images aren't embeddable. */
async function itemOwner(ctx: QueryCtx, kind: StoredKind, id: string): Promise<Id<"users"> | null> {
  const rowOf = async <T extends "files" | "recordings" | "tuneSongs">(table: T) => {
    const rowId = ctx.db.normalizeId(table, id);
    return rowId ? await ctx.db.get(rowId) : null;
  };
  if (kind === "file") return (await rowOf("files"))?.userId ?? null;
  if (kind === "recording") return (await rowOf("recordings"))?.userId ?? null;
  if (kind === "song") return (await rowOf("tuneSongs"))?.userId ?? null;
  if (kind === "lesson") {
    const itemId = ctx.db.normalizeId("lessonItems", id);
    return (itemId && (await ctx.db.get(itemId))?.teacherId) || null;
  }
  if (kind === "handin") {
    const subId = ctx.db.normalizeId("lessonSubmissions", id.split(":")[0] ?? "");
    return (subId && (await ctx.db.get(subId))?.studentId) || null;
  }
  return null;
}

const EMBED_KINDS: StoredKind[] = ["file", "recording", "song", "lesson", "handin"];

/**
 * A file shown inside a Shed Note (`![name](file:<ref>)`, where the ref is an upload's id or
 * `<kind>/<id>` for anything else on the Files page). Yours; or someone else's when it's in a note
 * you can see that they can edit (shared with you, or by its link: `noteId` / `token`), or in a
 * lesson's notes (`lessonId`) — the same rule as scores in notes. Null when it's gone or hidden.
 */
export const embed = query({
  args: { ref: v.string(), lessonId: v.optional(v.string()), noteId: v.optional(v.string()), token: v.optional(v.string()) },
  handler: async (ctx, { ref, lessonId, noteId, token }) => {
    const slash = ref.indexOf("/");
    const kind = (slash < 0 ? "file" : ref.slice(0, slash)) as StoredKind;
    const id = slash < 0 ? ref : ref.slice(slash + 1);
    if (!EMBED_KINDS.includes(kind) || !id) return null;
    const ownerId = await itemOwner(ctx, kind, id);
    if (!ownerId) return null;
    const userId = await getAuthUserId(ctx);
    const mine = !!userId && userId === ownerId;
    const needle = `file:${ref}`;
    const visible =
      mine ||
      (!!userId && !!lessonId && (await sharedInLesson(ctx, userId, ownerId, needle, lessonId))) ||
      ((!!noteId || !!token) && (await sharedInNote(ctx, userId, ownerId, needle, noteId, token)));
    if (!visible) return null;
    const item = await ownedItem(ctx, ownerId, kind, id);
    if (!item) return null;
    // Kept on a device: only its owner can open it, and only on that device (the web app finds it
    // by `device.key`); anyone else sees that it isn't online.
    return {
      kind,
      id,
      name: item.name,
      mimeType: item.mimeType,
      size: item.size,
      createdAt: item.createdAt,
      url: item.storageId ? await ctx.storage.getUrl(item.storageId) : null,
      device: mine ? (item.device ?? null) : null,
      mine,
    };
  },
});

/** Removes the links to one item (it was deleted). */
async function dropShares(ctx: MutationCtx, userId: Id<"users">, kind: StoredKind, itemId: string) {
  const rows = await ctx.db
    .query("sharedFiles")
    .withIndex("by_user_item", (q) => q.eq("userId", userId).eq("kind", kind).eq("itemId", itemId))
    .collect();
  for (const row of rows) await ctx.db.delete(row._id);
}

/** Renames anything on the Files page except profile images. A lesson file's new name is what the
    student sees; a hand-in's is what the teacher sees. */
export const renameItem = mutation({
  args: { kind: kindArg, id: v.string(), name: v.string() },
  handler: async (ctx, { kind, id, name }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId || !(await ownedItem(ctx, userId, kind, id))) throw new Error("File not found.");
    const clean = name.trim().slice(0, MAX_NAME);
    if (!clean) throw new Error("Give it a name.");
    const now = Date.now();
    if (kind === "file") await ctx.db.patch(id as Id<"files">, { name: clean, updatedAt: now });
    else if (kind === "recording") await ctx.db.patch(id as Id<"recordings">, { name: clean, updatedAt: now });
    else if (kind === "song") await ctx.db.patch(id as Id<"tuneSongs">, { name: clean });
    else if (kind === "lesson") {
      const item = (await ctx.db.get(id as Id<"lessonItems">))!;
      // A file item's title is its file name unless the teacher gave it its own.
      const title = item.kind === "file" && item.title === item.fileName ? { title: clean } : {};
      await ctx.db.patch(item._id, { fileName: clean, ...title, updatedAt: now });
    } else if (kind === "handin") {
      const [subId, fileId] = id.split(":");
      const sub = (await ctx.db.get(subId as Id<"lessonSubmissions">))!;
      await ctx.db.patch(sub._id, { files: sub.files.map((f) => (f.fileId === fileId ? { ...f, name: clean } : f)), updatedAt: now });
    } else throw new Error("Profile pictures can't be renamed.");
  },
});

/** Deletes anything on the Files page for good, with its stored data and any link to it. A lesson
    file is taken out of the lesson (a file on its own goes with it); a hand-in file is taken out of
    the hand-in; a profile image is removed from the profile. */
export const removeItem = mutation({
  args: { kind: kindArg, id: v.string() },
  handler: async (ctx, { kind, id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in.");
    const owned = await ownedItem(ctx, userId, kind, id);
    if (!owned) return;
    if (owned.storageId) await ctx.storage.delete(owned.storageId);
    if (kind === "file") await ctx.db.delete(id as Id<"files">);
    else if (kind === "recording") await ctx.db.delete(id as Id<"recordings">);
    else if (kind === "song") await ctx.db.delete(id as Id<"tuneSongs">);
    else if (kind === "lesson") {
      const item = (await ctx.db.get(id as Id<"lessonItems">))!;
      if (item.kind === "file") {
        for (const sub of await ctx.db.query("lessonSubmissions").withIndex("by_item", (q) => q.eq("itemId", item._id)).collect()) {
          for (const f of sub.files) await ctx.storage.delete(f.fileId);
          await ctx.db.delete(sub._id);
        }
        await ctx.db.delete(item._id);
      } else {
        await ctx.db.patch(item._id, { fileId: undefined, fileName: undefined, fileType: undefined, updatedAt: Date.now() });
      }
    } else if (kind === "handin") {
      const [subId, fileId] = id.split(":");
      const sub = (await ctx.db.get(subId as Id<"lessonSubmissions">))!;
      await ctx.db.patch(sub._id, { files: sub.files.filter((f) => f.fileId !== fileId), updatedAt: Date.now() });
    } else {
      const profile = (await ctx.db.query("profiles").withIndex("by_user", (q) => q.eq("userId", userId)).unique())!;
      await ctx.db.patch(profile._id, profile.avatarStorageId === id ? { avatarStorageId: undefined, updatedAt: Date.now() } : { bannerStorageId: undefined, updatedAt: Date.now() });
    }
    await dropShares(ctx, userId, kind, id);
    await dropMeta(ctx, userId, kind, id);
    // A PDF's markings go with it (as `remove` does).
    if (kind === "file") {
      const markup = await ctx.db
        .query("pdfMarkups")
        .withIndex("by_file", (q) => q.eq("fileId", id as Id<"files">))
        .first();
      if (markup) await ctx.db.delete(markup._id);
    }
  },
});

// ---------------------------------------------------------------- sharing one file by link

/** The link's id for one of the caller's items, or null if it isn't shared. */
export const itemShare = query({
  args: { kind: kindArg, id: v.string() },
  handler: async (ctx, { kind, id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const row = await ctx.db
      .query("sharedFiles")
      .withIndex("by_user_item", (q) => q.eq("userId", userId).eq("kind", kind).eq("itemId", id))
      .first();
    return row?._id ?? null;
  },
});

/** Shares one of the caller's files by link (`/file/<id>`) and returns the link's id. Anyone with
    the link can open and download it. */
export const shareItem = mutation({
  args: { kind: kindArg, id: v.string() },
  handler: async (ctx, { kind, id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to share a file.");
    if (kind === "profile") throw new Error("Profile pictures show on your profile instead.");
    const owned = await ownedItem(ctx, userId, kind, id);
    if (!owned) throw new Error("File not found.");
    // The web app puts it online first (`moveOnline`); a link can't reach a device.
    if (!owned.storageId) throw new Error("That file is only on your device. Put it online to share it.");
    const existing = await ctx.db
      .query("sharedFiles")
      .withIndex("by_user_item", (q) => q.eq("userId", userId).eq("kind", kind).eq("itemId", id))
      .first();
    if (existing) return existing._id;
    return await ctx.db.insert("sharedFiles", { userId, kind, itemId: id, createdAt: Date.now() });
  },
});

/** Stops sharing a file: its link stops working. */
export const unshareItem = mutation({
  args: { kind: kindArg, id: v.string() },
  handler: async (ctx, { kind, id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in.");
    await dropShares(ctx, userId, kind, id);
  },
});

/** A file shared by link, for anyone with the link — no sign-in needed. Null if the link is wrong,
    the file was deleted or stopped being shared, or Community is switched off. */
export const getSharedFile = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    if (await communityHidden(ctx)) return null;
    const shareId = ctx.db.normalizeId("sharedFiles", id);
    const row = shareId && (await ctx.db.get(shareId));
    if (!row) return null;
    const item = await ownedItem(ctx, row.userId, row.kind as StoredKind, row.itemId);
    if (!item?.storageId) return null;
    const profile = await ctx.db.query("profiles").withIndex("by_user", (q) => q.eq("userId", row.userId)).unique();
    const viewer = await getAuthUserId(ctx);
    return {
      id: row._id,
      name: item.name,
      mimeType: item.mimeType,
      size: item.size,
      createdAt: item.createdAt,
      url: await ctx.storage.getUrl(item.storageId),
      // Only a public profile's username is shown; a private one stays anonymous.
      ownerUsername: profile?.isPublic ? profile.username : null,
      isMine: viewer === row.userId,
    };
  },
});

/** The stored file behind a link (for copying it), with the caller's space. */
export const sharedFileSource = internalQuery({
  args: { id: v.string(), userId: v.id("users") },
  handler: async (ctx, { id, userId }) => {
    const shareId = ctx.db.normalizeId("sharedFiles", id);
    const row = shareId && (await ctx.db.get(shareId));
    if (!row || (await communityHidden(ctx))) return null;
    const item = await ownedItem(ctx, row.userId, row.kind as StoredKind, row.itemId);
    if (!item?.storageId) return null;
    return { storageId: item.storageId, name: item.name, size: item.size, used: await bytesUsed(ctx, userId), quota: await quotaFor(ctx, userId) };
  },
});

/** "Save to my files": copies a shared file into the caller's account (not on any tune). */
export const copySharedFile = action({
  args: { shareId: v.string() },
  handler: async (ctx, { shareId }): Promise<{ id: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to save files.");
    if (!(await ctx.runQuery(internal.files.hasPlanFor, { userId }))) throw new Error("Keeping files online needs a storage plan. Save it to this device instead.");
    const source = await ctx.runQuery(internal.files.sharedFileSource, { id: shareId, userId });
    if (!source) throw new Error("That file isn't shared any more.");
    if (source.used + source.size > source.quota) throw new Error("There isn't room for this file in your account. Delete something first.");
    const blob = await ctx.storage.get(source.storageId);
    if (!blob) throw new Error("That file isn't available any more.");
    const storageId = await ctx.storage.store(blob);
    return { id: await ctx.runMutation(internal.files.insertCopiedFile, { userId, storageId, name: source.name }) };
  },
});

// ---------------------------------------------------------------- files

function fileView(row: Doc<"files">, url: string | null) {
  return {
    _id: row._id,
    device: row.device ?? null,
    name: row.name,
    mimeType: row.mimeType,
    size: row.size,
    tuneId: row.tuneId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    url,
  };
}

/** An upload URL for a file going online. Without a storage plan only for a `purpose` other people
    need it online for (`note`, `share`; see `moveOnline`). */
export const generateUploadUrl = mutation({
  args: { purpose: v.optional(v.union(v.literal("note"), v.literal("share"))) },
  handler: async (ctx, { purpose }) => {
    await assertUploadsOpen(ctx);
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to upload files.");
    if (!purpose) await assertPlanForOnline(ctx, userId);
    await assertHasRoom(ctx, userId);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Saves an uploaded file (after POSTing it to a `generateUploadUrl` URL). Too big, or no room
    left: the upload is deleted and it throws. */
export const create = mutation({
  /** `keepOnline`: it's for a note (see the schema). */
  /** `folder`: put it in this Files folder (e.g. uploaded while that folder is open). */
  args: { storageId: v.id("_storage"), name: v.string(), tuneId: v.optional(v.string()), keepOnline: v.optional(v.boolean()), folder: v.optional(v.string()) },
  handler: async (ctx, { storageId, name, tuneId, keepOnline, folder }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to upload files.");
    // A picture for a note goes online on any plan (everyone who can open the note sees it).
    if (!keepOnline) await assertPlanForOnline(ctx, userId, storageId);
    const meta = await assertFits(ctx, userId, storageId);
    const now = Date.now();
    const id = await ctx.db.insert("files", {
      userId,
      storageId,
      name: name.trim().slice(0, MAX_NAME) || "File",
      mimeType: meta.contentType ?? "application/octet-stream",
      size: meta.size,
      ...(tuneId ? { tuneId: tuneId.slice(0, 100) } : {}),
      ...(keepOnline ? { keepOnline: true } : {}),
      createdAt: now,
      updatedAt: now,
    });
    if (folder) await writeMeta(ctx, userId, "file", id, { folder });
    return id;
  },
});

/** Marks a file, recording or song as being in a note, so it stays online. The web app calls it
    when one is picked for a note (after putting it online if it was on the device). */
export const keepOnline = mutation({
  args: { kind: v.union(v.literal("file"), v.literal("recording"), v.literal("song")), id: v.string() },
  handler: async (ctx, { kind, id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in.");
    const row = await movableRow(ctx, userId, kind, id);
    if (row && !row.keepOnline) await ctx.db.patch(row._id, { keepOnline: true });
  },
});

/** One-off: marks every file, recording and song already shown in a Shed Note or lesson notes as
    staying online (from before files moved to devices). Run once per deployment:
    `npx convex run files:markNoteFiles` (add `--prod` for production). Pages through every note. */
export const markNoteFiles = internalAction({
  args: {},
  handler: async (ctx) => {
    let marked = 0;
    for (const table of ["shedNotes", "lessonItems"] as const) {
      let cursor: string | null = null;
      for (;;) {
        const page: { marked: number; cursor: string; done: boolean } = await ctx.runMutation(internal.files.markNoteFilesPage, { table, cursor });
        marked += page.marked;
        if (page.done) break;
        cursor = page.cursor;
      }
    }
    return { marked };
  },
});

export const markNoteFilesPage = internalMutation({
  args: { table: v.union(v.literal("shedNotes"), v.literal("lessonItems")), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { table, cursor }) => {
    const page = await ctx.db.query(table).paginate({ numItems: 100, cursor });
    let marked = 0;
    for (const doc of page.page) {
      const body = "body" in doc && typeof doc.body === "string" ? doc.body : "";
      for (const m of body.matchAll(/\(file:([^)\s|]+)/g)) {
        const ref = m[1];
        const slash = ref.indexOf("/");
        const kind = slash < 0 ? "file" : ref.slice(0, slash);
        const id = slash < 0 ? ref : ref.slice(slash + 1);
        const tableOf = kind === "file" ? "files" : kind === "recording" ? "recordings" : kind === "song" ? "tuneSongs" : null;
        const rowId = tableOf ? ctx.db.normalizeId(tableOf, id) : null;
        const row = rowId ? await ctx.db.get(rowId) : null;
        if (row && !row.keepOnline) {
          await ctx.db.patch(row._id, { keepOnline: true });
          marked += 1;
        }
      }
    }
    return { marked, cursor: page.continueCursor, done: page.isDone };
  },
});

const deviceArg = v.object({ key: v.string(), label: v.string() });

/** A device reference from the client, trimmed to sane sizes. */
export function cleanDevice(device: DeviceRef): DeviceRef {
  const key = device.key.trim().slice(0, 100);
  if (!key) throw new Error("Missing the file's key on this device.");
  return { key, label: device.label.trim().slice(0, 80) || "Another device" };
}

/** Saves a file kept on the caller's device: its data stays there (under `device.key`); this
    row is its name, size and tune, so it shows in lists on every device. */
export const createOnDevice = mutation({
  args: { name: v.string(), mimeType: v.string(), size: v.number(), tuneId: v.optional(v.string()), device: deviceArg, folder: v.optional(v.string()) },
  handler: async (ctx, { name, mimeType, size, tuneId, device, folder }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to save files.");
    if (size > MAX_FILE_BYTES) throw new Error(`Files can be up to ${MAX_FILE_BYTES / (1024 * 1024)} MB.`);
    const now = Date.now();
    const id = await ctx.db.insert("files", {
      userId,
      device: cleanDevice(device),
      name: name.trim().slice(0, MAX_NAME) || "File",
      mimeType: mimeType.slice(0, 200) || "application/octet-stream",
      size: Math.max(0, Math.round(size)),
      ...(tuneId ? { tuneId: tuneId.slice(0, 100) } : {}),
      createdAt: now,
      updatedAt: now,
    });
    if (folder) await writeMeta(ctx, userId, "file", id, { folder });
    return id;
  },
});

const movableKind = v.union(v.literal("file"), v.literal("recording"), v.literal("song"));

/** One of the caller's files, recordings or songs, by kind, with the table it's in. */
async function movableRow(ctx: QueryCtx, userId: Id<"users">, kind: "file" | "recording" | "song", id: string) {
  const table = kind === "file" ? "files" : kind === "recording" ? "recordings" : "tuneSongs";
  const rowId = ctx.db.normalizeId(table, id);
  const row = rowId ? await ctx.db.get(rowId) : null;
  return row && row.userId === userId ? row : null;
}

/** Puts a file, recording or song that was only on a device online: the web app uploads its data
    (`generateUploadUrl`) and passes the new `storageId`. Checks it fits the account's online
    storage (deleting the upload if not). With a storage plan, for anything. Without one, only for
    a `purpose` other people need it online for: `share` (the link is made here, in the same step,
    and its id returned) or `note` (it's marked to stay online). */
export const moveOnline = mutation({
  args: { kind: movableKind, id: v.string(), storageId: v.id("_storage"), purpose: v.optional(v.union(v.literal("share"), v.literal("note"))) },
  handler: async (ctx, { kind, id, storageId, purpose }): Promise<string | null> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in.");
    if (!purpose) await assertPlanForOnline(ctx, userId, storageId);
    const row = await movableRow(ctx, userId, kind, id);
    if (!row) {
      await ctx.storage.delete(storageId);
      throw new Error("File not found.");
    }
    if (row.storageId) {
      // Already online (another device moved it first).
      await ctx.storage.delete(storageId);
    } else {
      const meta = await assertFits(ctx, userId, storageId);
      await ctx.db.patch(row._id, { storageId, device: undefined, ...(kind === "file" ? { size: meta.size } : { size: undefined }) });
    }
    if (purpose === "note" && !row.keepOnline) await ctx.db.patch(row._id, { keepOnline: true });
    if (purpose !== "share") return null;
    const existing = await ctx.db
      .query("sharedFiles")
      .withIndex("by_user_item", (q) => q.eq("userId", userId).eq("kind", kind).eq("itemId", id))
      .first();
    return existing?._id ?? (await ctx.db.insert("sharedFiles", { userId, kind, itemId: id, createdAt: Date.now() }));
  },
});

/** Takes a file, recording or song offline: the web app has already saved its data on this device
    (under `device.key`), and the online copy is deleted. Any link to it stops working, since a link
    can't reach a device. */
export const moveToDevice = mutation({
  args: { kind: movableKind, id: v.string(), device: deviceArg },
  handler: async (ctx, { kind, id, device }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in.");
    const row = await movableRow(ctx, userId, kind, id);
    if (!row) throw new Error("File not found.");
    if (!row.storageId) return;
    if (row.keepOnline) throw new Error(`"${row.name}" is in a note, so it stays online for the people who can open the note.`);
    const meta = await ctx.db.system.get(row.storageId);
    await ctx.storage.delete(row.storageId);
    await ctx.db.patch(row._id, { storageId: undefined, device: cleanDevice(device), size: meta?.size ?? row.size ?? 0 });
    await dropShares(ctx, userId, kind, id);
  },
});

/** The caller's files, newest first. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db.query("files").withIndex("by_user", (q) => q.eq("userId", userId)).order("desc").collect();
    return Promise.all(rows.map(async (row) => fileView(row, row.storageId ? await ctx.storage.getUrl(row.storageId) : null)));
  },
});

/** The caller's files attached to one tune, newest first. */
export const listForTune = query({
  args: { tuneId: v.string() },
  handler: async (ctx, { tuneId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("files")
      .withIndex("by_user_tune", (q) => q.eq("userId", userId).eq("tuneId", tuneId))
      .order("desc")
      .collect();
    return Promise.all(rows.map(async (row) => fileView(row, row.storageId ? await ctx.storage.getUrl(row.storageId) : null)));
  },
});

/** Rename, or attach to a tune / detach (`tuneId: null`). */
export const update = mutation({
  args: { id: v.id("files"), name: v.optional(v.string()), tuneId: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { id, name, tuneId }) => {
    const userId = await getAuthUserId(ctx);
    const row = await ctx.db.get(id);
    if (!userId || !row || row.userId !== userId) throw new Error("File not found.");
    await ctx.db.patch(id, {
      ...(name !== undefined ? { name: name.trim().slice(0, MAX_NAME) || row.name } : {}),
      ...(tuneId !== undefined ? { tuneId: tuneId ? tuneId.slice(0, 100) : undefined } : {}),
      updatedAt: Date.now(),
    });
  },
});

/** Deletes a file and its stored data. */
export const remove = mutation({
  args: { id: v.id("files") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    const row = await ctx.db.get(id);
    if (!userId || !row || row.userId !== userId) return;
    if (row.storageId) await ctx.storage.delete(row.storageId);
    await ctx.db.delete(id);
    await dropShares(ctx, userId, "file", id);
    await dropMeta(ctx, userId, "file", id);
    const markup = await ctx.db
      .query("pdfMarkups")
      .withIndex("by_file", (q) => q.eq("fileId", id))
      .first();
    if (markup) await ctx.db.delete(markup._id);
  },
});

// ---------------------------------------------------------------- sharing a tune

/** The link's id for one of the caller's tunes, or null if it isn't shared. */
export const tuneShare = query({
  args: { tuneId: v.string() },
  handler: async (ctx, { tuneId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const row = await ctx.db
      .query("sharedTunes")
      .withIndex("by_user_tune", (q) => q.eq("userId", userId).eq("tuneId", tuneId))
      .first();
    return row?._id ?? null;
  },
});

/** Shares one of the caller's tunes by link (or refreshes the link's fallback copy) and returns
    the link's id. The tune is looked up on the server, from the caller's own tune lists. */
export const shareTune = mutation({
  args: { tuneId: v.string() },
  handler: async (ctx, { tuneId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to share a tune.");
    const tune = await ownerTune(ctx, userId, tuneId);
    if (!tune) throw new Error("That tune isn't in your lists.");
    const { chordChartId: _chart, ...snapshot } = tune;
    const existing = await ctx.db
      .query("sharedTunes")
      .withIndex("by_user_tune", (q) => q.eq("userId", userId).eq("tuneId", tuneId))
      .first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { snapshot, updatedAt: now });
      return existing._id;
    }
    return await ctx.db.insert("sharedTunes", { userId, tuneId, snapshot, createdAt: now, updatedAt: now });
  },
});

/** Stops sharing a tune: its link stops working. */
export const unshareTune = mutation({
  args: { tuneId: v.string() },
  handler: async (ctx, { tuneId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in.");
    const rows = await ctx.db
      .query("sharedTunes")
      .withIndex("by_user_tune", (q) => q.eq("userId", userId).eq("tuneId", tuneId))
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
  },
});

/** A tune shared by link, for anyone with the link — no sign-in needed. The tune as it is now,
    its chord chart, attached files and recordings (never its notes). `null` if the link is wrong
    or the tune isn't shared any more. */
export const getSharedTune = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    if (await communityHidden(ctx)) return null;
    const shareId = ctx.db.normalizeId("sharedTunes", id);
    if (!shareId) return null;
    const row = await ctx.db.get(shareId);
    if (!row) return null;
    const live = await ownerTune(ctx, row.userId, row.tuneId);
    const base = (live ?? row.snapshot) as PublicTune;
    const { chordChartId, ...tune } = base;
    const linkedChart = live ? await resolveLinkedChart(ctx, row.userId, chordChartId) : null;

    const files = live
      ? await Promise.all(
          (
            await ctx.db
              .query("files")
              .withIndex("by_user_tune", (q) => q.eq("userId", row.userId).eq("tuneId", row.tuneId))
              .order("desc")
              .collect()
          )
            .filter((f) => f.storageId)
            .map(async (f) => ({ id: f._id, name: f.name, mimeType: f.mimeType, size: f.size, createdAt: f.createdAt, url: await ctx.storage.getUrl(f.storageId!) })),
        )
      : [];
    const recordings: PublicRecording[] = live
      ? await Promise.all(
          (
            await ctx.db
              .query("recordings")
              .withIndex("by_user_tune", (q) => q.eq("userId", row.userId).eq("tuneId", row.tuneId))
              .order("desc")
              .collect()
          )
            .filter((r) => r.storageId)
            .map(async (r) => ({ id: r._id, name: r.name, durationSec: r.durationSec, createdAt: r.createdAt, url: await ctx.storage.getUrl(r.storageId!) })),
        )
      : [];

    const profile = await ctx.db.query("profiles").withIndex("by_user", (q) => q.eq("userId", row.userId)).unique();
    const viewer = await getAuthUserId(ctx);
    return {
      id: row._id,
      tune: { ...tune, ...(linkedChart ? { linkedChart } : {}) } as PublicTune,
      files,
      recordings,
      // Only a public profile's username is shown; a private one stays anonymous.
      ownerUsername: profile?.isPublic ? profile.username : null,
      isMine: viewer === row.userId,
      ownTuneId: viewer === row.userId ? row.tuneId : null,
      updatedAt: row.updatedAt,
    };
  },
});

/** The stored files attached to a shared tune (for copying them), or null if it isn't shared. */
export const sharedTuneFiles = internalQuery({
  args: { shareId: v.id("sharedTunes"), userId: v.id("users") },
  handler: async (ctx, { shareId, userId }) => {
    const row = await ctx.db.get(shareId);
    if (!row) return null;
    const files = await ctx.db
      .query("files")
      .withIndex("by_user_tune", (q) => q.eq("userId", row.userId).eq("tuneId", row.tuneId))
      .collect();
    return {
      files: files.flatMap((f) => (f.storageId ? [{ storageId: f.storageId, name: f.name, size: f.size }] : [])),
      used: await bytesUsed(ctx, userId),
      quota: await quotaFor(ctx, userId),
    };
  },
});

export const insertCopiedFile = internalMutation({
  args: { userId: v.id("users"), storageId: v.id("_storage"), name: v.string(), tuneId: v.optional(v.string()) },
  handler: async (ctx, { userId, storageId, name, tuneId }) => {
    const meta = await ctx.db.system.get(storageId);
    const now = Date.now();
    return await ctx.db.insert("files", {
      userId,
      storageId,
      name,
      mimeType: meta?.contentType ?? "application/octet-stream",
      size: meta?.size ?? 0,
      ...(tuneId ? { tuneId } : {}),
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Copies a shared tune's files into the caller's account, attached to `tuneId` (their own copy of
    the tune). Returns how many were copied; stops short (and says so) when there isn't room. */
export const copySharedFiles = action({
  args: { shareId: v.string(), tuneId: v.string() },
  handler: async (ctx, { shareId, tuneId }): Promise<{ copied: number; skipped: number }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to save files.");
    if (!(await ctx.runQuery(internal.files.hasPlanFor, { userId }))) throw new Error("Keeping files online needs a storage plan. Save them to this device instead.");
    const id = await ctx.runQuery(internal.files.normalizeShareId, { id: shareId });
    if (!id) throw new Error("That tune isn't shared any more.");
    const shared = await ctx.runQuery(internal.files.sharedTuneFiles, { shareId: id, userId });
    if (!shared) throw new Error("That tune isn't shared any more.");
    let used = shared.used;
    let copied = 0;
    let skipped = 0;
    for (const f of shared.files) {
      if (used + f.size > shared.quota) {
        skipped += 1;
        continue;
      }
      const blob = await ctx.storage.get(f.storageId);
      if (!blob) {
        skipped += 1;
        continue;
      }
      const storageId = await ctx.storage.store(blob);
      await ctx.runMutation(internal.files.insertCopiedFile, { userId, storageId, name: f.name, tuneId });
      used += f.size;
      copied += 1;
    }
    return { copied, skipped };
  },
});

export const hasPlanFor = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => (await planFor(ctx, userId)).hasPlan,
});

export const normalizeShareId = internalQuery({
  args: { id: v.string() },
  handler: async (ctx, { id }) => ctx.db.normalizeId("sharedTunes", id),
});
