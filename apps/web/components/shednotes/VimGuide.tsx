"use client";

import { COMMANDS } from "./commands";

const Code = ({ children }: { children: React.ReactNode }) => <code className="rounded-sm bg-surface px-1 py-0.5 font-mono text-[0.85em] text-foreground">{children}</code>;

const EXAMPLES: [string, string][] = [
  ["imap jk <Esc>", "Typing jk quickly in insert mode leaves it, like Esc."],
  ["nmap j gj", "j moves down one line as you see it on screen, even inside a long wrapped line (on at first; k gk too)."],
  ["nnoremap <leader>n :new<CR>", "Space, then n, makes a new note."],
  ["nnoremap <leader>s :w<CR>", "Space, then s, saves now."],
  ["nnoremap <leader>ff :palette<CR>", "Space, f, f opens the command palette."],
  ["nnoremap <leader>fg :app:search<CR>", "Space, f, g searches every note — any command id works after the colon."],
  ["nnoremap <leader>o :app:quick-switcher<CR>", "Space, then o, finds a note by name."],
  ["nnoremap <leader>u :note:share<CR>", "Space, then u, shares this note."],
  ["nnoremap <leader>t :e Today<CR>", "Space, then t, opens the note called Today (making it if it's new)."],
  ["vnoremap <leader>b :editor:toggle-bold<CR>", "In visual mode, Space then b makes the selection bold."],
  ["nnoremap H ^", "H jumps to the start of the line's text."],
];

/**
 * How to write vim mappings in Shed Notes: the pieces of a line, the leader, running Shed Notes
 * commands, your own `:` commands, and examples. Shown in the settings' Vim section and Reference.
 */
export default function VimGuide({ leader }: { leader: string }) {
  const leaderName = leader === "<Space>" ? "Space" : leader;
  return (
    <div className="flex flex-col gap-4 text-sm leading-relaxed">
      <section className="flex flex-col gap-1.5">
        <h4 className="font-medium">A mapping, piece by piece</h4>
        <p className="text-muted">
          Each line is <Code>mode keys action</Code>: when you press <em>keys</em> in that mode, Shed Notes presses <em>action</em> for you. In{" "}
          <Code>nnoremap &lt;leader&gt;s :w&lt;CR&gt;</Code>, the mode is normal, the keys are your leader then s, and the action types <Code>:w</Code> and Enter.
        </p>
        <ul className="ml-4 list-disc text-muted">
          <li>
            <Code>nmap</Code> normal mode, <Code>imap</Code> insert mode, <Code>vmap</Code> visual mode, <Code>map</Code> normal, visual and operator-pending.
          </li>
          <li>
            Add <Code>nore</Code> (<Code>nnoremap</Code>, <Code>inoremap</Code>, <Code>vnoremap</Code>, <Code>noremap</Code>) so the action means vim&apos;s own keys and never sets off another mapping. Use it unless you mean to chain mappings.
          </li>
          <li>
            <Code>unmap keys</Code> (or <Code>nunmap</Code>, <Code>iunmap</Code>, <Code>vunmap</Code>) removes one.
          </li>
          <li>
            Special keys go in angle brackets: <Code>&lt;CR&gt;</Code> Enter, <Code>&lt;Esc&gt;</Code>, <Code>&lt;Space&gt;</Code>, <Code>&lt;Tab&gt;</Code>, <Code>&lt;BS&gt;</Code>, <Code>&lt;C-x&gt;</Code> Ctrl-x, <Code>&lt;A-x&gt;</Code> Alt-x.
          </li>
          <li>A line starting with &quot; is a comment.</li>
        </ul>
      </section>

      <section className="flex flex-col gap-1.5">
        <h4 className="font-medium">The leader key</h4>
        <p className="text-muted">
          Write <Code>&lt;leader&gt;</Code> in the keys and it stands for your leader key — now <strong className="text-foreground">{leaderName}</strong>. Change it under Leader key (in the JSON: <Code>&quot;vim&quot;: {"{"} &quot;leader&quot;: &quot;,&quot; {"}"}</Code>); write Space as <Code>&lt;Space&gt;</Code>.
        </p>
        <p className="text-muted">
          After the first key of a mapping, Shed Notes waits up to a second for the rest. Pressed on its own, the key does what it normally does once the second is up (Space moves right), and a key that doesn&apos;t continue any mapping goes through right away.
        </p>
      </section>

      <section className="flex flex-col gap-1.5">
        <h4 className="font-medium">Running Shed Notes commands</h4>
        <p className="text-muted">
          An action can be a <Code>:</Code> command. End it with <Code>&lt;CR&gt;</Code> so it runs (without it, it waits in the command line).
        </p>
        <ul className="ml-4 list-disc text-muted">
          <li>
            <Code>:w</Code> save now · <Code>:q</Code> close the note · <Code>:wq</Code> both · <Code>:e Title</Code> open a note (making it if it&apos;s new) · <Code>:new</Code> or <Code>:new Title</Code> a new note.
          </li>
          <li>
            Any Shed Notes command, by its id: <Code>:app:search</Code>, <Code>:note:share</Code>, <Code>:editor:toggle-bold</Code> — the same ids as in &quot;keybindings&quot;. There are {COMMANDS.length}; the Reference in the JSON tab lists them all. (<Code>:cmd app:search</Code> works too.) From visual mode, commands that change text work on the selection.
          </li>
          <li>
            Your own short names: in the JSON, <Code>&quot;exCommands&quot;: {"{"} &quot;share&quot;: &quot;note:share&quot; {"}"}</Code> adds <Code>:share</Code>. Built in are <Code>:notation</Code> and <Code>:palette</Code>.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-1.5">
        <h4 className="font-medium">Examples</h4>
        <ul className="flex flex-col gap-1.5">
          {EXAMPLES.map(([line, what]) => (
            <li key={line} className="flex flex-col">
              <Code>{line}</Code>
              <span className="text-muted">{what}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-1.5">
        <h4 className="font-medium">If it doesn&apos;t work</h4>
        <ul className="ml-4 list-disc text-muted">
          <li>Vim keys must be on, and mappings work in notes, not in the settings file&apos;s JSON editor.</li>
          <li>Check you&apos;re in the right mode: an nmap does nothing while you&apos;re typing in insert mode.</li>
          <li>Lines vim can&apos;t read are listed at the top of the JSON tab.</li>
          <li>Shed Notes&apos; own shortcuts (Ctrl/⌘, Alt) come before vim&apos;s, so map keys without them, or change the shortcut under Keyboard shortcuts.</li>
        </ul>
      </section>
    </div>
  );
}
