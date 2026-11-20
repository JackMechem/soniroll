/**
 * Shed Notes' settings file: one JSON text, stored in the account (`syncedSettings`, key
 * `jam-practice-shed-notes`), edited as a file inside Shed Notes and nowhere else (the Vim switch
 * in the toolbar just rewrites `vimMode` in it). The text is kept exactly as typed, so a mistake
 * never loses anything: until it parses again, the last good settings stay in use.
 */

export type Keybinding = { key: string; command: string };

export type ShedNotesConfig = {
  vimMode: boolean;
  livePreview: boolean;
  lineNumbers: boolean;
  readableLineLength: boolean;
  fontSize: number;
  spellcheck: boolean;
  /** Suggest words while typing (Enter or Tab fills one in). */
  wordCompletion: boolean;
  keybindings: Keybinding[];
  vim: {
    /** What `<leader>` means in mappings. */
    leader: string;
    /** vimrc lines: `imap jk <Esc>`, `nnoremap <leader>n :new<CR>`, `unmap Q`. */
    mappings: string[];
    /** Your own `:` commands: name → a Shed Notes command id. */
    exCommands: Record<string, string>;
  };
};

export const DEFAULT_CONFIG: ShedNotesConfig = {
  vimMode: false,
  livePreview: true,
  lineNumbers: false,
  readableLineLength: true,
  fontSize: 16,
  spellcheck: true,
  wordCompletion: false,
  keybindings: [
    // Finding and moving around
    // Alt-Space first (Jack's pick; on Windows the system can take it for the window menu —
    // Mod-p works everywhere).
    { key: "Alt-Space", command: "app:command-palette" },
    { key: "Mod-p", command: "app:command-palette" },
    { key: "Mod-o", command: "app:quick-switcher" },
    { key: "Alt-f", command: "app:search" },
    { key: "Mod-,", command: "app:open-settings" },
    { key: "Mod-Alt-ArrowLeft", command: "app:go-back" },
    { key: "Mod-Alt-ArrowRight", command: "app:go-forward" },
    { key: "Mod-Enter", command: "editor:follow-link" },
    { key: "Shift-Enter", command: "editor:follow-link" },
    // Notes
    { key: "Alt-n", command: "note:new" },
    { key: "F2", command: "note:rename" },
    { key: "Alt-m", command: "note:move" },
    { key: "Mod-Alt-Backspace", command: "note:delete" },
    { key: "Mod-Alt-u", command: "note:share" },
    { key: "Mod-Alt-p", command: "note:export-pdf" },
    { key: "Mod-Alt-e", command: "app:export-all" },
    { key: "Mod-Alt-i", command: "app:import" },
    { key: "Alt-t", command: "note:new-from-template" },
    { key: "Alt-Shift-t", command: "note:apply-template" },
    { key: "Mod-Alt-j", command: "app:open-templates" },
    { key: "Alt-w", command: "note:close" },
    { key: "Mod-s", command: "note:save" },
    // How it looks
    { key: "Ctrl-`", command: "view:toggle-live-preview" },
    { key: "Mod-Alt-v", command: "view:toggle-vim" },
    { key: "Mod-Alt-b", command: "view:toggle-note-list" },
    { key: "Mod-Alt-l", command: "view:toggle-links-panel" },
    { key: "Mod-Alt-n", command: "view:toggle-line-numbers" },
    { key: "Mod-Alt-f", command: "view:toggle-full-width" },
    { key: "Mod-Alt-r", command: "view:toggle-readable-width" },
    { key: "Mod-Alt-s", command: "view:toggle-spellcheck" },
    // Writing
    { key: "Mod-b", command: "editor:toggle-bold" },
    { key: "Mod-i", command: "editor:toggle-italic" },
    { key: "Mod-Shift-x", command: "editor:toggle-strikethrough" },
    { key: "Mod-Shift-h", command: "editor:toggle-highlight" },
    { key: "Mod-`", command: "editor:toggle-code" },
    { key: "Mod-Alt-1", command: "editor:set-heading-1" },
    { key: "Mod-Alt-2", command: "editor:set-heading-2" },
    { key: "Mod-Alt-3", command: "editor:set-heading-3" },
    { key: "Mod-Alt-4", command: "editor:set-heading-4" },
    { key: "Mod-Alt-5", command: "editor:set-heading-5" },
    { key: "Mod-Alt-6", command: "editor:set-heading-6" },
    { key: "Mod-Alt-0", command: "editor:remove-heading" },
    { key: "Mod-l", command: "editor:toggle-checklist" },
    { key: "Mod-Shift-8", command: "editor:toggle-bullet-list" },
    { key: "Mod-Shift-7", command: "editor:toggle-numbered-list" },
    { key: "Mod-'", command: "editor:toggle-quote" },
    { key: "Mod-k", command: "editor:insert-wikilink" },
    { key: "Mod-Alt-h", command: "editor:insert-horizontal-rule" },
    { key: "Mod-Alt-t", command: "editor:insert-table" },
    { key: "Mod-Shift-m", command: "editor:insert-notation" },
  ],
  vim: {
    leader: "<Space>",
    mappings: ["nmap j gj", "nmap k gk"],
    exCommands: { notation: "editor:insert-notation", palette: "app:command-palette" },
  },
};

export const DEFAULT_CONFIG_TEXT = JSON.stringify(DEFAULT_CONFIG, null, 2);

export type ConfigResult = { config: ShedNotesConfig; errors: string[] };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Parses the settings text. Unknown keys are reported; missing ones take the defaults. With a
    JSON syntax error, `config` is null and `errors` says where. */
export function parseConfig(text: string): { config: ShedNotesConfig | null; errors: string[] } {
  let raw: unknown;
  try {
    raw = text.trim() ? JSON.parse(text) : {};
  } catch (e) {
    return { config: null, errors: [String((e as Error).message)] };
  }
  if (!isObj(raw)) return { config: null, errors: ["The settings file must be one JSON object: { ... }"] };
  const errors: string[] = [];
  const known = new Set(Object.keys(DEFAULT_CONFIG));
  for (const k of Object.keys(raw)) if (!known.has(k)) errors.push(`Unknown setting "${k}" (ignored).`);
  const bool = (k: keyof ShedNotesConfig) => {
    const v = raw[k];
    if (v === undefined) return DEFAULT_CONFIG[k] as boolean;
    if (typeof v !== "boolean") errors.push(`"${k}" should be true or false.`);
    return typeof v === "boolean" ? v : (DEFAULT_CONFIG[k] as boolean);
  };
  let fontSize = DEFAULT_CONFIG.fontSize;
  if (raw.fontSize !== undefined) {
    if (typeof raw.fontSize === "number" && raw.fontSize >= 10 && raw.fontSize <= 32) fontSize = raw.fontSize;
    else errors.push(`"fontSize" should be a number from 10 to 32.`);
  }
  // Your keys go on top of the built-in ones: a key you list replaces that key's built-in
  // command, and "command": "" turns the key off. (So new built-in keys reach files written
  // before they existed.)
  let keybindings = DEFAULT_CONFIG.keybindings;
  if (raw.keybindings !== undefined) {
    if (!Array.isArray(raw.keybindings)) errors.push(`"keybindings" should be a list of { "key": ..., "command": ... }.`);
    else {
      const mine: Keybinding[] = [];
      raw.keybindings.forEach((b, i) => {
        if (isObj(b) && typeof b.key === "string" && b.key.trim() && typeof b.command === "string") mine.push({ key: b.key.trim(), command: b.command.trim() });
        else errors.push(`keybindings[${i}] needs a "key" and a "command".`);
      });
      const listed = new Set(mine.map((b) => b.key.toLowerCase()));
      keybindings = [...DEFAULT_CONFIG.keybindings.filter((b) => !listed.has(b.key.toLowerCase())), ...mine.filter((b) => b.command)];
    }
  }
  const vim = { ...DEFAULT_CONFIG.vim };
  if (raw.vim !== undefined) {
    if (!isObj(raw.vim)) errors.push(`"vim" should be an object.`);
    else {
      for (const k of Object.keys(raw.vim)) if (!(k in DEFAULT_CONFIG.vim)) errors.push(`Unknown vim setting "${k}" (ignored).`);
      if (raw.vim.leader !== undefined) {
        if (typeof raw.vim.leader === "string" && raw.vim.leader) vim.leader = raw.vim.leader;
        else errors.push(`"vim.leader" should be a key, like "<Space>" or ",".`);
      }
      if (raw.vim.mappings !== undefined) {
        if (Array.isArray(raw.vim.mappings) && raw.vim.mappings.every((m) => typeof m === "string")) vim.mappings = raw.vim.mappings as string[];
        else errors.push(`"vim.mappings" should be a list of lines like "imap jk <Esc>".`);
      }
      if (raw.vim.exCommands !== undefined) {
        if (isObj(raw.vim.exCommands) && Object.values(raw.vim.exCommands).every((c) => typeof c === "string")) vim.exCommands = raw.vim.exCommands as Record<string, string>;
        else errors.push(`"vim.exCommands" should map names to command ids: { "notation": "editor:insert-notation" }.`);
      }
    }
  }
  return {
    config: {
      vimMode: bool("vimMode"),
      livePreview: bool("livePreview"),
      lineNumbers: bool("lineNumbers"),
      readableLineLength: bool("readableLineLength"),
      spellcheck: bool("spellcheck"),
      wordCompletion: bool("wordCompletion"),
      fontSize,
      keybindings,
      vim,
    },
    errors,
  };
}

/** The settings text with one top-level setting changed (for the toolbar's switches). Null when
    the text doesn't parse, so nothing is overwritten. */
export function setConfigValue(text: string, key: keyof ShedNotesConfig, value: unknown): string | null {
  let raw: unknown;
  try {
    raw = text.trim() ? JSON.parse(text) : {};
  } catch {
    return null;
  }
  if (!isObj(raw)) return null;
  return JSON.stringify({ ...raw, [key]: value }, null, 2);
}

/** The settings text as an object, or null when it doesn't parse. */
function rawConfig(text: string): Record<string, unknown> | null {
  try {
    const raw: unknown = text.trim() ? JSON.parse(text) : {};
    return isObj(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** The settings text with one vim setting changed. Null when the text doesn't parse. */
export function setVimValue(text: string, key: keyof ShedNotesConfig["vim"], value: unknown): string | null {
  const raw = rawConfig(text);
  if (!raw) return null;
  return JSON.stringify({ ...raw, vim: { ...(isObj(raw.vim) ? raw.vim : {}), [key]: value } }, null, 2);
}

/** The keys you've listed yourself in the file (not the built-in ones). */
export function userKeybindings(text: string): Keybinding[] {
  const raw = rawConfig(text);
  if (!raw || !Array.isArray(raw.keybindings)) return [];
  return raw.keybindings.filter((b): b is Keybinding => isObj(b) && typeof b.key === "string" && typeof b.command === "string");
}

const sameKey = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The settings text with a command's keys changed, written the way you'd write it by hand: its
 * built-in keys are turned off ("command": ""), and `key` (if any) runs it. Whatever else had
 * that key loses it. `null` key = no key at all. Null when the text doesn't parse.
 */
export function setCommandKey(text: string, command: string, key: string | null): string | null {
  const raw = rawConfig(text);
  if (!raw) return null;
  const builtIn = DEFAULT_CONFIG.keybindings.filter((b) => b.command === command).map((b) => b.key);
  let list = userKeybindings(text).filter((b) => b.command !== command && !(b.command === "" && builtIn.some((k) => sameKey(k, b.key))));
  if (key) list = list.filter((b) => !sameKey(b.key, key));
  for (const k of builtIn) if (!key || !sameKey(k, key)) list.push({ key: k, command: "" });
  if (key) list.push({ key, command });
  return JSON.stringify({ ...raw, keybindings: list }, null, 2);
}

/** The settings text with a command back on its built-in keys. Null when the text doesn't parse. */
export function resetCommandKey(text: string, command: string): string | null {
  const raw = rawConfig(text);
  if (!raw) return null;
  const builtIn = DEFAULT_CONFIG.keybindings.filter((b) => b.command === command).map((b) => b.key);
  const list = userKeybindings(text).filter((b) => b.command !== command && !builtIn.some((k) => sameKey(k, b.key)));
  const next: Record<string, unknown> = { ...raw, keybindings: list };
  if (!list.length) delete next.keybindings;
  return JSON.stringify(next, null, 2);
}

/** One vimrc line, parsed. */
export type VimrcLine =
  | { kind: "map"; lhs: string; rhs: string; mode: "normal" | "insert" | "visual" | undefined; noremap: boolean }
  | { kind: "unmap"; lhs: string; mode: "normal" | "insert" | "visual" | undefined }
  | { kind: "error"; message: string };

const MODES: Record<string, "normal" | "insert" | "visual" | undefined> = { "": undefined, n: "normal", i: "insert", v: "visual", x: "visual" };

export function parseVimrcLine(line: string, leader: string): VimrcLine | null {
  const text = line.trim();
  if (!text || text.startsWith('"')) return null;
  const m = /^([nivx]?)(nore)?map\s+(\S+)\s+(.+)$/.exec(text);
  const lead = (s: string) => s.replace(/<leader>/gi, leader);
  if (m) return { kind: "map", mode: MODES[m[1]], noremap: !!m[2], lhs: lead(m[3]), rhs: lead(m[4].trim()) };
  const u = /^([nivx]?)unmap\s+(\S+)$/.exec(text);
  if (u) return { kind: "unmap", mode: MODES[u[1]], lhs: lead(u[2]) };
  return { kind: "error", message: `Can't read vim mapping "${text}". Use map, nmap, imap, vmap, noremap, nnoremap, inoremap, vnoremap or unmap.` };
}
