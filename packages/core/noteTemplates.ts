/**
 * Shed Notes template variables: `{{name}}` in a template's title or text. Making a note from the
 * template asks for each one (the same name is asked once and used everywhere). A few fill
 * themselves: {{date}} (2026-10-20), {{time}} (14:05) and {{title}} (the new note's title).
 */

export const VAR_RE = /\{\{\s*([^{}\n]+?)\s*\}\}/g;

export const BUILT_IN = ["date", "time", "title"] as const;
const isBuiltIn = (name: string) => (BUILT_IN as readonly string[]).includes(name.toLowerCase());

/** The variables to ask for, in the order they first appear (title first, then text). */
export function templateVars(...texts: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const text of texts) {
    for (const m of text.matchAll(VAR_RE)) {
      const name = m[1].trim();
      const key = name.toLowerCase();
      if (!name || isBuiltIn(name) || seen.has(key)) continue;
      seen.add(key);
      out.push(name);
    }
  }
  return out;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** `text` with every variable filled in. Names match without caring about case. Variables with no
    value are left empty. */
export function fillTemplate(text: string, values: Record<string, string>, opts: { title?: string; now?: Date } = {}): string {
  const now = opts.now ?? new Date();
  const lower = new Map(Object.entries(values).map(([k, v]) => [k.toLowerCase(), v]));
  return text.replace(VAR_RE, (all: string, raw: string) => {
    const key = raw.trim().toLowerCase();
    if (!key) return all;
    if (key === "date") return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    if (key === "time") return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    if (key === "title") return opts.title ?? "";
    return lower.get(key) ?? "";
  });
}
