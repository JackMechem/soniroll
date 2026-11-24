import type { Layer, LayerPage, Mark } from "@/components/pdf/markup";

/**
 * Three-way merging of markup layers, for when two copies of a PDF's markings were changed at once
 * (two tabs, two devices, a tab that was offline). `base` is the version both started from, `mine`
 * this copy's (with its unsaved changes), `theirs` the newer saved one. The result is `theirs` with
 * this copy's changes since `base` applied on top:
 *
 * - Marks and pages are matched by id. Something I added is added (next to where it was in mine);
 *   something I deleted is deleted; something I changed takes my changed fields, the rest of its
 *   fields from theirs (they moved a box, I recoloured it: both stay). Something they deleted that I
 *   changed comes back with my change; one they deleted that I didn't touch stays deleted.
 * - Order (pages, and marks front to back): if I reordered, my order wins (with their additions
 *   slotted in after their neighbours); otherwise theirs is kept.
 * - Bookmarks are a list by id on each page, merged the same way.
 *
 * It's idempotent: merging changes that are already in `theirs` gives `theirs` back, so a save that
 * landed twice (or a draft merged after it was saved) does no harm.
 */
export function mergeLayers(base: Layer, mine: Layer, theirs: Layer): Layer {
  if (mine === base) return theirs;
  const pages = mergeList(base.pages, mine.pages, theirs.pages, mergePage);
  return { ...theirs, pages };
}

function mergePage(b: LayerPage | undefined, m: LayerPage, t: LayerPage | undefined): LayerPage {
  if (!t) return m; // added by me, or deleted by them after I changed it
  if (!b) return m; // the same new id on both sides (can't happen; ids are random): mine
  const out = mergeFields(b, m, t, ["marks", "bookmarks"]) as LayerPage;
  out.marks = mergeList(b.marks, m.marks, t.marks, mergeMark);
  const bb = b.bookmarks ?? [];
  const mb = m.bookmarks ?? [];
  const tb = t.bookmarks ?? [];
  const merged = mergeList(bb, mb, tb, (x, y, z) => (z && x ? (mergeFields(x, y, z) as typeof y) : y));
  if (merged.length) out.bookmarks = merged;
  else delete out.bookmarks;
  return out;
}

function mergeMark(b: Mark | undefined, m: Mark, t: Mark | undefined): Mark {
  if (!t || !b) return m;
  // A mark that changed kind (it can't; but then fields wouldn't mix): mine.
  if (m.t !== t.t || m.t !== b.t) return m;
  return mergeFields(b, m, t) as Mark;
}

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** Fields: mine where I changed them from base, theirs otherwise (`skip`: merged separately). */
function mergeFields<T extends object>(b: T, m: T, t: T, skip: string[] = []): T {
  const out: Record<string, unknown> = {};
  const bo = b as Record<string, unknown>;
  const mo = m as Record<string, unknown>;
  const to = t as Record<string, unknown>;
  for (const k of new Set([...Object.keys(bo), ...Object.keys(mo), ...Object.keys(to)])) {
    if (skip.includes(k)) {
      if (k in to) out[k] = to[k];
      continue;
    }
    const v = same(mo[k], bo[k]) ? to[k] : mo[k];
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}

/** Whether the items both lists share are in the same order in each. */
function sameOrder(a: string[], b: string[]) {
  const inB = new Set(b);
  const inA = new Set(a);
  const x = a.filter((id) => inB.has(id));
  const y = b.filter((id) => inA.has(id));
  return x.length === y.length && x.every((id, i) => id === y[i]);
}

/** Merges a list of things with ids (see `mergeLayers`). `item` merges one thing found in mine. */
export function mergeList<T extends { id: string }>(base: T[], mine: T[], theirs: T[], item: (b: T | undefined, m: T, t: T | undefined) => T): T[] {
  const B = new Map(base.map((x) => [x.id, x]));
  const M = new Map(mine.map((x) => [x.id, x]));
  const T = new Map(theirs.map((x) => [x.id, x]));
  const changedByMe = (id: string) => {
    const b = B.get(id);
    const m = M.get(id);
    return !!m && (!b || !same(b, m));
  };
  const keep = (id: string) => {
    if (B.has(id) && !M.has(id)) return false; // I deleted it
    if (B.has(id) && !T.has(id)) return changedByMe(id); // they deleted it: back only if I changed it
    return M.has(id) || T.has(id);
  };
  const ids = (xs: T[]) => xs.map((x) => x.id);
  const reordered = !sameOrder(ids(base), ids(mine));
  // The list whose order wins, then the other's extra items slotted in after their neighbours.
  const [primary, secondary] = reordered ? [ids(mine), ids(theirs)] : [ids(theirs), ids(mine)];
  const order = primary.filter(keep);
  const placed = new Set(order);
  secondary.forEach((id, i) => {
    if (placed.has(id) || !keep(id)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const k = order.indexOf(secondary[j]);
      if (k >= 0) {
        at = k + 1;
        break;
      }
    }
    order.splice(at, 0, id);
    placed.add(id);
  });
  return order.map((id) => {
    const m = M.get(id);
    const t = T.get(id);
    return m ? (changedByMe(id) ? item(B.get(id), m, t) : (t ?? m)) : t!;
  });
}

/** Whether two layers are the same (as saved). */
export const sameLayer = (a: Layer | null | undefined, b: Layer | null | undefined) => a === b || (!!a && !!b && JSON.stringify(a) === JSON.stringify(b));
