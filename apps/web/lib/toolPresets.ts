import { useCallback, useMemo } from "react";
import { useSyncedSettings } from "./useSyncedSettings";

/**
 * Presets for any tool: a named copy of the tool's options, saved and picked again later.
 *
 * A tool opts in by handing `toolPresets(...)` to `ToolLayout`'s `presets` prop (or to
 * `PresetsChip` / `PresetsList` where it doesn't use `ToolLayout`'s chips):
 *
 *   presets={toolPresets("metronome", settings, updateSettings)}
 *   presets={toolPresets("note-trainer", settings, updateSettings, ["sensitivity"])}
 *
 * A preset holds only option fields of the tool's one settings object: every field of `settings`
 * except `ALWAYS_OMITTED` (history, stats, this device's mic) and the tool's own `omit` list.
 * Applying one patches only those fields through the tool's own `update`, which merges into the
 * whole stored object — so history, stats and anything else stored beside the options are never
 * touched (the ear trainers keep their history in the same object; see the `useSyncedSettings`
 * trap in PROJECT.md).
 *
 * Storage: one synced-settings key per tool, `jam-practice-presets-<id>`, holding
 * `{ presets: [...] }` — in the account when signed in, this browser when signed out, like every
 * other setting (`useSyncedSettings`; the server's `syncedSettings` table takes any key, so no
 * backend change).
 */

export type Preset = {
  id: string;
  name: string;
  /** The option fields, as they were when it was saved (or last updated). */
  values: Record<string, unknown>;
  updatedAt: number;
};

/** What a tool hands the presets UI. Built by `toolPresets`, which type-checks the field names. */
export type ToolPresets = {
  /** Names the storage key: `jam-practice-presets-<id>`. Never change it once shipped. */
  id: string;
  settings: object;
  update: (patch: Record<string, unknown>) => void;
  omit: readonly string[];
};

/** Fields that are never options, whatever the tool says: practice history, per-item stats and
    this device's microphone. A safety net for tools that forget to `omit` them. */
function alwaysOmitted(field: string) {
  return field === "history" || field === "inputDeviceId" || /Stats$/.test(field);
}

/**
 * Presets for a tool's settings object (from `useSyncedSettings` / `usePersistedSettings`).
 * `omit` names fields that aren't options (view state, per-device setup, content like a picked
 * chart); history, `…Stats` and `inputDeviceId` are always left out.
 */
export function toolPresets<T extends object>(
  id: string,
  settings: T,
  update: (patch: Partial<T>) => void,
  omit: readonly (keyof T & string)[] = [],
): ToolPresets {
  return { id, settings, update: update as (patch: Record<string, unknown>) => void, omit };
}

const KEY_PREFIX = "jam-practice-presets-";
const DEFAULTS = { presets: [] as Preset[] };

/** The option fields of `tool.settings` (the ones a preset saves and applies). */
function optionFields(tool: ToolPresets): string[] {
  return Object.keys(tool.settings).filter((f) => !alwaysOmitted(f) && !tool.omit.includes(f));
}

/** A JSON-safe deep copy of the current options. */
export function captureOptions(tool: ToolPresets): Record<string, unknown> {
  const all = tool.settings as Record<string, unknown>;
  const values: Record<string, unknown> = {};
  for (const f of optionFields(tool)) if (all[f] !== undefined) values[f] = all[f];
  return JSON.parse(JSON.stringify(values)) as Record<string, unknown>;
}

function sameKind(a: unknown, b: unknown) {
  if (a === null || b === null) return true;
  return Array.isArray(a) ? Array.isArray(b) : !Array.isArray(b) && typeof a === typeof b;
}

/** The patch that applies `preset`: only option fields the tool still has, of the right kind.
    Fields the preset doesn't have (options added since it was saved) are left as they are. */
export function presetPatch(tool: ToolPresets, preset: Preset): Record<string, unknown> {
  const all = tool.settings as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const f of optionFields(tool)) {
    if (!(f in preset.values)) continue;
    const value = preset.values[f];
    if (value !== undefined && sameKind(all[f], value)) patch[f] = value;
  }
  return patch;
}

/** True when the tool's options are what `preset` would set. */
export function presetMatches(tool: ToolPresets, preset: Preset): boolean {
  const all = tool.settings as Record<string, unknown>;
  let compared = 0;
  for (const f of optionFields(tool)) {
    if (!(f in preset.values)) continue;
    compared++;
    if (!deepEqual(all[f], preset.values[f])) return false;
  }
  return compared > 0;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((x, i) => deepEqual(x, bb[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao).filter((k) => ao[k] !== undefined);
  const bk = Object.keys(bo).filter((k) => bo[k] !== undefined);
  return ak.length === bk.length && ak.every((k) => deepEqual(ao[k], bo[k]));
}

/** Drops anything malformed (a hand-edited or foreign stored value can't break the list). */
function clean(list: unknown[]): Preset[] {
  return list.filter(
    (p): p is Preset =>
      !!p &&
      typeof p === "object" &&
      typeof (p as Preset).id === "string" &&
      typeof (p as Preset).name === "string" &&
      !!(p as Preset).values &&
      typeof (p as Preset).values === "object" &&
      !Array.isArray((p as Preset).values),
  );
}

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** The saved presets for a tool, which one matches its options now, and the actions. */
export function usePresets(tool: ToolPresets) {
  const [{ presets: stored }, setStored] = useSyncedSettings(KEY_PREFIX + tool.id, DEFAULTS);
  const presets = useMemo(() => clean(stored), [stored]);
  const active = presets.find((p) => presetMatches(tool, p)) ?? null;

  const save = useCallback(
    (list: Preset[]) => setStored({ presets: list }),
    [setStored],
  );

  return {
    presets,
    active,
    /** True when the options are what this preset would set (several can match). */
    matches: (preset: Preset) => presetMatches(tool, preset),
    apply: (preset: Preset) => {
      const patch = presetPatch(tool, preset);
      if (Object.keys(patch).length > 0) tool.update(patch);
    },
    /** Saves the current options under `name`, replacing a preset with the same name. */
    saveAs: (name: string) => {
      const existing = findByName(presets, name);
      const values = captureOptions(tool);
      if (existing) {
        save(presets.map((p) => (p.id === existing.id ? { ...p, name, values, updatedAt: Date.now() } : p)));
      } else {
        save([...presets, { id: newId(), name, values, updatedAt: Date.now() }]);
      }
    },
    /** Overwrites a preset with the current options. */
    overwrite: (id: string) =>
      save(presets.map((p) => (p.id === id ? { ...p, values: captureOptions(tool), updatedAt: Date.now() } : p))),
    rename: (id: string, name: string) => save(presets.map((p) => (p.id === id ? { ...p, name } : p))),
    remove: (id: string) => save(presets.filter((p) => p.id !== id)),
    findByName: (name: string) => findByName(presets, name),
  };
}

function findByName(presets: Preset[], name: string) {
  const n = name.trim().toLowerCase();
  return presets.find((p) => p.name.trim().toLowerCase() === n) ?? null;
}
