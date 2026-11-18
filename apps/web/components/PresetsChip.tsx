"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { PanelSection } from "@/components/bassgenius/PlayPanel";
import ConfirmDialog from "@/components/ConfirmDialog";
import ContextMenu, { type MenuState } from "@/components/ContextMenu";
import PromptDialog from "@/components/PromptDialog";
import { SettingChip } from "@/components/SettingsBar";
import { BookmarkIcon, CheckIcon, DotsVerticalIcon, PencilIcon, PlusIcon, RepeatIcon, TrashIcon } from "@/components/tools";
import { usePresets, type Preset, type ToolPresets } from "@/lib/toolPresets";

// A tool's presets UI (the data side is `lib/toolPresets.ts`). A tool gets it one of three ways:
// `ToolLayout`'s `presets` prop (`PresetsButton` in the tool's top bar), `PresetsChip` inside a
// tool's own `SettingsBar` (the Recorder's metronome), or `PresetsSection` in a properties panel
// (Rhythm Section, Syncopation).

type PresetsState = ReturnType<typeof usePresets>;

/** What the chip (or a closed panel section) shows: the preset the options match right now,
    "Custom" when they match none, "None" when there are no presets yet. */
function currentLabel({ active, presets }: PresetsState) {
  return active ? active.name : presets.length > 0 ? "Custom" : "None";
}

/** The "Presets" setting chip; its popover is the presets list. */
export function PresetsChip({ tool }: { tool: ToolPresets }) {
  const state = usePresets(tool);
  const [open, setOpen] = useState(false);
  return (
    <SettingChip icon={BookmarkIcon} label="Presets" value={<span className="block max-w-[10rem] truncate">{currentLabel(state)}</span>} open={open} onOpenChange={setOpen}>
      <PresetsList state={state} onApplied={() => closeSheetOnPhone(setOpen)} />
    </SettingChip>
  );
}

/** The tool's presets as a small button in its top bar (`ToolLayout`), always in view and out of
    the way of the option chips: the bookmark, "Presets" and the one in use. */
export function PresetsButton({ tool }: { tool: ToolPresets }) {
  const state = usePresets(tool);
  const [open, setOpen] = useState(false);
  return (
    <SettingChip
      icon={BookmarkIcon}
      label="Presets"
      open={open}
      onOpenChange={setOpen}
      trigger={{
        // min-w-0 (no shrink-0): on a phone's crowded top row the name truncates rather than
        // pushing the row off screen (`ToolLayout`'s PhoneBar lets it shrink).
        className: "flex h-8 min-w-0 max-w-[14rem] items-center gap-1.5 rounded-full bg-foreground/[0.05] px-3 text-sm transition-colors hover:bg-surface-hover",
        content: (
          <>
            <BookmarkIcon className="h-4 w-4 shrink-0 text-accent" />
            {/* Phones: just the preset in use, or "Presets" while none is (no "Custom"/"None"). */}
            <span className={state.active ? "hidden text-muted sm:inline" : "truncate text-muted"}>Presets</span>
            <span className={`truncate font-medium ${state.active ? "" : "hidden sm:inline"}`}>{currentLabel(state)}</span>
          </>
        ),
      }}
    >
      <PresetsList state={state} onApplied={() => closeSheetOnPhone(setOpen)} />
    </SettingChip>
  );
}

/** On a phone the presets are a bottom sheet over the tool: applying one closes it, so you see
    what changed. (On a wider screen the popover stays, to try one preset after another.) */
function closeSheetOnPhone(setOpen: (open: boolean) => void) {
  if (window.innerWidth < 640) setOpen(false);
}

/** A "Presets" section for a properties panel (`PanelSection`, the Bass Genius look). Closed
    until first opened, so it sits as one line (the current preset) above the tool's options. */
export function PresetsSection({ id, tool }: { id: string; tool: ToolPresets }) {
  const state = usePresets(tool);
  return (
    <PanelSection id={id} title="Presets" icon={BookmarkIcon} summary={currentLabel(state)} defaultOpen={false}>
      <PresetsList state={state} />
    </PanelSection>
  );
}

type Dialog =
  | { kind: "save" }
  | { kind: "replace"; name: string; preset: Preset }
  | { kind: "rename"; preset: Preset }
  | { kind: "delete"; preset: Preset };

/**
 * A tool's saved presets: tap one to apply it, ⋮ (or right-click) to update it with the current
 * options, rename or delete it, and a button to save the current options as a new one.
 */
function PresetsList({ state, onApplied }: { state: PresetsState; /** After a preset is applied. */ onApplied?: () => void }) {
  const { presets, active } = state;
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const close = () => setDialog(null);

  const openMenu = (preset: Preset, x: number, y: number) =>
    setMenu({
      x,
      y,
      width: 240,
      items: [
        ...(state.matches(preset)
          ? []
          : [{ label: "Update with current options", icon: <RepeatIcon className="h-4 w-4" />, onSelect: () => state.overwrite(preset.id) }]),
        { label: "Rename", icon: <PencilIcon className="h-4 w-4" />, onSelect: () => setDialog({ kind: "rename", preset }) },
        { label: "Delete", icon: <TrashIcon className="h-4 w-4" />, danger: true, onSelect: () => setDialog({ kind: "delete", preset }) },
      ],
    });

  return (
    <div className="flex flex-col gap-3">
      {presets.length === 0 ? (
        <p className="text-sm text-muted">No presets yet. Set the options the way you like them, then save them here to come back to later.</p>
      ) : (
        <ul className="flex flex-col gap-1" aria-label="Presets">
          {presets.map((p) => {
            const on = active?.id === p.id;
            return (
              <li
                key={p.id}
                className={`flex items-center rounded-md transition-colors ${on ? "bg-surface-hover" : "hover:bg-surface-hover/60"}`}
                onContextMenu={(e) => {
                  // (React bubbles events from the portaled menu up to here; ignore those.)
                  if (!e.currentTarget.contains(e.target as Node)) return;
                  e.preventDefault();
                  openMenu(p, e.clientX, e.clientY);
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    state.apply(p);
                    onApplied?.();
                  }}
                  aria-pressed={on}
                  title={on ? "Your options match this preset" : `Use “${p.name}”`}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-2 pl-2.5 pr-2 text-left text-sm font-medium"
                >
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  {on && <CheckIcon className="h-4 w-4 shrink-0 text-accent" />}
                </button>
                <button
                  type="button"
                  aria-label={`More for ${p.name}`}
                  title="Update, rename or delete"
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    openMenu(p, r.right - 240, r.bottom + 4);
                  }}
                  className="mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground"
                >
                  <DotsVerticalIcon className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button
        type="button"
        onClick={() => setDialog({ kind: "save" })}
        className="flex h-9 items-center gap-1.5 self-start rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground hover:bg-accent-hover"
      >
        <PlusIcon className="h-4 w-4" />
        Save current options
      </button>

      {menu && createPortal(<ContextMenu menu={menu} onClose={() => setMenu(null)} />, document.body)}
      {dialog &&
        createPortal(
          <div data-popover-child>
            {dialog.kind === "save" && (
              <PromptDialog
                title="Save as a preset"
                initialValue=""
                placeholder="Name, e.g. Slow swing"
                onCancel={close}
                onSubmit={(name) => {
                  const existing = state.findByName(name);
                  if (existing) setDialog({ kind: "replace", name, preset: existing });
                  else {
                    state.saveAs(name);
                    close();
                  }
                }}
              />
            )}
            {dialog.kind === "replace" && (
              <ConfirmDialog
                title={`Replace “${dialog.preset.name}”?`}
                message="You already have a preset with this name. It will be updated to the options you have now."
                confirmLabel="Replace"
                onCancel={close}
                onConfirm={() => {
                  state.saveAs(dialog.name);
                  close();
                }}
              />
            )}
            {dialog.kind === "rename" && (
              <PromptDialog
                title="Rename preset"
                initialValue={dialog.preset.name}
                confirmLabel="Rename"
                onCancel={close}
                onSubmit={(name) => {
                  state.rename(dialog.preset.id, name);
                  close();
                }}
              />
            )}
            {dialog.kind === "delete" && (
              <ConfirmDialog
                title={`Delete “${dialog.preset.name}”?`}
                message="The preset is removed. Your current options stay as they are."
                confirmLabel="Delete"
                onCancel={close}
                onConfirm={() => {
                  state.remove(dialog.preset.id);
                  close();
                }}
              />
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
