"use client";

import { UNDER_TUNES } from "@/components/library/hrefs";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import PromptDialog from "@/components/PromptDialog";
import { EmptyState, Hero, HeroSearch, LibraryPage, Pill, Rows, SetlistItem } from "@/components/library/ui";
import { setlistHref } from "@/components/library/setlistParts";
import { useTuneLists } from "@/components/library/useTuneActions";
import { LibraryIcon, PlusIcon } from "@/components/tools";
import { useSetlists } from "@/lib/useSetlists";
import { sortByText } from "@jam-practice/core/sortText";

type Sort = "recent" | "name";

/** Every setlist — the Tunes page's "See all" for setlists. Searchable (by setlist name, its
    description, or any tune in it), sorted by most recently changed or A–Z; + makes a new one. */
export default function SetlistsPage() {
  const router = useRouter();
  const { setlists, create } = useSetlists();
  const lists = useTuneLists();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [naming, setNaming] = useState(false);

  const shown = useMemo(() => {
    const nameOf = new Map([...lists.tunes.tunes, ...lists.learn.tunes, ...lists.library.tunes].map((t) => [t.id, t.name]));
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const filtered = words.length
      ? setlists.filter((s) => {
          const hay = [s.name, s.description, ...s.tuneIds.map((id) => nameOf.get(id) ?? "")].join(" ").toLowerCase();
          return words.every((w) => hay.includes(w));
        })
      : setlists;
    return sort === "name" ? sortByText(filtered, (s) => s.name) : [...filtered].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [setlists, lists.tunes.tunes, lists.learn.tunes, lists.library.tunes, query, sort]);

  const nameOf = new Map([...lists.tunes.tunes, ...lists.learn.tunes, ...lists.library.tunes].map((t) => [t.id, t.name]));

  return (
    <LibraryPage>
      <Hero title="Setlists" crumbs={UNDER_TUNES} icon={LibraryIcon} helpTopic="tunes">
        {/* Phones: the sort toggle gets its own row under search + New, so the search box keeps
            most of the width. Hidden until there are setlists to sort. */}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <HeroSearch value={query} onChange={setQuery} placeholder="Search setlists…" />
          {setlists.length > 0 && (
          <div className="flex h-10 shrink-0 rounded-md bg-foreground/[0.05] p-0.5 max-sm:order-last max-sm:w-full sm:h-9" role="group" aria-label="Sort">
            {(["recent", "name"] as Sort[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setSort(key)}
                aria-pressed={sort === key}
                className={`rounded-[3px] px-2.5 text-xs font-medium max-sm:flex-1 transition-colors ${sort === key ? "bg-surface-hover text-foreground" : "text-muted hover:text-foreground"}`}
              >
                {key === "recent" ? "Recent" : "A–Z"}
              </button>
            ))}
          </div>
          )}
          <Pill primary icon={PlusIcon} label="New" onClick={() => setNaming(true)} />
        </div>
      </Hero>
      {shown.length === 0 ? (
        <EmptyState
          boxed
          title={query ? `No setlists match “${query}”` : "No setlists yet"}
          body={query ? undefined : "Put tunes in order for a gig or a session, give each its own key and tempo, and share it by link."}
          action={query ? undefined : <Pill primary icon={PlusIcon} label="New setlist" onClick={() => setNaming(true)} />}
        />
      ) : (
        <div className="overflow-hidden rounded-lg bg-surface">
          <Rows>
            {shown.map((s) => (
              <SetlistItem key={s.id} setlist={s} href={setlistHref(s.id)} tuneNames={s.tuneIds.map((id) => nameOf.get(id)).filter((n): n is string => !!n)} />
            ))}
          </Rows>
        </div>
      )}
      {naming && (
        <PromptDialog
          title="New setlist"
          initialValue=""
          confirmLabel="Create"
          onSubmit={(name) => {
            setNaming(false);
            router.push(setlistHref(create(name).id));
          }}
          onCancel={() => setNaming(false)}
        />
      )}
    </LibraryPage>
  );
}
