<!-- Moved word for word from the old single PROJECT.md (lines 3163–3309) on 2026-10-18. Older entries give paths relative to apps/web/ (or packages/convex/ for convex/...); see docs/notes/repo-structure.md. -->

### The sidebar's tools, reorganized (2026-10-17, web; the categories are shared with mobile)

`packages/core/navLinks.ts`: categories are now by what you're doing — **Play along** (Jam
Practice, Bass Genius, Slow Downer, Drum Generator), **Time & rhythm** (Metronome, the Polyrhythm
metronome, Tempo Trainer), **Ear training** (the three Guess tools), **On your instrument** (Note,
Scale, Interval Trainer, Tuner), **Drums** (Sticking Warmup, Syncopation), **Practice tools** (Shed
Log, Practice Timer, Recorder) — plus Community as before. A new optional `short` name is used only
in the sidebar list ("Metric Modulation", "Sticking Warmup", "Intervals" / "Chords" /
"Progressions"); search, titles, Help and everything else use `label`. `components/tools.tsx`:
`CATEGORY_ICONS` updated, new `CATEGORY_COLORS` (one fixed hue per category). Sidebar
(`components/Sidebar.tsx`): no more boxed sections — each category is a small heading you click
to fold (shows its count while folded), tools are compact rows with a `ToolTile` (the icon on a tint
of its category's color, solid on the current page); a **Recent** row (the last 3 tools opened on
this device, not the current one, shown once there are 2+); Favorites as a section with a star;
the "Tools" heading is gone. Collapsed sidebar: the icon buttons carry the category colors too.
The Help page's groups follow the new categories. The mobile app groups by the same categories
(names changed there too; it doesn't use `short` yet). Checked in nix Chromium (expanded,
collapsed, phone menu); `tsc` (web, mobile), `eslint`, `next build`.

**Category colors follow the theme:** the fixed hues clashed with some themes, so
`CATEGORY_COLORS` now points at CSS vars `--cat-0…6` (`app/globals.css`), each the theme's own
`--accent` with its hue turned by a fixed step (`oklch(from var(--accent) l max(c, 0.09) calc(h + N))`
— 0/154/308/103/257/51/206°, a chroma floor so grey-ish accents still give distinct colors). So
they take the accent's lightness and saturation: soft on Zenburn/Rosé Pine Dawn, bright on
Synthwave, and rotate along with any custom accent. Browsers without relative color syntax get the
old fixed hexes. A solid (current page) tile's icon uses `--accent-foreground`. Checked across 12
presets in nix Chromium.

**Favorites as cards:** the sidebar's Favorites section is a two-column grid of small cards
(`renderFavoriteCard` in `Sidebar.tsx`, via `CategoryBlock`'s new `renderCard`): the tool's tile
and short name on a tint of its category color (no border; a stronger tint on the current page), a
filled star in the corner to unstar it. While searching it falls back to plain rows. Checked in
nix Chromium with favorites patched in temporarily (then removed).

### Tunes and Chord Charts redesigned (2026-10-17, web)

Every Tunes / Chord Charts page now uses `components/library/ui.tsx` (`shared.tsx` is unchanged,
since Community, recordings and the Shed Log also use it):
- **`Hero`**: the header card on every page. It has a tint of the page's colour, an icon tile or a
  key badge, the title (two lines max) and a summary line, the page's buttons (they wrap under the
  title on phones), and its search (`HeroSearch`). The three main pages also show **`LibraryTabs`**
  (Tunes · Setlists · Chord Charts); sub-pages show a back link instead.
- **`KeyBadge`**: the tune's or chart's key in a tile of that key's colour. The colours come from
  `--key-0…11` in globals.css, one per key, taken from the theme accent the same way as the
  category colours. Keys a fifth apart get neighbouring hues.
- **Rows and cards:** `TuneItem` / `ChartItem` rows (badge, name, small chips) sit inside `Panel`
  cards with hairline dividers. Lists on the dashboards are `ShelfCard`s (count plus the latest
  names). Playlists are `PlaylistCard`s, with a cover in the playlist's colour (`nameColor`) showing
  its first charts. Setlists are `SetlistCard`s (tune count in the setlist's colour, its description
  or first tunes). The dashboards' "Recently opened" is now `RecentStrip` ("Jump back in").
- **Pages:**
  - Tunes dashboard: lists as shelf cards, then Tunes I Know (latest additions) and Tunes to
    Learn, with Setlists beside them.
  - Chord Charts dashboard: Import and New in the header, playlists as a card grid, "New playlist".
  - Playlist page: letter sections with sticky headers, plus an A–Z jump bar when there are more
    than 6 letters.
  - Setlists page: a card grid, with Recent / A–Z in the header.
  - Setlist page: numbered rows with the key each tune is played in; View all charts / Share /
    Post sit in a side column.
  - Tune page: the chart on the left, with keys (a progress bar, and known keys in their own
    colour) and notes on the right from `xl`; recordings under the chart.
  - Chart view: the header became a `Hero` (composer, style, time, playlists as chips). The chart
    and its container are unchanged.
  - Tune list (`TuneListManager variant="page"`): the Account tabs keep the old card look.
  - Import: numbered steps, plus side cards for what happens and "Start over".
- The chart renderer, the chart editor and the setlist chart reader are untouched. The old
  `SetlistRow` is gone.

Verified: `tsc`, `eslint`, `next build`. In nix Chromium (signed out, seeded with tunes, 50 charts
from Jack's playlist, 3 playlists and 2 setlists), every page at 1440 and 390 wide, plus Gruvbox
Dark. Also checked the Add menu, selecting a tune, a drag reorder of a setlist and chart search; no
errors.

### Sidebar: Community and Tunes as cards, no Chord Charts button (2026-10-17, web)

The row of three library tiles (Community / Tunes / Chord Charts) is now two cards side by side
under the Dashboard and Shed Log cards: Community and Tunes. Each card is a `@container`: the icon
sits above a smaller label while the card is under 7.5rem wide (the default sidebar width), and
beside it when the sidebar is wider or on phones. Each card has the category-coloured
icon tile (solid while you're there) and the name. They are slimmer than those two cards and have
no second line. Chord Charts has no button of its own: the Tunes card stays lit on `/chord-charts*`
and `/setlist-charts` (`isChartsPath` in `Sidebar.tsx`), and the collapsed sidebar's library group
does the same. Chord Charts still shows up as a search result. Checked in nix Chromium.

### Help screenshots retaken signed in (2026-10-17)

`public/help/v3/` (`SHOTS = "v3"` in `components/help/helpParts.tsx`; `v2` was deleted) holds all
the Help pictures, taken signed in to Jack's account on the **dev** deployment, so they show his real
tunes, charts, Shed Log, recordings and profile. The account's email is replaced with
"you@example.com" in the page before each shot, because the Help page is public. New shots:
`account`, `recordings` and `recorder` (their topics in `lib/helpContent.ts` gained `shot`).
How they were taken:
- the nix chromium + playwright-core setup;
- signing in through `/?auth=login` *inside the same script*, because the session didn't survive
  between separate CDP connections;
- intros and the Shed Log tour marked as seen;
- light then dark;
- 1280×800 of the content area.
Retake them into a new folder (`v4`) when the UI changes. Never write the account password into a
file: pass it in an environment variable.

### Full-width pages on desktop (2026-10-17, web)

From `lg` these pages are full width (`lg:max-w-none lg:px-8`; phones keep their max width):
- the dashboard (`Home.tsx`);
- every Tunes / Chord Charts page (`LibraryPage`, which lost its `wide` prop);
- `shared.tsx`'s `PageShell`: recordings, routines, chart view and editor, import (Community and New post opt out with `fullWidth={false}` and keep `max-w-5xl`/`max-w-4xl`, on request);
- Account (signed in);
- post pages and public profiles.

Reading pages (legal, shared setlist / routine links) stay narrow. The playlist and setlist card
grids add columns on wide screens (5–6 playlists, 3–4 setlists a row). The chart renderer keeps its
own maximum size. Checked in nix Chromium at 2000 wide, signed in: no horizontal overflow.

### Chart reading redesigned (2026-10-17, web)

New shared pieces live in `components/library/chartView.tsx`:
- `ChartPaper`: the card a chart sits on, with an optional top row. `fill` makes it fill the height.
- `ChartMeta`: chips for style, key ("Fm · from Dm" when transposed), time and tempo, plus the
  composer unless `composer={false}`.
- `ReaderBar`: the top bar for full-screen reading (round back/close button, key badge, title,
  controls).
- `RoundButton`.

The chart itself (`ChordChart`) is untouched everywhere.
- **Setlist reader** (`/setlist-charts`, `SetlistChartsPage`):
  - `ReaderBar` with the tune, "Setlist · Tune n of N" and ‹ ›.
  - A **running order** rail on desktop (`RunningOrder`: numbered, each tune's key and tempo for
    the set, played ones dimmed; click to jump; a list button hides it). On phones the list button
    opens it as a bottom sheet.
  - Each chart sits in a `ChartPaper` with its details on top.
  - Along the bottom, a segmented progress bar (click a segment to jump) and "Up next: …".
  - Tunes with no chart get a proper card.
- **Chart page** (`ChartViewPage`):
  - A compact header: round back button, key badge, title and composer, the key select (below
    `xl`), full screen, ⋮.
  - The chart in a `ChartPaper`.
  - From `xl`, a side column with a 12-key grid to transpose (key colours; a dot marks the
    original key; "Back to …"), the chart's playlists (links), and **Your tunes** that use the
    chart (links).
  - Full screen uses `ReaderBar` (minimize button, key select) and a filling `ChartPaper`.
- **Tune page**: the chord chart card is a `ChartPaper` whose top row holds the controls.

Checked signed in to Jack's dev account in nix Chromium: the reader at 1600 wide and 390 wide
(next with the arrow keys, the phone sheet), the chart page, transposing to Fm from the key grid,
full screen, the ⋮ menu, and the tune page. No errors.


### Tunes → Library in the sidebar (2026-10-18, web)

The sidebar's "Tunes" card is now **Library** (new `LibraryIcon`, books on a shelf), since it leads
to tunes, setlists, chord charts and files. Only the name changed: `navLinks.ts`'s `/tunes` entry is
labelled "Library" (its description lists all four, so searching "tunes" still finds it), the
route is still `/tunes`, and the Tunes page keeps its own title and tabs. The card stays lit on
every library page (`isLibraryPath` in `Sidebar.tsx`, which replaced `isChartsPath` and adds
`/files`). Community's "Post a setlist" hint says "make one in your Library first". This was the
first step of a sidebar rethink Jack is considering (group "Your stuff" vs "Tools", one row style,
favorites shown once, the streak shown once, a sign-in card where the account features are).

### Sidebar sections: Your shed, People, Tools (2026-10-18, web)

The top of the sidebar is now grouped with headings, so it says what goes together:
- **Dashboard** on its own at the top.
- **Your shed**: the Shed Log card and the **Library** card (full width).
- **People**: **Community** and **Lessons** side by side (other musicians — the community, your
  teachers or students).
- **Tools**: favorites and the tool categories, as before.
Headings are `SectionHeading` in `Sidebar.tsx`; the cards are `renderTile`. The collapsed (icon)
sidebar has the same groups: Dashboard, Your shed (Shed Log, Library), People (Community,
Lessons), favorites, then each category. While searching there are no headings, as before.
"Your shed" was chosen from a few names (My music, Your practice, …) because it echoes sheddex
and the Shed Log. Still open from the same rethink: favorites shown once (they appear both as cards
and as starred rows), the streak shown once (Shed Log card and account row), and a sign-in card
in "Your shed"/"People" when signed out. In the ⌘K palette these four destinations are still
listed under the "Community" category (that's `navLinks.ts`'s category, unchanged).

## 2026-11-22 — The sidebar hides like Notion's

Jack wanted the sidebar's collapse button to hide it completely (the page gets the full width), with
Notion's menu button at the top left that slides the sidebar in over the page on hover; the icon
strip stays, but only by dragging the sidebar very narrow.

- The layout store (`jam-practice-sidebar`, `components/Sidebar.tsx`) has `hidden` beside `width` and
  `collapsed`. The « button in the sidebar's header (`SidebarHideButton`) and ⌘\ / Ctrl+\ hide it.
- **Hidden:** the `<aside>` turns `fixed` (top-14, bottom-2, rounded, shadow), off screen to the left
  and `inert`. A menu button (`fixed left-3 top-2.5`, desktop only) sits where the page bar starts;
  `--sidebar-toggle-room` on `<html>` makes `PageBar` and the top-left split-screen pane
  (`useAtTopLeft` in `TilingLayout.tsx`) leave room for it. Hovering the button, or the window's
  left edge (≤4px), slides the sidebar in at its full width ("peek"); it stays while the pointer is
  over it, the button or any menu, listbox or dialog (those are portaled out of it), and slides away
  300 ms after the pointer leaves them, or on Escape. In it, » (and clicking the menu button) keeps it
  open again. `useSidebarShownWidth` is 0 while hidden (the tool dock).
- **Icon strip:** dragging the edge below 150px snaps to the strip (68px); dragging out past that
  widens it again (←/→ on the handle do the same at the minimum). The strip's › button widens it.
  Hidden, the sidebar never peeks as the strip.

Verified in headless Chromium at 1440: hide → aside off screen, menu button showing, page full width;
hovering the button and the left edge brought it in, moving away took it out; clicking the button
and Ctrl+\ toggled it; dragging to 100px gave the strip, to 280px back to 280; hidden on /tunes.
No console errors. Not verified: hover feel by hand, a ⋮ menu opened while peeking, the desktop app.
