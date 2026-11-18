import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { resolvePublicTunes, type PublicRecording, type PublicTune } from "@jam-practice/core/profileTunes";
import { resolveLinkedChart } from "./chordCharts";

/** The synced-settings keys a setlist is built from — the same keys the apps write. */
const SETLISTS_KEY = "jam-practice-setlists";
const TUNES_KEY = "tunes";
const TUNES_TO_LEARN_KEY = "jam-practice-tunes-to-learn";

type OwnerData = {
  setlists: {
    id: string;
    name: string;
    description: string;
    tuneIds: string[];
    overrides?: Record<string, { key?: string; tempo?: number }>;
  }[];
  tunesById: Map<string, PublicTune>;
};

/** Per-request cache, so a list of several posts by the same person reads their data once. */
export type SetlistCache = Map<Id<"users">, Promise<OwnerData>>;

async function readValue(ctx: QueryCtx, userId: Id<"users">, key: string) {
  const row = await ctx.db
    .query("syncedSettings")
    .withIndex("by_user_key", (q) => q.eq("userId", userId).eq("key", key))
    .unique();
  return row?.value ?? null;
}

async function loadOwner(ctx: QueryCtx, userId: Id<"users">): Promise<OwnerData> {
  const [setlistsJson, tunesJson, learnJson] = await Promise.all([
    readValue(ctx, userId, SETLISTS_KEY),
    readValue(ctx, userId, TUNES_KEY),
    readValue(ctx, userId, TUNES_TO_LEARN_KEY),
  ]);
  let setlists: OwnerData["setlists"] = [];
  try {
    const parsed = setlistsJson ? JSON.parse(setlistsJson) : null;
    if (parsed && Array.isArray(parsed.setlists)) setlists = parsed.setlists;
  } catch {
    // unreadable — treated as no setlists
  }
  const tunesById = new Map<string, PublicTune>();
  for (const t of [...resolvePublicTunes(tunesJson), ...resolvePublicTunes(learnJson)]) tunesById.set(t.id, t);
  return { setlists, tunesById };
}

/**
 * The owner's setlist as it is *right now* — read from their own synced setlists and tune lists,
 * so a shared link or a setlist post always shows the current version without re-sharing. Tunes
 * come back as `PublicTune`s (never `notes`), in setlist order, each with its linked chord chart
 * resolved: `"full"` includes the chart's bars (for viewing), `"titles"` only what a list row
 * needs. `null` if the owner no longer has that setlist (callers fall back to their snapshot).
 */
export async function liveSetlist(
  ctx: QueryCtx,
  ownerId: Id<"users">,
  setlistId: string,
  charts: "full" | "titles",
  cache?: SetlistCache,
): Promise<{ title: string; description: string; tunes: PublicTune[] } | null> {
  let data = cache?.get(ownerId);
  if (!data) {
    data = loadOwner(ctx, ownerId);
    cache?.set(ownerId, data);
  }
  const { setlists, tunesById } = await data;
  const setlist = setlists.find((s) => s && s.id === setlistId);
  if (!setlist || !Array.isArray(setlist.tuneIds)) return null;
  const tunes = await Promise.all(
    setlist.tuneIds
      .map((id) => {
        const t = tunesById.get(id);
        if (!t) return null;
        const o = setlist.overrides?.[id];
        return {
          ...t,
          ...(typeof o?.key === "string" ? { setKey: o.key } : {}),
          ...(typeof o?.tempo === "number" ? { setTempo: o.tempo } : {}),
        };
      })
      .filter((t): t is PublicTune => !!t)
      .map(async ({ chordChartId, ...tune }) => {
        if (!chordChartId) return tune;
        if (charts === "full") {
          const linkedChart = await resolveLinkedChart(ctx, ownerId, chordChartId);
          return linkedChart ? { ...tune, linkedChart } : tune;
        }
        let song;
        try {
          song = await ctx.db.get(chordChartId as Id<"chordChartSongs">);
        } catch {
          return tune;
        }
        if (!song || song.userId !== ownerId) return tune;
        return {
          ...tune,
          linkedChart: { title: song.title, composer: song.composer, style: song.style, key: song.key, timeSignature: song.timeSignature, bars: [] },
        };
      }),
  );
  if (charts !== "full") return { title: setlist.name, description: setlist.description ?? "", tunes };
  // Viewing a shared setlist: whoever it's shared with can also play the owner's recordings of
  // each tune (name + audio — never a recording's notes).
  const withRecordings = await Promise.all(
    tunes.map(async (tune) => {
      const rows = await ctx.db
        .query("recordings")
        .withIndex("by_user_tune", (q) => q.eq("userId", ownerId).eq("tuneId", tune.id))
        .order("desc")
        .collect();
      if (rows.length === 0) return tune;
      // Only takes that are online: one kept on the owner's device can't be shared.
      const recordings: PublicRecording[] = await Promise.all(
        rows
          .filter((r) => r.storageId)
          .map(async (r) => ({
            id: r._id,
            name: r.name,
            durationSec: r.durationSec,
            createdAt: r.createdAt,
            url: await ctx.storage.getUrl(r.storageId!),
          })),
      );
      return { ...tune, recordings };
    }),
  );
  return { title: setlist.name, description: setlist.description ?? "", tunes: withRecordings };
}
