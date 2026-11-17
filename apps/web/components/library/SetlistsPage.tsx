"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import PromptDialog from "@/components/PromptDialog";
import { EmptyState, Hero, HeroSearch, LibraryPage, LibraryTabs, Pill, Rows, SetlistItem, Toolbar } from "@/components/library/ui";
import { setlistHref } from "@/components/library/setlistParts";
import { useTuneLists } from "@/components/library/useTuneActions";
import { LibraryIcon, PlusIcon } from "@/components/tools";
import { useSetlists } from "@/lib/useSetlists";
import { sortByText } from "@jam-practice/core/sortText";
import StoragePill from "@/components/files/StoragePill";

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
    const nameOf = new Map([...lists.tunes.tunes, ...lists.learn.tunes].map((t) => [t.id, t.name]));
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const filtered = words.length
      ? setlists.filter((s) => {
          const hay = [s.name, s.description, ...s.tuneIds.map((id) => nameOf.get(id) ?? "")].join(" ").toLowerCase();
          return words.every((w) => hay.includes(w));
        })
      : setlists;
    return sort === "name" ? sortByText(filtered, (s) => s.name) : [...filtered].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [setlists, lists.tunes.tunes, lists.learn.tunes, query, sort]);

  const nameOf = new Map([...lists.tunes.tunes, ...lists.learn.tunes].map((t) => [t.id, t.name]));

  return (
    <LibraryPage>
      <Hero
        title="Library"
        icon={LibraryIcon}
        titleExtra={<StoragePill />}
        tabs={<LibraryTabs active="setlists" />}
      >
        <Toolbar>
          <HeroSearch value={query} onChange={setQuery} placeholder="Search setlists, or a tune in one…" />
          <div className="flex h-10 shrink-0 rounded-md bg-foreground/[0.05] p-0.5 sm:h-9" role="group" aria-label="Sort">
            {(["recent", "name"] as Sort[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setSort(key)}
                aria-pressed={sort === key}
                className={`rounded-[3px] px-2.5 text-xs font-medium transition-colors ${sort === key ? "bg-surface-hover text-foreground" : "text-muted hover:text-foreground"}`}
              >
                {key === "recent" ? "Recent" : "A–Z"}
              </button>
            ))}
          </div>
          <Pill primary icon={PlusIcon} label="New setlist" onClick={() => setNaming(true)} iconOnlyOnPhone />
        </Toolbar>
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
