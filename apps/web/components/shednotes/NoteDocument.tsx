"use client";

import { useQuery } from "convex/react";
import { Marked, type Tokens } from "marked";
import { useEffect, useMemo, useRef } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import { parseLinkInner } from "@jam-practice/core/shedNotes";
import Score from "@/components/notation/Score";
import { ScoreIcon } from "@/components/tools";
import { cleanScore } from "@/lib/bassTranscription";
import { splitNote } from "@jam-practice/core/shedNoteBlocks";
import { loadAbcjs, renderNotation } from "./livePreview";
import type { ScoreContext } from "./ScoreEmbeds";
import { FileEmbedView } from "./FileEmbeds";

/**
 * A note drawn as a page, not an editor — for printing (Export as PDF) and for a note opened from
 * its link. CodeMirror only draws the lines on screen, so a long note wouldn't print whole.
 * Markdown (with tables and checkboxes), [[links]] as pills, ==highlights==, the notation
 * blocks as music, and files (`![name](file:…)` lines) as pictures, players or cards. Any HTML typed in a note is shown as text, and links only go to web pages.
 */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Only web, mail and site links are kept; anything else (javascript:, data:) becomes "#". */
function safeHref(href: string) {
  const h = href.trim();
  if (/^(https?:|mailto:)/i.test(h) || /^\/(?!\/)/.test(h) || h.startsWith("#")) return h;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(h) && !h.startsWith("//")) return `https://${h}`;
  return "#";
}

const md = new Marked({ gfm: true, breaks: false });
md.use({
  renderer: {
    html({ text }: Tokens.HTML | Tokens.Tag) {
      return esc(text);
    },
    link({ href, title, tokens }: Tokens.Link) {
      const inner = this.parser.parseInline(tokens);
      const h = safeHref(href);
      const external = /^https?:/i.test(h);
      return `<a href="${esc(h)}"${title ? ` title="${esc(title)}"` : ""}${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${inner}</a>`;
    },
    image({ href, title, text }: Tokens.Image) {
      if (!/^https:/i.test(href.trim())) return esc(text);
      return `<img src="${esc(href.trim())}" alt="${esc(text)}"${title ? ` title="${esc(title)}"` : ""} />`;
    },
  },
  extensions: [
    {
      name: "wikilink",
      level: "inline",
      start: (src: string) => src.indexOf("[["),
      tokenizer(src: string) {
        const m = /^\[\[([^[\]\n]+?)\]\]/.exec(src);
        if (m) return { type: "wikilink", raw: m[0], inner: m[1] };
      },
      renderer(token) {
        const { target, heading, alias } = parseLinkInner((token as unknown as { inner: string }).inner);
        return `<span class="note-doc-wikilink" data-target="${esc(target)}">${esc(alias ?? (heading ? `${target} › ${heading}` : target))}</span>`;
      },
    },
    {
      name: "highlight",
      level: "inline",
      start: (src: string) => src.indexOf("=="),
      tokenizer(src: string) {
        const m = /^==(?=\S)([^\n]*?\S)==/.exec(src);
        if (m) return { type: "highlight", raw: m[0], text: m[1], tokens: this.lexer.inlineTokens(m[1]) };
      },
      renderer(token) {
        return `<mark>${this.parser.parseInline((token as Tokens.Generic).tokens ?? [])}</mark>`;
      },
    },
  ],
});

/** The note's text, split around its notation blocks and file lines — shared with the phone
    (`packages/core/shedNoteBlocks.ts`). */
export { splitNote };

const noop = () => {};

function ScoreBlock({ id, context }: { id: string; context?: ScoreContext }) {
  const row = useQuery(api.scores.get, id ? { id, ...(context ?? {}) } : "skip");
  const data = row?.data;
  const score = useMemo(() => (data ? cleanScore(data) : row === null ? null : undefined), [data, row]);
  return (
    <figure className="note-doc-score" data-ready={score !== undefined ? "" : undefined}>
      <figcaption className="flex items-center gap-2 text-sm font-medium">
        <ScoreIcon className="h-4 w-4 shrink-0 text-muted" />
        {score ? score.title : score === null ? "Score not found" : "Loading…"}
      </figcaption>
      {score && <Score transcription={score} cursor={null} playing={null} mode="select" onSelect={noop} onAdd={noop} onReplace={noop} onChordClick={noop} />}
    </figure>
  );
}

function AbcBlock({ abc }: { abc: string }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let live = true;
    void loadAbcjs().then(() => {
      if (live && el.current) {
        renderNotation(el.current, abc);
        el.current.dataset.ready = "";
      }
    });
    return () => {
      live = false;
    };
  }, [abc]);
  return <div ref={el} className="note-doc-abc" />;
}

const unesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/** `linkHref` turns the [[links]] it has an address for into links (the rest stay pills);
    `onLink` opens them in place instead of loading the page again. */
export default function NoteDocument({
  body,
  context,
  fontFamily,
  className = "",
  linkHref,
  onLink,
}: {
  body: string;
  context?: ScoreContext;
  fontFamily?: string;
  className?: string;
  linkHref?: (target: string) => string | null;
  onLink?: (href: string) => void;
}) {
  const parts = useMemo(
    () =>
      splitNote(body).map((p) => {
        if (p.kind !== "md") return p;
        let html = md.parse(p.text, { async: false }) as string;
        if (linkHref) {
          html = html.replace(/<span class="note-doc-wikilink" data-target="([^"]*)">([\s\S]*?)<\/span>/g, (all, target: string, label: string) => {
            const href = linkHref(unesc(target));
            // A note this page can't open: shown, but plainly not a link.
            return href ? `<a class="note-doc-wikilink note-doc-wikilink-open" href="${esc(href)}" data-note-link="">${label}</a>` : all.replace('class="note-doc-wikilink"', 'class="note-doc-wikilink note-doc-wikilink-closed"');
          });
        }
        return { ...p, html };
      }),
    [body, linkHref],
  );
  return (
    <div
      className={`note-doc ${className}`}
      style={fontFamily ? { fontFamily } : undefined}
      onClick={(e) => {
        const a = (e.target as HTMLElement).closest<HTMLAnchorElement>("a[data-note-link]");
        if (!a || !onLink || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        onLink(a.getAttribute("href")!);
      }}
    >
      {parts.map((p, i) =>
        p.kind === "md" ? (
          <div key={i} dangerouslySetInnerHTML={{ __html: (p as { html: string }).html }} />
        ) : p.kind === "score" ? (
          <ScoreBlock key={i} id={p.id} context={context} />
        ) : p.kind === "file" ? (
          <FileEmbedView key={i} fileRef={p.ref} name={p.name} width={p.width} context={context} />
        ) : (
          <AbcBlock key={i} abc={p.abc} />
        ),
      )}
    </div>
  );
}

/** How many notation blocks and files a note has (the print page waits for them to draw). */
export const notationCount = (body: string) => splitNote(body).filter((p) => p.kind !== "md").length;
