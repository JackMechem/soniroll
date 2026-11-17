"use client";

import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { DEFAULT_CONFIG_TEXT, type ShedNotesConfig } from "@/lib/shedNotesConfig";
import { COMMANDS, COMMAND_BY_ID, type NoteActions, keysFor } from "./commands";
import NoteEditor from "./NoteEditor";
import SettingsForm from "./SettingsForm";
import VimGuide from "./VimGuide";
import { applyVimConfig } from "./vimSetup";

const OPTIONS: [keyof ShedNotesConfig, string][] = [
  ["vimMode", "true turns on vim keys in every note (also the Vim switch above a note)."],
  ["livePreview", "true hides markdown marks where the cursor isn't and shows notation; false is plain source."],
  ["lineNumbers", "Line numbers down the side."],
  ["readableLineLength", "Keeps lines to a comfortable width on a wide screen."],
  ["fontSize", "The text size in notes, 10 to 32."],
  ["spellcheck", "The browser's spellcheck underline."],
  ["wordCompletion", "true suggests up to four words that finish what you're typing (your own words first, then a dictionary); Enter or Tab fills one in. Off at first."],
  ["keybindings", 'A list of { "key": "Mod-b", "command": "editor:toggle-bold" }, added to the built-in keys (Reference shows them all): a key you list replaces that key\'s built-in command, and "command": "" turns a key off. Mod is Ctrl (⌘ on a Mac); also Shift-, Alt-, Ctrl-, Meta-.'],
  ["vim", 'leader: what <leader> is in mappings. mappings: vimrc lines (map, nmap, imap, vmap, noremap, nnoremap, inoremap, vnoremap, unmap). exCommands: { "name": "command id" } adds :name.'],
];

/**
 * Shed Notes' settings, two ways onto one file: a Settings tab of switches, keys and vim options
 * (each change written into the file), and the file itself in the JSON tab. The JSON tab is the
 * file, edited as a file: JSON in the same editor as the notes (with vim, if it's
 * on), problems listed above it, and a reference of every setting and command id below. Changes
 * apply as you type, once the file is valid JSON.
 */
export default function SettingsPane({
  text,
  setText,
  config,
  errors,
  broken,
  actions,
}: {
  text: string;
  setText: (text: string) => void;
  config: ShedNotesConfig;
  errors: string[];
  broken: boolean;
  actions: NoteActions;
}) {
  const [version, setVersion] = useState(0);
  const [resetting, setResetting] = useState(false);
  const [reference, setReference] = useState(false);
  const [tab, setTab] = useState<"form" | "json">("form");
  const unknown = config.keybindings.filter((b) => !COMMAND_BY_ID.has(b.command)).map((b) => `"${b.key}" runs "${b.command}", which isn't a Shed Notes command.`);
  const vimProblems = broken ? [] : applyVimConfig(config);
  const problems = [...errors, ...unknown, ...vimProblems];
  const keyFor = (id: string) => keysFor(id, config.keybindings);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-semibold tracking-tight">Settings</h2>
          <p className="text-xs text-muted">How notes look, your keys and vim. Saved to your account as shed-notes.json.</p>
        </div>
        <button type="button" onClick={() => setResetting(true)} className="h-8 shrink-0 rounded-md bg-foreground/[0.05] px-3 text-xs font-medium transition-colors hover:bg-surface-hover">
          Reset to defaults
        </button>
      </div>
      <div className="flex items-center gap-4 border-b border-foreground/10">
        <div role="tablist" aria-label="Edit the settings as" className="flex gap-4 text-sm">
          {(["form", "json"] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`-mb-px border-b-2 py-2 font-medium transition-colors ${tab === t ? "border-foreground text-foreground" : "border-transparent text-muted hover:text-foreground"}`}>
              {t === "form" ? "Settings" : "JSON"}
            </button>
          ))}
        </div>
        {tab === "json" && (
          <button type="button" onClick={() => setReference((r) => !r)} aria-pressed={reference} className={`ml-auto mb-1 h-7 rounded-md px-2 text-xs font-medium transition-colors hover:bg-surface-hover ${reference ? "bg-surface-hover text-foreground" : "text-muted hover:text-foreground"}`}>
            Reference
          </button>
        )}
      </div>

      {tab === "form" && (
        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          <SettingsForm text={text} setText={setText} config={config} broken={broken} />
        </div>
      )}

      {tab === "json" && problems.length > 0 && (
        <ul className={`flex flex-col gap-1 rounded-md border px-3 py-2 text-xs ${broken ? "border-danger/30 bg-danger/10 text-danger" : "border-foreground/10 bg-surface text-muted"}`}>
          {broken && <li className="font-medium">This isn&apos;t valid JSON yet, so the last good settings are still in use.</li>}
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      {tab === "json" && reference && (
        <div className="flex max-h-[45vh] flex-col gap-4 overflow-y-auto rounded-lg bg-surface p-3 text-xs">
          <div className="flex flex-col gap-1.5">
            <h3 className="font-medium text-muted">Settings</h3>
            {OPTIONS.map(([k, d]) => (
              <p key={k}>
                <code className="font-medium text-foreground">{k}</code> <span className="text-muted">— {d}</span>
              </p>
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            <h3 className="font-medium text-muted">Vim</h3>
            <VimGuide leader={config.vim.leader} />
          </div>
          <div className="flex flex-col gap-1">
            <h3 className="font-medium text-muted">Commands</h3>
            <table className="w-full border-separate border-spacing-y-0.5">
              <tbody>
                {COMMANDS.map((c) => (
                  <tr key={c.id}>
                    <td className="pr-3 align-top">
                      <code className="text-foreground">{c.id}</code>
                    </td>
                    <td className="pr-3 align-top text-muted">{c.name}</td>
                    <td className="whitespace-nowrap text-right align-top font-mono text-muted">{keyFor(c.id)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "json" && (
      <div className="min-h-[60vh] overflow-hidden rounded-lg bg-surface lg:min-h-0 lg:flex-1">
        <NoteEditor key={version} initialText={text} language="json" config={config} actions={actions} onChange={setText} className="h-full" />
      </div>
      )}

      {resetting && (
        <ConfirmDialog
          title="Reset the settings file?"
          message="Your keybindings, vim mappings and other settings go back to how they started."
          confirmLabel="Reset"
          onConfirm={() => {
            setText(DEFAULT_CONFIG_TEXT);
            setVersion((v) => v + 1);
            setResetting(false);
          }}
          onCancel={() => setResetting(false)}
        />
      )}
    </div>
  );
}
