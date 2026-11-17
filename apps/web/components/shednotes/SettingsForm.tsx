"use client";

import { useEffect, useMemo, useState } from "react";
import SwitchRow from "@/components/SwitchRow";
import { CloseIcon, PencilIcon, RepeatIcon, SearchIcon } from "@/components/tools";
import { DEFAULT_CONFIG, type ShedNotesConfig, resetCommandKey, setCommandKey, setConfigValue, setVimValue } from "@/lib/shedNotesConfig";
import { COMMANDS, COMMAND_BY_ID, keyLabel } from "./commands";
import VimGuide from "./VimGuide";

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

const SWITCHES: { key: "vimMode" | "livePreview" | "wordCompletion" | "lineNumbers" | "readableLineLength" | "spellcheck"; label: string; hint: string }[] = [
  { key: "livePreview", label: "Live preview", hint: "Hides markdown marks where the cursor isn't and draws notation. Off shows the plain text." },
  { key: "wordCompletion", label: "Word suggestions", hint: "Suggests up to four words that finish what you're typing — your own words first, then common English and music words. Enter or Tab fills one in; keep typing to ignore them." },
  { key: "vimMode", label: "Vim keys", hint: "Vim's normal, insert and visual modes in every note." },
  { key: "lineNumbers", label: "Line numbers", hint: "Numbers down the side of every note." },
  { key: "readableLineLength", label: "Readable line length", hint: "Keeps lines to a comfortable width on a wide screen. A note can still be made full width from its ⋮ menu." },
  { key: "spellcheck", label: "Spellcheck", hint: "The browser's red underline under misspelled words." },
];

/** A key press as a key name ("Mod-Shift-k"), or null for a lone modifier. */
function keyName(e: KeyboardEvent): string | null {
  if (["Control", "Shift", "Alt", "Meta", "OS"].includes(e.key)) return null;
  const mac = isMac();
  const mods: string[] = [];
  if (mac ? e.metaKey : e.ctrlKey) mods.push("Mod");
  if (mac && e.ctrlKey) mods.push("Ctrl");
  if (!mac && e.metaKey) mods.push("Meta");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  let key = e.key;
  // The physical key for letters, digits and Space (Alt and Shift change what they type).
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3).toLowerCase();
  else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
  else if (e.code === "Space") key = "Space";
  else if (e.code === "Backquote") key = "`";
  return [...mods, key].join("-");
}

/**
 * Shed Notes' settings as a page of switches, a key list and the vim options — the same file as
 * the JSON tab: every change here is written into it, the way you'd write it by hand.
 */
export default function SettingsForm({ text, setText, config, broken }: { text: string; setText: (text: string) => void; config: ShedNotesConfig; broken: boolean }) {
  const write = (next: string | null) => next !== null && setText(next);

  if (broken) {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
        The JSON has a mistake in it, so these settings can&apos;t be changed here until it&apos;s fixed. Open the JSON tab to see where.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-10">
      <Section title="Editor">
        <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {SWITCHES.map((s) => (
            <SwitchRow key={s.key} label={s.label} hint={s.hint} checked={config[s.key]} onChange={(on) => write(setConfigValue(text, s.key, on))} />
          ))}
        </div>
        <label className="flex flex-col gap-1.5 sm:max-w-sm">
          <span className="flex items-center justify-between text-sm font-medium text-muted">
            Text size <span className="tabular-nums text-foreground">{config.fontSize}px</span>
          </span>
          <input
            type="range"
            className="slider"
            min={10}
            max={32}
            value={config.fontSize}
            style={{ "--progress": `${((config.fontSize - 10) / 22) * 100}%` } as React.CSSProperties}
            onChange={(e) => write(setConfigValue(text, "fontSize", Number(e.target.value)))}
          />
        </label>
      </Section>

      <KeysSection text={text} config={config} write={write} />

      <Section title="Vim">
        <label className="flex flex-col gap-1 sm:max-w-sm">
          <span className="text-xs font-medium text-muted">Leader key</span>
          <input
            value={config.vim.leader}
            onChange={(e) => e.target.value && write(setVimValue(text, "leader", e.target.value))}
            className="h-9 rounded-md bg-foreground/[0.05] px-3 font-mono text-sm outline-none transition-colors focus:ring-2 focus:ring-accent/40"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">Mappings, one per line</span>
          <textarea
            value={config.vim.mappings.join("\n")}
            onChange={(e) => write(setVimValue(text, "mappings", e.target.value.split("\n")))}
            rows={Math.max(3, config.vim.mappings.length + 1)}
            spellCheck={false}
            placeholder="imap jk <Esc>"
            className="rounded-md bg-foreground/[0.05] px-3 py-2 font-mono text-sm outline-none transition-colors focus:ring-2 focus:ring-accent/40"
          />
          <span className="text-xs text-muted">map, nmap, imap, vmap, noremap, nnoremap, inoremap, vnoremap or unmap.</span>
        </label>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">Your : commands</span>
          {Object.keys(config.vim.exCommands).length ? (
            <ul className="flex flex-col gap-1 text-sm">
              {Object.entries(config.vim.exCommands).map(([name, id]) => (
                <li key={name} className="flex flex-wrap items-baseline gap-x-2">
                  <code className="font-medium text-foreground">:{name}</code>
                  <span className="text-muted">{COMMAND_BY_ID.get(id)?.name ?? id}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">None yet.</p>
          )}
          <span className="text-xs text-muted">Add or change these in the JSON tab, under &quot;vim&quot; → &quot;exCommands&quot;.</span>
        </div>
        <details className="group rounded-md bg-background p-3">
          <summary className="cursor-pointer select-none text-sm font-medium">How to write mappings</summary>
          <div className="pt-3">
            <VimGuide leader={config.vim.leader} />
          </div>
        </details>
      </Section>
    </div>
  );
}

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="flex flex-col overflow-hidden rounded-lg bg-surface">
      <div className="flex min-h-11 items-center gap-2 px-4 py-1.5">
        <h3 className="min-w-0 flex-1 text-sm font-medium">{title}</h3>
        {aside}
      </div>
      <div className="flex flex-col gap-3 p-4">{children}</div>
    </section>
  );
}

function KeysSection({ text, config, write }: { text: string; config: ShedNotesConfig; write: (next: string | null) => void }) {
  const [q, setQ] = useState("");
  const [recording, setRecording] = useState<string | null>(null);
  const [captured, setCaptured] = useState<string | null>(null);

  const keysOf = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const b of config.keybindings) m.set(b.command, [...(m.get(b.command) ?? []), b.key]);
    return m;
  }, [config.keybindings]);
  const builtIn = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const b of DEFAULT_CONFIG.keybindings) m.set(b.command, [...(m.get(b.command) ?? []), b.key]);
    return m;
  }, []);
  const changed = (id: string) => {
    const a = (keysOf.get(id) ?? []).map((k) => k.toLowerCase()).sort();
    const b = (builtIn.get(id) ?? []).map((k) => k.toLowerCase()).sort();
    return a.join() !== b.join();
  };

  // While recording, the next key press (with Ctrl, Alt or ⌘ — or an F key) is the new key; Esc
  // stops. Caught before anything else on the page, so it doesn't also run.
  useEffect(() => {
    if (!recording || captured) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === "Escape") {
        setRecording(null);
        return;
      }
      const name = keyName(e);
      if (!name) return;
      const plain = !e.ctrlKey && !e.metaKey && !e.altKey;
      if (plain && !/^F\d+$/.test(e.key) && !(e.shiftKey && e.key === "Enter")) return;
      setCaptured(name);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording, captured]);

  const query = q.trim().toLowerCase();
  const shown = COMMANDS.filter((c) => !query || c.name.toLowerCase().includes(query) || c.id.includes(query) || (keysOf.get(c.id) ?? []).some((k) => keyLabel(k).toLowerCase().includes(query)));
  const clash = captured ? config.keybindings.find((b) => b.key.toLowerCase() === captured.toLowerCase() && b.command !== recording) : undefined;

  return (
    <Section
      title="Keyboard shortcuts"
      aside={
        <label className="flex h-8 w-40 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-2.5 transition-colors focus-within:ring-2 focus-within:ring-accent/40 sm:w-56">
          <SearchIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a command" aria-label="Find a command" className="min-w-0 flex-1 bg-transparent text-base outline-none sm:text-sm" />
        </label>
      }
    >
      <ul className="-mx-2 flex max-h-[28rem] flex-col overflow-y-auto">
        {shown.map((c) => {
          const keys = keysOf.get(c.id) ?? [];
          const isRec = recording === c.id;
          return (
            <li key={c.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2 py-1.5 transition-colors ${isRec ? "bg-surface-hover" : "hover:bg-surface-hover"}`}>
              <span className="min-w-0 flex-1 text-sm">
                {c.name}
                {changed(c.id) && <span className="ml-1.5 text-xs text-accent">changed</span>}
              </span>
              {isRec ? (
                captured ? (
                  <span className="flex flex-wrap items-center gap-2 text-xs">
                    <Kbd>{keyLabel(captured)}</Kbd>
                    {clash && <span className="text-muted">takes it from “{COMMAND_BY_ID.get(clash.command)?.name ?? clash.command}”</span>}
                    <button
                      type="button"
                      onClick={() => {
                        write(setCommandKey(text, c.id, captured));
                        setRecording(null);
                        setCaptured(null);
                      }}
                      className="h-7 rounded-md bg-accent px-2.5 font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
                    >
                      Save
                    </button>
                    <button type="button" onClick={() => setCaptured(null)} className="h-7 rounded-md bg-foreground/[0.05] px-2.5 font-medium transition-colors hover:bg-background">
                      Again
                    </button>
                    <button type="button" onClick={() => { setRecording(null); setCaptured(null); }} className="h-7 rounded-md px-2 font-medium text-muted transition-colors hover:text-foreground">
                      Cancel
                    </button>
                  </span>
                ) : (
                  <span className="text-xs font-medium text-foreground">Press the keys… (Esc to stop)</span>
                )
              ) : (
                <span className="flex flex-wrap items-center gap-1">
                  {keys.map((k) => (
                    <Kbd key={k}>{keyLabel(k)}</Kbd>
                  ))}
                  <IconBtn label={keys.length ? `Change the key for ${c.name}` : `Add a key for ${c.name}`} onClick={() => { setRecording(c.id); setCaptured(null); }}>
                    <PencilIcon className="h-3.5 w-3.5" />
                  </IconBtn>
                  {keys.length > 0 && (
                    <IconBtn label={`No key for ${c.name}`} onClick={() => write(setCommandKey(text, c.id, null))}>
                      <CloseIcon className="h-3.5 w-3.5" />
                    </IconBtn>
                  )}
                  {changed(c.id) && (
                    <IconBtn label={`Back to the built-in key for ${c.name}`} onClick={() => write(resetCommandKey(text, c.id))}>
                      <RepeatIcon className="h-3.5 w-3.5" />
                    </IconBtn>
                  )}
                </span>
              )}
            </li>
          );
        })}
        {!shown.length && <li className="px-2 py-3 text-sm text-muted">No command matches “{q}”.</li>}
      </ul>
      <p className="text-xs text-muted">Keys need Ctrl, Alt or {isMac() ? "⌘" : "the ⌘/Windows key"} (or are an F key), so they don&apos;t get in the way of typing.</p>
    </Section>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded-sm bg-background px-1.5 py-0.5 font-mono text-xs text-foreground">{children}</kbd>;
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="rounded-md p-1.5 text-muted transition-colors hover:bg-background hover:text-foreground">
      {children}
    </button>
  );
}
