import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { accountPlan } from "../billing";

/**
 * What an account stores, where, and the limit on its cloud storage.
 *
 * Files, recordings and tune songs live either in Convex file storage (`storageId`: "online", on
 * every device) or only on the device that saved them (`device`: the file's data is in that
 * browser's or desktop app's own storage; only its name and details are here, so lists, tunes and
 * the Shed Log still show it everywhere). Free accounts save new ones on the device; a storage plan
 * (`billing.ts`) saves them online. Lesson files, hand-ins and profile images are always online
 * (other people see them), and a file shared by link is put online first.
 *
 * Only what's online counts towards the limit: `FREE_CLOUD_BYTES` on the free plan (for sharing,
 * Lessons and the profile), or the plan's size. Every upload path checks it (`assertHasRoom` before
 * handing out an upload URL, `assertFits` once the file's real size is known).
 */

/** Largest single file. */
export const MAX_FILE_BYTES = 100 * 1024 * 1024;

const MB = 1024 * 1024;

/** Cloud storage on the free plan: room for what other people see (shared links, Lessons, the
    profile). Everything else a free account saves stays on the device. */
export const FREE_CLOUD_BYTES = 50 * MB;

/** The account's gifted plan that's running now (Admin → Users → Storage), if any. */
export async function activeGift(ctx: QueryCtx, userId: Id<"users">) {
  const gifts = await ctx.db.query("planGifts").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
  const now = Date.now();
  const live = gifts.filter((g) => !g.ended && g.endsAt > now).sort((a, b) => b.storageGb - a.storageGb);
  const g = live[0];
  return g ? { id: g._id, storageGb: g.storageGb, endsAt: g.endsAt } : null;
}

/** One account's plan — paid (Polar) and/or gifted — and its cloud storage: the biggest of the
    free allowance, the paid plan and the gift. `hasPlan`: either kind (new files can go online).
    A broken subscription record never blocks uploads that would fit the free allowance. */
export async function planFor(ctx: QueryCtx, userId: Id<"users">) {
  const gift = await activeGift(ctx, userId);
  const giftBytes = gift ? gift.storageGb * 1024 * MB : 0;
  try {
    const { plan, cloudBytes } = await accountPlan(ctx, userId, FREE_CLOUD_BYTES);
    return { plan, gift, hasPlan: !!plan || !!gift, cloudBytes: Math.max(cloudBytes, giftBytes) };
  } catch (e) {
    console.error("Couldn't read the storage plan", e);
    return { plan: null, gift, hasPlan: !!gift, cloudBytes: Math.max(FREE_CLOUD_BYTES, giftBytes) };
  }
}

/** One account's cloud storage limit, in bytes. */
export async function quotaFor(ctx: QueryCtx, userId: Id<"users">): Promise<number> {
  return (await planFor(ctx, userId)).cloudBytes;
}

/** Files, recordings and songs only go online with a storage plan. The exceptions are things
    other people see — a file shared by link, a picture in a note (`files.moveOnline`'s `purpose`,
    `files.create`'s `keepOnline`), lesson files, hand-ins and the profile — which use the free
    online space. Checked when handing out an upload URL (so nothing gets uploaded), and again
    when saving. NB: a mutation that throws rolls back everything it did, including deleting the
    upload, so a refused save that already uploaded leaves the file in storage — the upload-URL
    check is what keeps that from happening in practice. */
export async function assertPlanForOnline(ctx: MutationCtx, userId: Id<"users">, storageId?: Id<"_storage">) {
  if ((await planFor(ctx, userId)).hasPlan) return;
  if (storageId) await ctx.storage.delete(storageId);
  throw new Error("Keeping files online needs a storage plan. Without one they're kept on this device — every feature still works.");
}

/** "50 MB", "5 GB". */
export function sizeLabel(bytes: number) {
  return bytes >= 1024 * MB ? `${Math.round((bytes / (1024 * MB)) * 10) / 10} GB` : `${Math.round(bytes / MB)} MB`;
}

/** Where a file, recording or song keeps its data on a device (see the schema's `onDevice`). */
export type DeviceRef = { key: string; label: string };

async function fileSize(ctx: QueryCtx, storageId: Id<"_storage">) {
  const meta = await ctx.db.system.get(storageId);
  return meta?.size ?? 0;
}


export type StoredKind = "file" | "recording" | "song" | "lesson" | "handin" | "profile";

export type StoredItem = {
  kind: StoredKind;
  /** Null when it's online; otherwise the device that has it (and `url` is null). */
  device: DeviceRef | null;
  /** In a Shed Note or lesson notes: stays online (never moved to a device). */
  keepOnline?: boolean;
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: number;
  url: string | null;
  tuneId: string | null;
  /** Where it's managed, for kinds other than plain files. */
  href: string | null;
};

/** Every file the account stores, newest first. `withUrls: false` skips the download links (for
    totting up the size). */
export async function storedItems(ctx: QueryCtx, userId: Id<"users">, withUrls: boolean): Promise<StoredItem[]> {
  const url = (id: Id<"_storage">) => (withUrls ? ctx.storage.getUrl(id) : Promise.resolve(null));
  const out: StoredItem[] = [];

  const files = await ctx.db.query("files").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
  for (const f of files) {
    out.push({ kind: "file", device: f.device ?? null, keepOnline: f.keepOnline, id: f._id, name: f.name, mimeType: f.mimeType, size: f.size, createdAt: f.createdAt, url: f.storageId ? await url(f.storageId) : null, tuneId: f.tuneId ?? null, href: null });
  }

  const recordings = await ctx.db.query("recordings").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
  for (const r of recordings) {
    out.push({
      kind: "recording",
      device: r.device ?? null,
      keepOnline: r.keepOnline,
      id: r._id,
      name: r.name,
      mimeType: r.mimeType,
      size: r.storageId ? await fileSize(ctx, r.storageId) : (r.size ?? 0),
      createdAt: r.createdAt,
      url: r.storageId ? await url(r.storageId) : null,
      tuneId: r.tuneId ?? null,
      href: `/tunes/recording?id=${r._id}`,
    });
  }

  const songs = await ctx.db.query("tuneSongs").withIndex("by_user_tune", (q) => q.eq("userId", userId)).collect();
  for (const s of songs) {
    out.push({
      kind: "song",
      device: s.device ?? null,
      keepOnline: s.keepOnline,
      id: s._id,
      name: s.name,
      mimeType: s.mimeType,
      size: s.storageId ? await fileSize(ctx, s.storageId) : (s.size ?? 0),
      createdAt: s.createdAt,
      url: s.storageId ? await url(s.storageId) : null,
      tuneId: s.tuneId,
      href: null,
    });
  }

  // Files you gave your students in Lessons.
  const pairs = await ctx.db.query("lessonStudents").withIndex("by_teacher", (q) => q.eq("teacherId", userId)).collect();
  for (const pair of pairs) {
    const items = await ctx.db.query("lessonItems").withIndex("by_lesson", (q) => q.eq("lessonId", pair._id)).collect();
    for (const item of items) {
      if (!item.fileId) continue;
      out.push({
        kind: "lesson",
        device: null,
        id: item._id,
        name: item.fileName || item.title,
        mimeType: item.fileType ?? "",
        size: await fileSize(ctx, item.fileId),
        createdAt: item.createdAt,
        url: await url(item.fileId),
        tuneId: null,
        href: `/lessons/lesson?pair=${pair._id}&id=${item.sessionId ?? "earlier"}`,
      });
    }
  }

  // Work you handed in to your teachers.
  const asStudent = await ctx.db.query("lessonStudents").withIndex("by_student", (q) => q.eq("studentId", userId)).collect();
  for (const pair of asStudent) {
    const subs = await ctx.db.query("lessonSubmissions").withIndex("by_lesson", (q) => q.eq("lessonId", pair._id)).collect();
    for (const sub of subs) {
      if (sub.studentId !== userId) continue;
      const item = await ctx.db.get(sub.itemId);
      for (const f of sub.files) {
        out.push({
          kind: "handin",
          device: null,
          id: `${sub._id}:${f.fileId}`,
          name: f.name,
          mimeType: f.type,
          size: f.size,
          createdAt: sub.submittedAt,
          url: await url(f.fileId),
          tuneId: null,
          href: `/lessons/lesson?pair=${pair._id}&id=${item?.sessionId ?? "earlier"}`,
        });
      }
    }
  }

  const profile = await ctx.db.query("profiles").withIndex("by_user", (q) => q.eq("userId", userId)).unique();
  for (const [storageId, name] of [
    [profile?.avatarStorageId, "Profile picture"],
    [profile?.bannerStorageId, "Profile banner"],
  ] as const) {
    if (!storageId) continue;
    const meta = await ctx.db.system.get(storageId);
    out.push({
      kind: "profile",
      device: null,
      id: storageId,
      name,
      mimeType: meta?.contentType ?? "image/jpeg",
      size: meta?.size ?? 0,
      createdAt: meta?._creationTime ?? 0,
      url: await url(storageId),
      tuneId: null,
      href: "/account?tab=profile",
    });
  }

  return out.sort((a, b) => b.createdAt - a.createdAt);
}

/** One of `userId`'s stored items by its kind and id, as `storedItems` lists it, or null when it's
    gone or isn't theirs (ids come from the client or from `fileMeta`, so ownership is checked
    here). Keep this in step with `storedItems` when a kind is added. */
export async function storedItemById(ctx: QueryCtx, userId: Id<"users">, kind: StoredKind, id: string, withUrl = true): Promise<StoredItem | null> {
  const url = async (sid: Id<"_storage">) => (withUrl ? await ctx.storage.getUrl(sid) : null);
  if (kind === "file") {
    const rowId = ctx.db.normalizeId("files", id);
    const f = rowId && (await ctx.db.get(rowId));
    if (!f || f.userId !== userId) return null;
    return { kind, device: f.device ?? null, keepOnline: f.keepOnline, id: f._id, name: f.name, mimeType: f.mimeType, size: f.size, createdAt: f.createdAt, url: f.storageId ? await url(f.storageId) : null, tuneId: f.tuneId ?? null, href: null };
  }
  if (kind === "recording") {
    const rowId = ctx.db.normalizeId("recordings", id);
    const r = rowId && (await ctx.db.get(rowId));
    if (!r || r.userId !== userId) return null;
    return {
      kind,
      device: r.device ?? null,
      keepOnline: r.keepOnline,
      id: r._id,
      name: r.name,
      mimeType: r.mimeType,
      size: r.storageId ? await fileSize(ctx, r.storageId) : (r.size ?? 0),
      createdAt: r.createdAt,
      url: r.storageId ? await url(r.storageId) : null,
      tuneId: r.tuneId ?? null,
      href: `/tunes/recording?id=${r._id}`,
    };
  }
  if (kind === "song") {
    const rowId = ctx.db.normalizeId("tuneSongs", id);
    const s = rowId && (await ctx.db.get(rowId));
    if (!s || s.userId !== userId) return null;
    return {
      kind,
      device: s.device ?? null,
      keepOnline: s.keepOnline,
      id: s._id,
      name: s.name,
      mimeType: s.mimeType,
      size: s.storageId ? await fileSize(ctx, s.storageId) : (s.size ?? 0),
      createdAt: s.createdAt,
      url: s.storageId ? await url(s.storageId) : null,
      tuneId: s.tuneId,
      href: null,
    };
  }
  if (kind === "lesson") {
    const rowId = ctx.db.normalizeId("lessonItems", id);
    const item = rowId && (await ctx.db.get(rowId));
    if (!item || item.teacherId !== userId || !item.fileId) return null;
    return {
      kind,
      device: null,
      id: item._id,
      name: item.fileName || item.title,
      mimeType: item.fileType ?? "",
      size: await fileSize(ctx, item.fileId),
      createdAt: item.createdAt,
      url: await url(item.fileId),
      tuneId: null,
      href: `/lessons/lesson?pair=${item.lessonId}&id=${item.sessionId ?? "earlier"}`,
    };
  }
  if (kind === "handin") {
    const [subPart, filePart] = id.split(":");
    const subId = ctx.db.normalizeId("lessonSubmissions", subPart ?? "");
    const sub = subId && (await ctx.db.get(subId));
    if (!sub || sub.studentId !== userId) return null;
    const f = sub.files.find((file) => file.fileId === filePart);
    if (!f) return null;
    const item = await ctx.db.get(sub.itemId);
    return {
      kind,
      device: null,
      id: `${sub._id}:${f.fileId}`,
      name: f.name,
      mimeType: f.type,
      size: f.size,
      createdAt: sub.submittedAt,
      url: await url(f.fileId),
      tuneId: null,
      href: `/lessons/lesson?pair=${sub.lessonId}&id=${item?.sessionId ?? "earlier"}`,
    };
  }
  const profile = await ctx.db.query("profiles").withIndex("by_user", (q) => q.eq("userId", userId)).unique();
  const name = profile?.avatarStorageId === id ? "Profile picture" : profile?.bannerStorageId === id ? "Profile banner" : null;
  if (!profile || !name) return null;
  const meta = await ctx.db.system.get(id as Id<"_storage">);
  return {
    kind: "profile",
    device: null,
    id,
    name,
    mimeType: meta?.contentType ?? "image/jpeg",
    size: meta?.size ?? 0,
    createdAt: meta?._creationTime ?? 0,
    url: await url(id as Id<"_storage">),
    tuneId: null,
    href: "/account?tab=profile",
  };
}

/** Bytes the account keeps online (what counts towards its limit). */
export async function bytesUsed(ctx: QueryCtx, userId: Id<"users">) {
  return (await storedItems(ctx, userId, false)).reduce((sum, item) => sum + (item.device ? 0 : item.size), 0);
}

/** Refuses (with a message people can act on) when the account's cloud storage is already full. */
export async function assertHasRoom(ctx: QueryCtx, userId: Id<"users">) {
  const quota = await quotaFor(ctx, userId);
  if ((await bytesUsed(ctx, userId)) >= quota) {
    throw new Error(`Your online storage is full (${sizeLabel(quota)}). Delete something on the Files page, or move files to this device, to make room.`);
  }
}

/** Once an upload has arrived: deletes it and throws if it's too big or doesn't fit. `replacing`
    is how much is about to be freed (a tune's old song). Returns the stored file's size and type. */
export async function assertFits(ctx: MutationCtx, userId: Id<"users">, storageId: Id<"_storage">, replacing = 0) {
  const meta = await ctx.db.system.get(storageId);
  if (!meta) throw new Error("That upload didn't arrive — try again.");
  if (meta.size > MAX_FILE_BYTES) {
    await ctx.storage.delete(storageId);
    throw new Error(`Files can be up to ${MAX_FILE_BYTES / MB} MB.`);
  }
  // The new file is in storage but not in any table yet, so it isn't counted in bytesUsed.
  const quota = await quotaFor(ctx, userId);
  if ((await bytesUsed(ctx, userId)) - replacing + meta.size > quota) {
    await ctx.storage.delete(storageId);
    throw new Error(`There isn't room for that online — your account has ${sizeLabel(quota)} of online storage. Delete something on the Files page, or move files to this device, to make room.`);
  }
  return { size: meta.size, contentType: meta.contentType ?? null };
}
