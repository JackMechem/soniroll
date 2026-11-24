<!-- Moved word for word from the old single PROJECT.md (lines 7123–7512) on 2026-10-18. Older entries give paths relative to apps/web/ (or packages/convex/ for convex/...); see docs/notes/repo-structure.md. -->

## Advanced layouts (tiling panes)

An opt-in tiling-window-manager-style arrangement for the main content area, built from a
reference screenshot (an old project of Jack's own — "put a button on the top right of every page
that opens the tool search menu for splitting or tiling the window... options to tile down or
right... resize the windows by clicking and dragging the edges... URL [should] correspond to
[the active pane]... disabled by default... option in the bottom of the sidebar"). Off by default
(`lib/useTilingLayout.ts`'s `enabled: false`), toggled from a new button at the bottom of both
sidebar footers (desktop and mobile), right under Theme.

**Data model** (`lib/tilingLayout.ts`, pure functions, no React) — a `PaneTree` is a binary tree:
a `PaneLeaf` (`{ id, href }`) shows one tool; a `PaneSplit` holds exactly two children, a
`direction` (`"row"` = tile right, `"col"` = tile down — deliberately only those two, matching the
request, which never asked for up/left), and a `[number, number]` `sizes` pair summing to 100.
`splitLeaf`/`removePane`/`resizeSplit`/`collectLeaves` are the whole API; `removePane` collapses a
closed leaf's parent split into just the surviving sibling (standard tiling-WM "close window"
behavior), returning `null` only when the closed leaf was the tree's only one.

**Why panes can't just be Next.js pages.** Next's App Router can only ever resolve and render one
route's page per request — there's no built-in way to have several different routes' pages
mounted simultaneously side by side. `lib/toolRegistry.tsx`'s `TOOL_COMPONENTS` sidesteps this: a
hand-written `href -> next/dynamic(() => import(...))` map (hand-written, not derived from
`NAV_LINKS` automatically, since `next/dynamic`'s `import()` needs a static, literal path for
webpack/Next to code-split correctly — it can't be built from a variable). `TILEABLE_LINKS` is
`NAV_LINKS` filtered down to just the hrefs in that map — deliberately every real tool and nothing
else (not `/account`, `/community`, or the legal pages), per an explicit scoping call. Every pane,
including the one whose href happens to match the real current URL, renders its tool directly from
this registry — `TilingLayout` never reads `children` at all while active (see `AppShell.tsx`,
below). This does mean Next still resolves/renders the Server Component tree for whatever route
`router.replace` lands on, even though the result is thrown away — an accepted, minor waste for an
opt-in "advanced" feature, not a bug.

**URL sync** ("whatever window is currently active, make the url correspond to it... so when
copied and shared it opens that tool") — `TilingLayout.tsx` tracks one `activePaneId`; focusing a
pane (clicking anywhere inside it, via `onPointerDownCapture` so it fires regardless of what the
mounted tool's own event handlers do internally), splitting (the new pane becomes active), or
closing (falls back to the first remaining leaf if the previously-active one was the one just
closed) all call `router.replace(href, { scroll: false })` — `replace`, never `push`, so tiling
around doesn't flood the back button with history entries, and only when the href actually
*changes* (an explicit guard in `focusPane`), so clicking around inside an already-active pane's
own UI doesn't spam the router on every click. A copied link only ever restores that **one** tool
normally — never the saved tiled arrangement itself, which is deliberately not encoded in the URL
at all, just this browser's own `localStorage` (same category as the sidebar's width/theme — a
device preference, not account data, so it isn't synced).

**Persistence** (confirmed with Jack before building it, over resetting each page load) —
`lib/useTilingLayout.ts` is the exact same module-level-cache + listener-`Set` +
`useSyncExternalStore` pattern `components/Sidebar.tsx`'s own width/collapsed store already uses,
under its own `jam-practice-tiling` key. The tree is seeded (a single leaf showing wherever you
currently are, not some fixed default tool) the first time `TilingLayout` ever mounts with no tree
yet — i.e. the first time "Advanced layouts" is turned on, or after `localStorage` is cleared.

**Resizing** — `SplitContainer`'s divider is the same drag mechanics as `Sidebar.tsx`'s own resize
handle (`setPointerCapture`, an absolute pointer-position-to-size mapping recomputed on every
`pointermove` rather than a drag-origin delta), just computing a percentage of the split
container's own box instead of an absolute pixel width, clamped to 20–80% so neither side can be
dragged to nothing.

**The split picker** (`SplitPicker`, reached via a small button fixed to each pane's own top-right
corner — "put a button on the top right of every page," read as *every pane*, the way a real
tiling WM gives every individual window its own controls, not one single global button) is a
portaled, `getBoundingClientRect`-positioned popover — the exact anchoring technique
`components/Select.tsx` already uses, extended with a search box (reusing `tools.tsx`'s own
`filterLinks`, narrowed to `TILEABLE_LINKS`); the direction is already fixed by which edge button
opened it, so picking a tool immediately performs that split (superseded below — see "four direct
follow-ups" for how this moved from one corner button + a direction choice to four edge buttons).

**Mobile is now disabled outright, not a graceful fallback** (superseding the original
single-pane-fallback design described above — see "four direct follow-ups" below).

**Verified in a real browser** (the nix-chromium + `playwright-core`-over-CDP setup — see this
file's own Home-page bullet above for how that works): enabling the toggle, splitting right and
down, dragging the resize divider, clicking to refocus a different pane (confirmed the URL
actually changes), closing a pane (confirmed it collapses into its sibling and the close button
itself disappears once only one pane is left — a real bug caught this way: the close button
initially showed, and did nothing, even on a single un-split pane, since `canClose` was hardcoded
`true` for every leaf regardless of how many there were; fixed by threading a real
`collectLeaves(tree).length > 1` check down through `PaneNode`), reloading the page (confirmed the
whole tree, not just `enabled`, survives via `localStorage`), and turning "Advanced layouts" back
off (confirmed it cleanly reverts to the plain single-page view with zero leftover tiling UI) — all
checked directly, not assumed, with zero console errors throughout. `tsc`, `eslint`, and
`next build` all pass. **Not verified**: how well any given tool's own internal layout actually
holds up once squeezed into a narrow pane (the Tuner's own right-hand reference-pitch column, in
particular, visibly needed to horizontal-scroll inside a ~580px-wide pane during testing) — no
tool in this app was built with "might be rendered at less than its own natural width" in mind,
and making every one of them gracefully reflow that far down is its own, separate, unstarted
project, not something this feature attempted to fix. Also not verified: real touch/mobile drag
behavior on an actual phone (only checked via a simulated viewport width, which exercises the
`useIsDesktop` fallback path but not genuine touch input), and whether running the same
audio-heavy tool (e.g. two Metronomes) in two panes simultaneously behaves sensibly — `lib/
metronome.ts`'s `getAudioContext()` is a module-level singleton shared by every mounted instance
(the one `AudioContext` an audio-heavy app like this one is *supposed* to have per tab, not a
bug), so this should work, but it's never actually been tried with two real click engines running
at once.

**Four direct follow-ups, all from one round of feedback** ("you got the right idea, let's fix
some things"), landed on top of the design above:

1. **"Completely disable this feature on mobile, don't show the option in the menu."** The
   `useIsDesktop()` check moved from inside `TilingLayout` (where it used to fall back to a
   single-pane view) to `AppShell.tsx` itself, which now gates mounting `TilingLayout` at all on
   `enabled && isDesktop` — so even `enabled: true` left over in `localStorage` from an earlier
   desktop session renders as the plain, untiled page on a phone, not a degraded tiling view.
   `AdvancedLayoutsButton` itself is now only ever mounted in the desktop `<aside>` footer; the
   mobile menu's own footer lost its copy of the button entirely (it used to be there too). The
   `large` prop `AdvancedLayoutsButton` used to take for the mobile context is gone along with that
   call site, since the button is desktop-only now.
2. **"Instead of the button in the top right of every tool, put a little button in the middle of
   every side of the page/tool."** `Pane`'s single top-right split button became four small,
   hover-revealed buttons (`opacity-0 group-hover:opacity-100`, the same reveal-on-hover
   convention the sidebar's own favorite star already uses), one centered on each edge — which
   also means splits genuinely support all four directions now (up/down/left/right), not just the
   original two (right/down). `lib/tilingLayout.ts`'s `splitLeaf` signature changed from a
   `"row"|"col"` direction to a `PaneEdge` (`"up"|"down"|"left"|"right"`), deriving both the
   `"row"|"col"` direction *and* which child the new pane becomes (first or second) from which
   edge was clicked — "left"/"up" put the new pane before the existing one, "right"/"down" put it
   after. `SplitPicker` simplified to match: no more two icon buttons per result row (direction was
   already fixed by which edge button opened it), just one click per tool. One real React-Compiler
   lint catch fixing this: the original design read a ref (`buttonRefs.current[edge]`) *during
   render* to build the popover's anchor prop, which `react-hooks/refs` correctly rejects ("Cannot
   access ref value during render") — fixed by capturing the actual clicked button element
   straight from the click event (`e.currentTarget`) into a bit of state instead, so `SplitPicker`
   now takes a plain `anchor: HTMLElement`, not a ref object, and nothing reads a ref outside an
   effect/handler anymore.
3. **"For whatever window is active, the sidebar should reflect it, and I should be able to change
   the current active window's tool by clicking a nav link in the sidebar or by searching by
   pressing '/'."** The sidebar reflecting the active pane already worked (the active pane's href
   was always mirrored into the real URL via `router.replace`, which is what drives
   `NavItems`' own `pathname === href` highlighting) — what didn't work was the reverse direction.
   Clicking a sidebar `<Link>` or picking a `/`-palette result navigates through the *real* Next.js
   router, which `AppShell` completely ignores while tiling is active (see this section's own
   explanation above for why there's no way around that) — so before this fix, clicking a nav link
   silently changed the URL and did nothing visible at all. `TilingLayout` now has a second effect
   watching `pathname`: whenever it drifts from the active pane's own href, that's by definition an
   outside navigation (its own `router.replace` calls always leave the two in sync immediately
   after), so it retargets the active pane to the new href via the new `updateLeafHref` helper in
   `lib/tilingLayout.ts`. No feedback loop, since the effect is a no-op the instant the URL and the
   active pane's href agree — which is always true right after this component's own navigation
   calls.
4. **"When I initially turned the feature on, the tool I was using stopped displaying and there was
   text saying 'unknown tool'."** A real, reproduced-and-fixed bug: `TilingLayout`'s own
   tree-seeding effect only ever fires when there's *no* saved tree at all, so turning "Advanced
   layouts" back on after having used (and left) it earlier silently resumed whatever tree was
   last saved — the wrong tool, or "unknown tool" if that stale tree's href somehow no longer
   matched anything. Fixed at the source: `AdvancedLayoutsButton`'s own click handler now resets
   the tree explicitly, synchronously, at the exact moment "Advanced layouts" is turned on —
   reading `usePathname()` right there and seeding a single fresh pane from wherever you currently
   are (falling back to `TILEABLE_LINKS[0]` if you happen to enable it from a page that isn't a
   tool at all, e.g. the home page), so every time you turn it on you get exactly the page you're
   looking at, never a resurrected old arrangement. `TilingLayout`'s own seeding effect is now just
   a fallback for the rare case this didn't already run first. The "unknown tool" message itself
   also got friendlier wording (acknowledging a tool can still go missing from a stale saved tree
   if `TOOL_COMPONENTS` itself ever loses an entry later) instead of being purely a dead end.

Verified with the same nix-chromium setup, working against the actual dev server this time (not
just synthetic scripts): enabling while actively on a real tool confirmed it keeps displaying, not
"unknown tool"; splitting right via the new edge button confirmed the URL and pane both update
correctly; disabling, navigating to a different tool normally, then re-enabling confirmed a fresh
single pane seeded from wherever you'd navigated to (not the old stale multi-pane arrangement — 0
close buttons present, proving it was genuinely a single fresh pane); clicking a sidebar nav link
while two panes were open confirmed only the *active* pane retargeted, the other left untouched;
pressing `/` and picking a search result confirmed the same; and loading the app at a phone
viewport with `enabled: true` already in `localStorage` confirmed the plain untiled page renders
regardless, with zero tiling UI present and "Advanced layouts" absent from the opened mobile menu
(a `getByText` match was still found in the DOM at that viewport, but confirmed via
`offsetParent !== null` to be the *desktop* sidebar's own copy — present but genuinely
`display: none`-hidden under the `hidden lg:flex` class at that width, not actually shown). One
pure test-environment artifact hit and resolved along the way, not an app bug: this headless
Chromium build still reports no hover capability at all (see this file's own Home-page bullet,
"Caveat found 2026-10-03"), so `group-hover`-gated edge buttons can't be visually hover-triggered
here, but they're still reachable and clickable via Playwright locators regardless of their
`opacity-0` state, which is what every edge-button check above actually exercised. `tsc`, `eslint`,
and `next build` all pass. **Not verified**: how the four hover-revealed edge buttons actually look
and feel to discover and click with a real mouse, since this sandbox still can't trigger `:hover`
to see them appear.

**Three more direct follow-ups, reported together**, after Jack actually clicked through the four
rounds above for the first time:

1. **"The right arrow is messed up"** (with a screenshot) — a real, confirmed-by-reading-the-path
   bug: `EdgeIcon`'s `"right"` SVG path was `"M5 12h14M19 12l-5-5M19 12l5 5"` — the second diagonal
   stroke (`l5 5`, a *relative* lineto) moved forward from the arrow's own tip instead of mirroring
   the first one backward, landing at `(24,17)`, just outside the 24×24 viewBox, instead of
   `(14,17)` — the same place `"up"`/`"down"`/`"left"`'s own (correct) arrowheads converge their
   two diagonals. One flipped sign (`l5 5` → `l-5 5`) fixed it; `"up"`/`"down"`/`"left"` were
   already correct (re-derived and checked by hand against the same pattern, not just assumed
   innocent because they weren't the one named).
2. **"When I click one of those I want the same search menu that shows when I press / ... to
   open."** The bespoke `SplitPicker` popover (its own small search box + results list, described
   in this section's earlier rounds above) is gone outright — an edge button now opens the *exact*
   `CommandPalette.tsx` every other search in this app already uses. `lib/useTilingLayout.ts`
   gained `pendingSplit: { paneId, edge } | null` (deliberately **not** persisted to
   `localStorage` — stripped out in `write()` before serializing, since a half-finished split
   request has no business surviving a reload) plus three functions: `requestSplit` (what an edge
   button calls — records the pending request, then `TilingLayout` dispatches
   `OPEN_PALETTE_EVENT` itself), `clearPendingSplit`, and `applyPendingSplit(href)` (what
   `CommandPalette.tsx`'s own `go()` now calls first on every pick — performs the split and
   returns `true` if there was a pending request, leaving `go()` to fall back to its own ordinary
   `router.push` only when there wasn't). This does make `CommandPalette.tsx` — previously a
   fully tiling-*unaware* component — lightly coupled to the tiling feature, but through exactly
   one conditional branch in `go()`, not logic spread across the file; the palette also swaps its
   placeholder to "Pick a tool to tile…" while a request is pending, and the palette's own `close()`
   now clears any pending request unconditionally (a pick already clears it itself, so this only
   actually matters for "opened an edge button's picker, then hit Escape instead" — otherwise a
   stale pending request could silently hijack the *next*, unrelated `/` search). A real lint catch
   along the way: the original `SplitPicker` design read a ref (`buttonRefs.current[edge]`) *during
   render* to build its anchor prop, which `react-hooks/refs` correctly flags ("Cannot access ref
   value during render") — moot now that `SplitPicker` is gone entirely, but worth remembering as
   the reason the edge buttons capture `e.currentTarget` from the click event itself rather than a
   ref if anything like this gets built again.
3. **"I also want all pages including community and account page to work."** `TOOL_COMPONENTS`
   (`lib/toolRegistry.tsx`) only ever covered the ~13 actual *tools* before this (an explicit
   scoping call from when this feature was first built) — meaning navigating to `/community` or
   `/account` while tiling was active hit the pane's own "this tool isn't available anymore"
   fallback, since neither had a registered component. Fixed by adding `"/"` (`Home`), `/community`
   (`Community`), and `/account` (`AccountPage`) to the registry — straightforward, since all three
   already follow the same "a page.tsx that just returns one component" shape every other
   registered tool does. `/privacy`, `/terms`, and `/credits` are still *not* registered, and
   documented as such directly in `toolRegistry.tsx` now — those three are the one different shape
   in this app (their content is written directly inline in their own `app/*/page.tsx` file, not a
   separate importable component at all), so registering them would mean first extracting that
   content into real components, a bigger change this round didn't attempt for three static prose
   pages unlikely to be tiled next to a practice tool anyway; visiting one while tiling is active
   still falls back to the same "not available" message. `TILEABLE_LINKS` (what actually populates
   the `/`-search results list, including when that same search is opened for a split) is still
   derived from `NAV_LINKS` alone, deliberately unchanged — Home and Account aren't `NAV_LINKS`
   entries and so still won't show up as *searchable*, same as Account was never globally
   searchable anywhere else in this app before now; being paneable and being searchable are
   different questions, and this request was about the former.

Verified against the real dev server with the same nix-chromium setup: the right-edge button's
icon, inspected close up (forced to `opacity: 1` + `transform: scale(4)` via an injected style tag,
since this headless build still can't trigger real `:hover` to reveal it — see this file's own
earlier caveat on that), is now a clean, symmetric arrow, matching the already-correct
up/down/left ones checked the same way; clicking an edge button opens a real `role="dialog"
aria-label="Search tools"` palette (not a custom popover) showing the "Pick a tool to tile…"
placeholder, and picking a result (Community, in the actual check) correctly splits the pane and
updates the URL to `/community`, with Community's own real UI rendering inside; and navigating
directly to `/account` while tiling is active now renders the real Account page (confirmed
correctly showing its signed-out empty state, not "unknown tool"). `tsc`, `eslint`, and
`next build` all pass, with zero console errors across every check. **Not verified**: whether
`/privacy`/`/terms`/`/credits` not being tileable actually reads as expected/acceptable rather than
as a surprise gap, and — the same running caveat every round of this feature has had — how any of
this genuinely looks and feels with a real mouse and real `:hover`.

**Two more direct follow-ups, reported together with a screenshot** ("the community and account
page have a little border they shouldn't have. also the search menu doesn't always open the tool
that I click on, uit seems to open a different tool than the one i select, this is a bug with
every instance of it"):

1. **The border.** Compared screenshots of Community and Metronome, each tiled as a lone,
   un-split pane — both showed the exact same subtle `ring-1 ring-inset ring-accent/40` outline,
   confirming this was never actually page-specific, just only noticed on whichever page happened
   to be open alone at the time. Root cause: `Pane`'s active-ring styling was gated on `active`
   alone (`active ? "ring-1 ring-inset ring-accent/40" : ""`), and a single, un-split pane is
   *trivially* always "active" — there's nothing else in the tree for it to not be the active one
   relative to — so the ring was unconditional whenever "Advanced layouts" was on at all, reading
   as an unwanted border rather than a useful indicator. Fixed by gating on `active && canClose`
   instead — `canClose` already means "more than one pane exists" (it's the same check that shows
   or hides each pane's own close button), so it doubles as "there's actually something to
   distinguish this pane *from*," which is the only time the ring means anything.
2. **The palette bug** — a real, pre-existing defect, not something introduced by any of the
   rounds above (it was simply exercised, and so noticed, more often once edge buttons started
   reusing the real palette). `Palette`'s `go(index)` indexed into `results` (`filterLinks(query)`'s
   flat return, in `NAV_LINKS`' own declaration order), but the `index` actually passed to `go()`
   on each row's `onClick` was assigned while iterating `groups` — `groupByCategory(results)`,
   re-sorted into `CATEGORIES`' *display* order (`["Community", "Timing & Tuning", "Ear Training",
   "Practice", "Audio"]`), which does not match `NAV_LINKS`' declaration order. Concretely:
   "Community" is the *last* entry in `NAV_LINKS` but renders *first* on screen (its category sorts
   first), so clicking it called `go(0)`, which resolved to `results[0]` — a *different* tool
   entirely. Every row whose rendered position didn't coincidentally match its `results` position
   was affected, which in practice was almost every row. Fixed by computing
   `const ordered = groups.flatMap((g) => g.items)` once — the actual on-screen order — and
   switching every consumer of `results`/`results.length` (`go`, the `activeIndex` clamp, the
   `ArrowDown` handler, and the "No tools found" empty check) to use `ordered`/`ordered.length`
   instead.

Verified against the real dev server with the same nix-chromium setup. For the border: forced
`"advanced layouts"` on with a single-leaf tree for `/community`, `/account`, and `/metronome` in
turn and confirmed, via both a DOM query for any element with `ring` in its class and a full-page
screenshot, that none show the ring anymore (screenshot of `/community` checked by eye too, not
just the DOM query); then forced a genuine two-pane split (`/jam-practice` + `/metronome`) and
confirmed via the same DOM query that *exactly one* element carries `ring-1 ring-inset
ring-accent/40` — proving the fix narrows the ring correctly rather than just removing it outright.
For the palette bug: scripted opening the palette (via the real `/` key, from `/jam-practice`) and
clicking six different results spanning every category — Community, Chord Charts, Recorder, Tuner,
Metronome, Scale Trainer — and confirmed each one navigated to exactly the URL that tool should own
(`/community`, `/chord-charts`, `/recorder`, `/tuner`, `/metronome`, `/scale-trainer`
respectively), with zero mismatches across all six, including "Community" specifically — the exact
row the bug's own reasoning above predicts would most reliably misfire under the old code, since
it's about as far as a row's `results`-order position and its on-screen position can diverge.
`tsc`, `eslint`, and `next build` all pass, with zero console errors. (One genuine false alarm
during this verification pass, not an app bug: an early version of the two-pane-split check fed a
malformed `PaneSplit` directly into `localStorage` — `{a, b, ratio}` instead of the real shape,
`{children: [PaneTree, PaneTree], sizes: [number, number]}` — which crashed `collectLeaves` with a
real `TypeError` and `__next_error__`'d the whole page; once corrected to the actual shape from
`lib/tilingLayout.ts`, it rendered and resolved cleanly, confirming the crash was a bad test
fixture, not a reachable app bug — nothing a real user's own `requestSplit`/`splitLeaf` path could
ever produce, since that always builds a well-formed tree.) **Not verified**: the same running
caveat as every round of this feature — how the now-correctly-gated ring and the now-correct
palette picks actually feel to use with a real mouse, since this sandbox still can't trigger real
`:hover`, only confirm the underlying DOM/behavior is right.

**Three more direct follow-ups, reported together with a screenshot** ("the x is positioned badly,
should go to the left a bit (this is only an issue for windows that are tiled to the right).
community and account page still have an accent border when active, remove that. also if i have 2
windows open, do something in a window like start a metronome, go to another window, the metronome
will keep going but if i go back to the metronome it will refresh the window and the metronome will
stop, this is true for every kind of page; try to find a way to not refresh windows when switching
active windows"):

1. **The close button's position.** `right-2 top-2` sits exactly where `AppShell`'s own
   `lg:rounded-xl` outer corner curves inward — only a problem for a pane tiled at the *right* edge
   of the whole tiling area, since that's the only position where the button's corner coincides
   with that curve rather than an internal (straight) divider line between sibling panes. Fixed
   with a slightly larger inset, `right-3 top-3` — a no-op everywhere else, which has plenty of
   room either way.
2. **The accent border, again.** The previous round's fix (gating the ring on `active && canClose`)
   was behaviorally correct — it only showed once there were genuinely 2+ panes — but a screenshot
   of Community tiled with a sibling showed it still there, doing exactly what it was designed to
   do, and that still read as an unwanted border rather than a useful indicator. Rather than tune
   it a third time, the whole `ring-1 ring-inset ring-accent/40` active-pane indicator was removed
   from `Pane` outright (`components/TilingLayout.tsx`) — the sidebar already reflects which pane
   is active (see the next point), so this wasn't the only way to tell, and clearly wasn't earning
   its keep against how often it got reported as a stray border.
3. **The real bug: focusing a pane stopped its audio.** Reproduced directly with the nix-chromium
   setup: start a metronome in one pane, click to focus a sibling pane (metronome keeps running,
   confirmed), click back to refocus the metronome's own pane — the "Stop" button silently reverted
   to "Start." Root-caused with targeted instance-id tracing (a `useRef` set once per real mount,
   logged on every render) added temporarily to `AppShell`, `Pane`, and `Metronome`: `AppShell` and
   `Pane` both stayed on the *exact same* component instance throughout — proving neither of them,
   nor anything above them in the tree, ever remounted — while `Metronome`'s own instance changed
   to a fresh one, and only at the exact moment `focusPane` called `router.replace(leaf.href)` to
   keep the address bar in sync. Narrowing further (also tracing `TOOL_COMPONENTS[href]`'s own
   object identity, which stayed referentially stable throughout) isolated it precisely:
   **navigating via Next's router to a URL matching an already-mounted `TOOL_COMPONENTS` entry
   remounts that specific tool's component, wherever it's currently rendered** — regardless of
   whether the navigation's *destination* is even the pane being focused (it's keyed to the href,
   not the pane) — independent of whatever internal Next.js/Turbopack mechanism actually causes
   this (not fully traced to source, but the *trigger* was conclusively isolated: calling
   `router.replace`/`push` to that href, full stop). Fixed by eliminating the trigger rather than
   chasing the exact internal cause: `lib/useTilingLayout.ts`'s new `syncAddressBar(href)` updates
   the address bar via the raw History API (`window.history.replaceState`) instead of Next's
   router — since `TilingLayout` always renders every pane itself from `TOOL_COMPONENTS`, Next
   never actually needs to fetch or render anything for a focus/close/split, so the address-bar
   update was always purely cosmetic (for copy-paste shareability) and never needed to go through
   Next's navigation machinery at all. `focusPane`/`closePane` (`TilingLayout.tsx`) and the
   split-apply branch of `CommandPalette.tsx`'s `go()` all switched to it; `useRouter()` became
   entirely unused in `TilingLayout.tsx` as a result and was dropped.

   This surfaced two real knock-on fixes, not just the one swap:
   - **The outside-navigation sync effect** (the one that retargets the active pane's tool when a
     sidebar Link or `/` search changes the *real* URL) used to compare `active.href` against
     `pathname` on *every* render, trusting any mismatch as "an outside navigation happened." Once
     `focusPane` stopped calling `router.replace`, that stopped holding: Next's own `pathname`
     (from `usePathname()`) no longer updates in response to our own focus changes at all, so
     merely focusing a different pane (changing `activePaneId`, which the effect also depends on)
     would leave `pathname` looking "stale" relative to the newly active pane's own href, and the
     effect would misfire, overwriting that pane's href with the stale value — silently turning the
     pane you just focused into whatever tool the URL last *really* navigated to. Fixed by tracking
     the last `pathname` value this effect actually saw (`lastSeenPathnameRef`) and only reacting
     when `pathname` itself has genuinely changed since then, not merely whenever it fails to match
     the active pane — which only happens from an actual Next router transition (a Link, `/`
     search, or browser back/forward), exactly the case this effect exists to catch.
   - **The sidebar's own active-link highlighting** (`components/Sidebar.tsx`'s `NavItems`) was
     driven by `pathname === href` — which, for the identical reason above, stopped tracking pane
     focus changes once those moved off Next's router. Fixed by making it tiling-aware: while
     "Advanced layouts" is genuinely in effect (on, and desktop-sized — the same condition
     `AppShell.tsx` gates `TilingLayout` on), it reads the *active pane's own href* directly from
     `useTilingState()` instead of `pathname`; otherwise (tiling off, or on mobile where it's
     force-disabled) it falls back to plain `pathname`, unchanged from before.

   Verified against the real dev server with the nix-chromium setup, the same instance-id tracing
   methodology used to find the bug now used to confirm the fix: starting a metronome, focusing a
   sibling pane, and focusing back no longer changes the Metronome component's own instance id at
   all (previously confirmed via the same trace to always get a fresh one) — and functionally, the
   "Stop" button now stays "Stop" across a refocus instead of silently reverting to "Start."
   Separately confirmed: the sidebar now correctly re-highlights "Tuner" after focusing a Tuner pane
   (a scripted check reading which nav link currently carries the active styling, before and after
   a programmatic pane-focus click — matches "Metronome" before, "Tuner" after); no pane, single or
   tiled with a sibling, shows the removed ring/border anymore (a DOM query for any `ring-accent`/
   `ring-inset` class found only unrelated, legitimate `focus-visible:ring-accent` styling on
   existing buttons/inputs elsewhere on the page, confirmed by inspecting each match directly rather
   than trusting the count alone); and the close button's class list now reads `right-3 top-3` as
   intended. `tsc`, `eslint`, and `next build` all pass, with zero console errors throughout.
   **Not verified**: whether the close button's new inset is visually enough clearance from the
   rounded corner once actually seen (reasoned from the geometry, not measured against a render),
   and — the same standing caveat on this whole feature — how any of this feels with a real mouse,
   since this sandbox still can't trigger genuine `:hover`.


## 2026-11-18: panes lay out like phones of their own width (FB-22)

Jack's report, from the macOS desktop app with the dashboard and Rhythm Section side by side: the
right pane's × sat jammed against the window edge on top of the tool's "Log 15 min" button, and
the tool header was squashed (the "Bass idea … by Rob Moreno" credit wrapped one word per line).
Same on the website. Root cause: every page's layout uses window-width breakpoints (`sm:`, `md:`,
`lg:`), so a half-width pane still got the full desktop layout and didn't fit; and the pane's ×
was absolutely positioned over the page's top-right corner, right where tool headers keep their
buttons.

**What was built**
- **Pane-aware breakpoints, everywhere at once** (`app/globals.css`, top). Each pane is a size
  container named `pane` (`@container/pane`) and marked `data-pane`. The `sm`, `md`, `lg`, `xl`,
  `2xl`, `max-sm`, `max-md` and `max-lg` variants are redefined with `@custom-variant`: outside a
  pane they're the usual media queries (the extra `:where(:not([data-pane] *))` adds no
  specificity, and Tailwind keeps the overridden variants in their usual sort order, so normal
  pages compile to the same thing). Inside a pane, `sm:`/`md:` (and `max-sm:`/`max-md:`) follow
  the pane's width, `lg:` and up never apply and `max-lg:` always does. A new `pane:` variant
  targets anything in a pane.
- **Why `lg` is off in panes rather than pane-sized:** in this app `lg` is where the phone top bar
  becomes the sidebar, and pages use `lg:` mostly for that chrome — `pt-[…+4.5rem] lg:pt-8`
  (room for the phone top bar), `hidden lg:flex` desktop header bars, `lg:hidden` sticky phone
  bars at `top-[…+3.5rem]`. A pane gets a **top bar that's the phone top bar's twin** (3.5rem,
  `bg-background/90` + blur, border, the page scrolling under it — sticky inside the pane's
  scroller with `-mb-14`), holding the page's icon and name (dimmed in inactive panes) and the ×.
  So every page's phone/tablet layout fits a pane with no per-page changes, and the × can't
  collide with tool buttons and sits in the same place in every pane. Panes wider than 1024px
  (big monitors) get the tablet layout too, which reads fine.
- Options considered and dropped: converting classes page by page to `@sm:`-style container
  variants (hundreds of classes, and Tailwind's `@sm` is 24rem, not 40rem, so easy to get wrong);
  making `lg:` pane-sized too (then every page's phone-top-bar padding and phone bars show in a
  pane, under a bar that isn't there — it would need a separate "desktop chrome" variant on ~40
  pages); `contain: layout` on panes so `fixed` children stay in their pane (breaks the many
  non-portaled `fixed` dialogs and context menus, which position from viewport coordinates).
  Checked: `container-type` alone keeps `fixed` children viewport-relative in Chromium.
- **Phone-only sheets portaled to `<body>`** carry `lg:hidden`, so in a pane they never showed
  (Rhythm Section's and Syncopation's Options sheet did nothing). `lib/paneContext.ts`
  (`PaneContext`, `usePaneElement`) gives the pane's element; `OptionsSheet`
  (`bassgenius/PlayPanel.tsx`) portals into the pane and uses `absolute`, so it covers just that
  pane. Use the same for any new phone-only portaled sheet.
- `100vw` widths in pages became `100cqw` (SettingsBar's chip row, Jam Practice's empty states,
  the Metronome's and Tempo Trainer's structure editors, the Tuner's error line): `cqw` is the
  pane's width inside a pane and falls back to the small viewport width elsewhere.
- The pane scroller is now a flex column like `AppShell`'s, so pages' `flex-1` fills a pane.
- The divider keeps each pane at least 320px wide (200px tall) while there's room.
- `ToolLayout`'s header (normal desktop too): the `titleExtra` slot only takes the leftover room
  and truncates with …, so the title and the right-hand buttons never get squeezed by it (at
  1024 wide the Rhythm Section title used to truncate to "Rhythm …" and the credit wrapped).

**Gotchas**
- When writing classes: inside panes `lg:`+ is off. Don't use `lg:` for something a narrow pane
  needs; use `sm:`/`md:` or a `@container` of your own. JavaScript width checks
  (`window.innerWidth`, `matchMedia`, `useIsDesktop`) still see the window, not the pane
  (SettingChip's popover-vs-sheet, PracticeLog's first pane, NotesPage's redirect) — fine so far
  because panes only exist on desktop windows.
- `max-*` overrides are new variant names, so Tailwind sorts them last (after `dark:`); nothing
  combines them with `dark:` on the same property today.

**Verified** (headless Chromium, signed out, plus a throwaway signed-in account created and
deleted for Shed Log, Shed Notes, Lessons, Community, Account, Score Writer and Syncopation):
dashboard + Rhythm Section at 1440×900 and 1100×800, 50/50 and 35/65, light and dark; Metronome +
Slow Downer side by side and stacked; Shed Log + Tuner; Library + Metronome; no horizontal
overflow in any pane, no console errors; the × in each pane's top bar; Rhythm Section's Options
sheet opens over its pane; dragging the divider and resizing the window re-lay out the panes (the
drum notation reflows). Normal pages unchanged: pixel-identical screenshots before/after at 1440
and 390 for /metronome, /dashboard, /tunes, /shed-log (Rhythm Section differs only in its random
groove; the dashboard only in its recents list); phones never mount panes. `tsc` (web, desktop)
and `eslint` pass. **Not verified:** the macOS desktop app (WebKit; container queries and `cqw`
need Safari 16+, which the app's WebKit has, but it wasn't run), real mouse hover, and how every
other tool looks in a very narrow (320px) pane.

## 2026-11-18: keyboard shortcuts only in the active pane

Space reached both panes (Metronome + Tuner: one key press started both). `lib/paneContext.ts` now
has `keyIsForPane(pane, e)` / `usePaneKeyGuard()`: only the pane holding focus reacts, or, if no
pane has focus, the last-clicked one (`TilingLayout` marks it `data-pane-active`).
`lib/useSpaceToggle.ts` checks it, which covers the tools using Space; tools with their own key
listeners call the guard too (Find the Root Enter, Time Test R, Slow Downer B). **Any new tool
shortcut must go through it.** Outside split screen nothing changes. Also: the intro "?" goes in
a slot after the pane title (`PaneTitleSlotContext`), and tool idea credits are in the page flow,
not fixed. Verified headless with Metronome + Tuner side by side; not on a real browser window.

## 2026-11-23: split screen and the side view become one system

Jack: "the split pane thing doesnt work perfectly, some window will reset (specifically the
library) when clicking on the other pane, windows should function individually"; he wants to read a
PDF with the metronome beside it, every PDF in a side view "like clicking on a task in shed logs",
the same splits as right-clicking a tool, and a way to switch a split between side by side and
above and below — "make the split pane tiling functionality more featured and easier to use and
polished", the same everywhere.

### Why panes reset (the bug)

Two causes, both "a pane read or changed the window's address instead of its own":
- **Pages read the real URL.** The Library picks its tab from `useSearchParams()` (`?tab=files`);
  a pane only had a pathname (`leaf.href` was `/tunes`), so its tab lived only in the window's
  address. Anything that changed that address (another pane's link, the sidebar, closing a pane,
  reloading) put it back on Tunes. Same for every page with state in its query (`?id=`, `?date=`).
- **Links inside a pane went through Next's router.** Opening a tune from the Library pane
  navigated the whole window to `/tunes/tune?…`; the old outside-navigation effect then set the
  active pane's href to that, which wasn't in `TOOL_COMPONENTS`, so the pane showed "This tool isn't
  available anymore" — and any real navigation remounted the panes rendered from the route.

### What was built

- **Each pane is its own little browser.** `leaf.href` is the full address (path and query) and
  each leaf has its own Back list (`back`). Inside a pane, Next's own `usePathname`,
  `useSearchParams` and `useRouter` return the pane's: `components/panes/NextPaneContexts.tsx`
  provides Next's internal contexts (`AppRouterContext`, `PathnameContext`, `SearchParamsContext`,
  `PathParamsContext`, and in development `NavigationPromisesContext` — Next's hooks read that first
  and its own segments below spread it, so a pane gets a full set of its own; providing `null` broke
  the page with "unsupported type passed to use()"). Outside a pane it passes the outer values
  through, so the page keeps the same element tree either way. Checked that the override really
  reaches Next's hooks (same module instance under Turbopack): a Library pane at `?tab=files` shows
  Files while the window is on `/metronome`. The desktop app aliases that file to a pass-through and
  its `next/navigation` stand-in reads `PaneNavContext` (`lib/paneContext.ts`) instead.
- **Links open in their pane.** One capture-phase click listener on the document (`TilingLayout`):
  a link inside a pane (or in a menu portaled from it — the pane that last got a pointer press is
  remembered) navigates that pane; a link outside the panes (sidebar) goes to the main pane, the
  tree pane last clicked. It runs before Next's `<Link>` handler, which then sees `defaultPrevented`.
  Only while the screen is split (desktop, two or more tiled panes), plus always for links inside
  the side view. A page a pane can't show (admin, legal…) is left to Next: the window navigates and
  `routeChanged` puts it in that pane as the real page. ⌘K and the sidebar's "Open" use
  `navigateMain`; the practice timer's "open the step's tool" too (`useOpenStepTools`).
- **Panes are rendered flat** (`components/TilingLayout.tsx`): one keyed child per pane, placed
  with absolute positions computed from the tree (`layoutRects`), dividers drawn separately. So
  splitting, closing, swapping, flipping, floating or docking moves boxes around and never remounts
  anything. The real page (Next's `children`) keeps the key `"page"` whichever pane holds it
  (`pageLeafId`, worked out from the address on load), so the page you're on isn't remounted when
  the first pane opens beside it — checked with a DOM marker on the Shed Log through open, Back,
  full screen, dock, flip, swap, float and close. Other panes are ordered by id, not tree order
  (moving a node in the DOM can restart media). `AppShell` always renders `TilingLayout`; with
  nothing open it's just the page (it also does the page slide-in that `AnimatedPage` did).
- **One layout object** (`lib/tilingLayout.ts`, `Layout`, `v: 2`): `tree` (tiled panes, null = the
  plain page), `float` (the side view over the page, px width), `sideId` (where side-view things
  open: the float, or a tree pane when docked), `activePaneId`, `mainPaneId`, `maximizedId`. Saved
  under `jam-practice-tiling`. The old `{ enabled, tree, activePaneId }` is read and kept
  (`readLayout`), retired addresses mapped (`normalizePaneHref`: Bass Genius/Drum Generator,
  `/chord-charts`, `/files`, `/recordings`, `/settings`…). **Tabs later:** a tab would hold one
  `Layout` each (e.g. `{ tabs: [{ id, name, layout }], activeTab }` under a new key, with today's
  `jam-practice-tiling` as the first tab); `set()` in `useTilingLayout.ts` is the one place that
  saves, and `pageLeafId`/`routeHref` stay per window (only the active tab can hold the real page).
- **The side view is a pane** (`NotePeek.tsx` and its store are gone). Its look is still this
  device's choice (`jam-practice-note-peek`: over or beside, width): "Over the page" is the float,
  the page stays a normal desktop page under it; "Beside the page" docks it as a split at the right.
  Full screen is the pane's ⤢ (any pane: `maximizedId`, Esc restores). A note shows as
  `/shed-notes?id=…&view=note` (`NoteSidePane`: just the editor; as a page of its own it's Shed Notes
  with that note). Task and routine pages lost `inPanel`: in a pane the pane's bar has Back and the
  trail, so they hide their own `BackButton` (fixes "Back plus ×" side by side). The side view stays
  open when the page under it changes (so a PDF can stay beside whatever tool you open); on a phone
  a real navigation closes it.
- **Phones:** no split screen (a saved split shows just the page). The side view is full screen
  with a bar of Back, the trail and ⋮ (no ×: Back is the way out). Opening it pushes a history
  entry (`__paneSide`), so the phone's Back gesture closes it and stays on the Shed Log; the bar's
  Back goes back inside the view, then closes it (through `history.back()`).
- **Pane controls** (every pane, the side view included): Back (when the pane has history), the
  page's trail and "?", ⤢ full screen, ⋮, ×. ⋮ has Side by side / Above and below (flip), Swap
  places, Over the page / Beside the page (the side view) or "Float over the page" (any other
  pane), "Open another beside it… / below it…" (the ⌘K picker, `requestSplit`), "Open as a page"
  (only this pane stays — no remount; "Open in Shed Notes" for a note), and "Take off …" for an
  attached note. Dividers: drag (each side keeps 320px wide / 200px tall while there's room),
  double-click for half and half, arrow keys (Shift for bigger steps). The sidebar's right-click
  menu gained "Open in the side view". A newly opened pane gets keyboard focus; focusing a pane by
  Tab makes it active (Space etc. still go through `keyIsForPane`).
- **Closing down to one pane** leaves it showing as a plain page without remounting (a running
  metronome keeps going); if it isn't the real page it stays a lone pane (its own address, no bar)
  until the next real navigation turns it back into the plain page.
- **Which pages can be panes:** `PANE_ROUTES` in `lib/toolRegistry.tsx` (was `TOOL_COMPONENTS`):
  every tool, the dashboard, the Shed Log and its routine/task/routines/edit pages, Shed Notes and a
  note, the Library (`/tunes` with its tabs), tune/setlist/recording/list pages, chart view/edit/
  new/import/playlist, setlist charts, Community and its sub-pages, a post, a profile, Lessons and
  its pages, shared file/tune/setlist links, plus Account and Help (already there before). Not
  admin, legal, landing, sign-in. `canShowInPane(href)` asks.
- `BackgroundToolDock` hides a tool's card while any pane shows it (it only checked the URL); the
  sidebar highlights the main pane's page; `goBackOr` asks the pane's own history in a pane
  (`markPaneBack`). `PdfEditor` (and Play mode) cover just their pane when opened inside one.

### The API (for opening things beside)

```ts
import { openBeside } from "@/lib/useTilingLayout";
openBeside("/shed-log/task?routine=r&task=t");          // the side view (the default)
openBeside("/metronome", { mode: "right" });             // split: side by side ("down": above and below)
openBeside(href, { from: usePaneId(), detach });         // from a pane; detach = a "Take off …" menu item
```
- Returns false (and does nothing) when a pane can't show the page — open it as a page then.
- Side mode: if a side view is open it goes there (Back returns to what it showed), else a new one
  over/beside the page by this device's choice. Phones: always the side view.
- An edge mode splits the pane given as `from`, else the main pane.
- Other calls: `navigatePane`, `navigateMain`, `closePane`, `toggleMaximize`, `flipPane`,
  `swapPane`, `floatPane`, `dockFloat`, `keepOnlyPane`, `canShowInPane`, `usePaneId()`.

**For the PDF agent:** `PdfEditor` already fills just its pane when it's inside one. What's missing
is an address for "one of my files": add a route (e.g. `app/files/view/page.tsx`, `?id=<fileId>`,
rendering the file viewer / `PdfEditor` filling the page; no page there today), add it to
`PANE_ROUTES` and the desktop's `routes.tsx`, then in `useFileActions` open PDFs with
`openBeside(fileViewHref(id))` (falling back to today's behaviour when it returns false). From a
task page, files attached to it can open beside the page the same way.

### Decisions

- Panes render pages from `PANE_ROUTES` rather than Next routes (still no way to mount several
  App Router routes at once); Next's contexts are overridden instead of rewriting pages to use our
  own hooks, so every existing page works in a pane unchanged.
- The side view doesn't close when the page under it changes (it did): Jack wants it to stay while
  he uses tools. Phones still close it on a real navigation.
- With only the side view over the page, the page isn't a "pane" (no bar, desktop layout, its
  links navigate as usual); split-screen link handling starts at two tiled panes.
- A real navigation while split (browser Back/Forward, a page a pane can't show) goes into the
  active tree pane as the real page; the pane that held the real page before re-renders from
  `PANE_ROUTES` (one remount, only in that case).
- Opening an address directly (typed, a link from outside) with a saved split puts that page in the
  main pane instead of ignoring it.

### Verified (headless Chromium against the dev server, 1440 and 390, light and dark)

Library pane at `?tab=files` keeps its tab (and scroll) while clicking the other pane; a tune opened
in the Library pane shows in the pane (scroll kept at 300 after clicking the other pane); pane Back;
a registry pane's `useSearchParams` reads its own address while the window is elsewhere; old saved
layout format; reload with the address of the active pane and with another address. Signed in
(the shared `uxpass` test account, no data created): Shed Log routine name → side view over the
page (the Shed Log's DOM node unchanged), task inside it, Back, full screen + Esc, Beside the page,
flip, swap, Over the page, close — address bar following each; sidebar link with the side view
open (Shed Log → Metronome, side view stays); a note in the side view beside the Metronome. Phone
(390): full-screen side view with Back/trail/⋮, no overflow, Back inside it, the browser Back
closing it on `/shed-log`, the bar's Back closing it. Signed out: right-click → side by side and
above and below, Metronome started, sidebar link to the main pane, ⌘K split from a pane's menu,
closing panes one by one down to the plain page — still running, and Space in another pane didn't
stop it; closing the Library pane leaving the Metronome as a lone pane, then a sidebar link back to
a plain page. Divider keys, double-click and drag (stops at 320px). `tsc` (web, desktop) and
`eslint` on every changed file; no console errors in any run.

**Not verified:** the desktop app running (only `tsc`; its router now ignores `__pane`
replaceStates); a real phone's Back gesture (the browser's Back stood in for it); hover looks with a
real mouse; `pnpm build` (the `next/dist/shared/lib/*.shared-runtime` imports are the risk — they
resolved under Turbopack dev); audio by ear (the Metronome engine outlives its component, so
"still running" was also checked with DOM markers for the Shed Log, not for the Metronome);
PDFs in a pane; the chart editor's leave guard in a pane (the pane's link handler runs before it);
pages that write their own query with `history.replaceState` (Shed Notes, Help, Score Writer) don't
update their pane's saved address.

**Incident:** my `git rm` of `NotePeek.tsx` was staged while another agent committed (`dc6b519`,
"Website: UI pass 3 fixes"), so that commit deletes `NotePeek.tsx` while its `AppShell` still
imports it — the tree only builds again once this work is committed. Use plain `rm` while others
share the working tree.

## 2026-11-23: tabs (each a view of its own)

Jack: "another thing id like, if you could add tabs that are essentially different views (that
save to the browser or account) that would be pretty cool" — after the split-screen rework above.

### What was built

- **A tab is one `Layout`.** `lib/useTabs.ts` keeps the list; only the active tab is on screen, as
  the live layout in `useTilingLayout.ts`. Switching copies the screen into the tab you leave and
  puts the other tab's layout on screen with `showTabLayout(saved, href)` (new in
  `useTilingLayout.ts`). On a desktop its panes render from `PANE_ROUTES` (the real page only where
  a pane already shows the window's address) and the address bar follows the tab's active pane by
  `syncAddressBar`, so a switch never goes through Next's router. Phones show only the main pane
  (as the real page), so there a switch is a `router.replace` (`setTabNavigator`, from `TabsSync`);
  so is a lone tab page a pane can't show (admin, legal).
- **Desktop strip** (`components/tabs/TabStrip.tsx`, at the top of the content area, from `lg`):
  only once there are two or more tabs. The surface colour of the sidebar; the active tab is the
  page's background colour and joins the page below it. Each tab: its main pane's page icon (tool
  category colour) and name (`tabTitle` in `components/pageNames.ts`, the phone top bar's naming
  moved out of `Sidebar.tsx`), "+N" when it holds more panes, × (always on the active tab, on
  hover for the others), middle click closes. Click switches, double-click renames in place
  (Enter/click away keeps, Esc doesn't, empty = back to the page's name), right-click: Rename,
  Duplicate, Close other tabs, Close tab. Drag to reorder (HTML drag and drop, an accent bar where
  it lands). + after the tabs and a double-click on the empty strip open a new tab; ⋮ at the end
  has New tab / Rename / Duplicate / Close other tabs / Close this tab. More tabs than fit: the
  tabs shrink to 7.5rem, then scroll (no scrollbar), keeping the active one in view.
- **New tab opens the dashboard.** Where to find it before the strip shows: the sidebar's ⋮ (both
  the full and the icon-strip sidebar), ⌘K ("new tab"; typing a tab's name or "tab" also lists the
  other tabs to switch to), a page's right-click menu in the sidebar ("Open in a new tab", that
  page) and a pane's ⋮ ("Open in a new tab", that pane's page — a note in the side view opens as
  Shed Notes). Up to 12 tabs (`MAX_TABS`).
- **Phones:** no strip. A count (a rounded square with the number, like a browser's) in the top
  bar once there are two or more tabs, and "Tabs" in the menu's ⋮; both open a sheet listing the
  tabs (tap to switch, ⋮ Rename/Duplicate, ×) with a New tab button (`components/tabs/PhoneTabs.tsx`).
- **Keyboard:** Ctrl+Alt (⌘⌥ on a Mac) + 1–8 for that tab, 9 for the last, [ and ] for the one
  before/after (`e.code`, since Alt changes `e.key` on a Mac). Not while typing (inputs,
  contenteditable, CodeMirror). Tooltips on the tabs show them. None of these is a browser
  shortcut (Ctrl/⌘+number and ⌘⌥←/→ are the browser's own).
- **Unsaved work:** switching, closing or opening a tab swaps the page out without a link, so
  `useLeaveGuard` now also registers in `lib/leaveGuards.ts` and tabs call `confirmLeave(go)`: the
  page's own "Leave without saving?" dialog asks first (checked with a new chord chart).
- `panesActive()` is now also true for a **lone pane that isn't the real page** (a tab's page
  after a switch): links and the sidebar go into that pane. Without it a sidebar link to the page
  Next's router still had underneath did nothing (same URL, no `routeChanged`).
- `routeChanged` now notifies listeners when nothing is split too (tabs keep the active tab's
  address in step).
- `cloneLayout` (`lib/tilingLayout.ts`) gives a duplicated tab new pane ids (panes are keyed by id).

### Saving (the shape and keys)

- `jam-practice-tabs`, through `useSyncedSettings` with the module-level `TABS_DEFAULTS`
  (`components/tabs/TabsSync.tsx`): signed in it's a `syncedSettings` row in the account, signed
  out it's this browser's localStorage. No merge between them; signing in or out switches lists.
  The phone app doesn't read it.
- Shape: `{ tabs: SavedTab[] }`, `SavedTab = { id, name?, href, layout? }`: `href` is the tab's
  address (its active pane's, or its one page); `layout` (the `Layout`, `v: 2`) only when it holds
  more than one pane (a split or the side view); `name` only once renamed. Page addresses and pane
  layouts only, no page contents; Back lists are kept (≤20 per pane, as before).
- **One tab saves nothing** (`tabs: []`): the screen is the one tab, kept on this device in
  `jam-practice-tiling` as before. So today's saved layout simply becomes the first tab when a
  second one opens (no migration step, nothing lost), and people who never open a tab cost the
  account nothing. Closing down to one tab writes `[]` again.
- `jam-practice-tiling` still holds the screen (the active tab) on this device, so a reload draws
  it at once; signed in, the account's copy of that tab is applied if it differs once it loads.
- Which tab is open is per device and per store: `jam-practice-active-tab` =
  `{ account?: id, local?: id }`. Two devices can be on different tabs.
- Writes are the synced store's (debounced 600 ms, flushed on page hide); every layout change
  of the active tab rewrites the list, so with tabs open there's one account write per pause in
  using the panes.

### Decisions

- **Inactive tabs unmount** (cheaper, no hidden pages listening to keys or holding Convex
  subscriptions, and only the active tab can hold Next's real page anyway). Tools with an engine
  of their own keep playing: the Metronome, Metric Modulation and the Tuner — they show in the
  background dock as when you leave their page (checked: Metronome started in tab 1, switched to
  tab 2, the dock's Metronome card with Stop showed). Everything else stops on a switch, as when
  you go to another page (Rhythm Section, Slow Downer, Jam Practice, a recording — the Recorder's
  leave guard asks first).
- **Another device's tabs:** the tab on screen is this device's — a change to it from elsewhere
  is ignored here (the next change here writes over it); other tabs, new and closed tabs show
  straight away. A device whose tab isn't in the list (new to these tabs, or its tab was closed
  elsewhere) joins the tab already showing its page, else its screen becomes a new tab at the
  end (`join`): opening soniroll somewhere new never changes a tab set up elsewhere. The cost: a
  first sign-in on a new device (landing on the dashboard) adds a Dashboard tab if no tab shows it.
- Duplicate stays on the tab you're on (switching would remount what's showing).
- New tab (+, ⌘K) goes at the end; "Open in a new tab" right after the current tab.
- No "always show the strip" setting: the strip appears at two tabs, and New tab is in four other
  places. With the strip showing, the page bar under it needs no room for the hidden sidebar's
  menu button (`AppShell` sets `--sidebar-toggle-room` to 0 under the strip).

### Verified (headless Chromium against the dev server)

Signed out, 1440: New tab from the sidebar ⋮ (address /dashboard), switching by click and by
Ctrl+Alt+1 / ] / 9, Metronome still running in the background dock after a switch, rename by
double-click, reload (tabs, names, active tab, address kept), a page's "Open in a new tab", a split
inside tab 2 kept through switching away and back and a reload, drag to reorder, a sidebar link in
a lone-pane tab (goes into it), closing the active tab, "Close other tabs" from the right-click
menu down to one tab (`tabs: []` saved, the strip gone, the split left on screen), a pane's ⋮
"Open in a new tab", ⌘K "new tab" and listing tabs, the chart editor's leave dialog on a switch
(Cancel stays, Leave switches), 12 tabs at 1100 wide (+ disabled, no page overflow, active in view),
the hidden sidebar's menu button beside the strip; light and dark. Phone (390, dark, signed out):
"Tabs" in the menu's ⋮, the sheet, New tab, the count in the top bar, switching (a real
navigation), no horizontal overflow. Signed in (the shared `uxpass` account): tabs with a split
saved to the account and back after a reload; a second browser context (another device) opened at
`/tuner` joined the tab showing the Tuner and switched between both; a phone context listed them,
switched and closed them; a second window of the same context saw the same list. Cleaned up after:
the account's `jam-practice-tabs` is `{"tabs":[]}` (the row stays). `tsc` (web, desktop), `eslint`
on every changed file; no console errors in any run.

**Not verified:** two devices open at the same moment (live updates arriving while you work — code
only); hover looks (the × on inactive tabs, hover fills); a real mouse drag (Playwright's
`dragTo`); the desktop app running (only `tsc`; its router shim has `replace`); audio by ear; a
window resized from desktop to phone width while a tab shows a lone pane (the phone layout then
shows Next's page underneath, the address bar the pane's — an old edge case of lone panes, more
likely with tabs); `pnpm build`.

**Note for other agents:** while testing, the shared `uxpass` account briefly had tabs, so another
agent's signed-in page could have shown a tab strip (its screen becoming a tab). It's back to one
tab. The privacy line about open tabs went in with the Files commit (`7a06059`), ahead of this
code.

## 2026-11-23: review fixes (side view, panes, tabs)

A review of today's split screen, side view and tabs found things covering each other. What changed:

- **The side view opens beside the page by default** (`DEFAULT_SIDE_PREFS.mode = "push"`): over the
  page it hid the Metronome's controls under a PDF, half the "now practicing" pill, the Library's
  Upload. `jam-practice-note-peek` now carries `chosen: true` once someone picks Over/Beside in the
  side view's ⋮; a stored mode without it (the old default, saved with every width change, so a
  real choice couldn't be told apart) reads as beside. "Over the page" stays in every pane's ⋮ for
  quick peeks. Beside the page needs room: the side view keeps its width if the other panes stay
  ≥ 320px, else everything along the row is shared out evenly, else (a narrow window) it floats.
- **Things open next to where they were opened** (`openBeside`): from a pane of a split with no
  side view, the new pane goes right beside that pane (and becomes the side view); from a pane the
  floating side view covers, the float docks first; "Open side by side"/"Open beside…" from the
  floating side view docks it and splits it, so nothing lands under it (the task page's file case).
- **Even splits and a minimum** (`balanceAlong` in `tilingLayout.ts`): a new pane shares the room
  out along its line (a third pane beside two gives thirds, not 50/25/25). A new pane (and the one
  it's opened beside) must be ≥ 360px wide (`MIN_PANE_WIDTH`) or 240px tall; with no room it opens
  in a new tab instead, with a notice (`setNoRoomHandler`, registered by `useTabs`).
- **A PDF as the page** (`/files/view` not in a pane) fills the page on a desktop (`PdfEditor
  embedded`, Done goes back) instead of the full-window editor at z-70, which covered a floated
  pane and the sidebar. Phones keep the full-screen editor.
- **Browser Back while split** goes back inside the active pane only (`paneHistoryTraverse`, from a
  capture-phase `popstate` listener in `TilingLayout` that stops Next's own listener). It used to
  load the window's previous page into the focused pane (two copies of the PDF). Forward does
  nothing in a pane (direction from the Navigation API's `navigate` event; Back if it's missing).
  With nothing left in the pane's own history, Back does nothing (the browser entry is used up).
- **Phones don't rewrite tabs** (`useTabs.ts`): a phone shows one page of a tab, and used to save
  that back (dropping the other panes and turning the PDF side view into a pane). Now a phone
  never copies its screen into a tab; where it went inside a tab is remembered on the phone only
  (`phoneHrefs`). Tab actions (new, close, rename, duplicate, reorder) still save from anywhere.
- **Tab names:** a tab showing one of your files is named after the file (`useTabName`, a
  `fileFolders.item` query); `/files/view` is "File" in `pageNames.ts` (was "Page"). "+N" became a
  small split mark whose tooltip lists the pages ("3 pages: Tuner, Dashboard, Metronome"). The phone's
  tab list shows "Also in this tab:" with a button per other page (`switchTab(id, href)` shows that
  page of the tab on the phone).
- **Wording:** every pane's ⋮ has the same pair, "Beside the page" / "Over the page" (was "Float
  over the page" on some), and "Open beside…" / "Open below…"; the ⌘K picker then says "Open
  beside… (pick a tool or page)" (was "Pick a tool to tile…").
- **Close other tabs** shows "Closed N other tabs · Undo" (`lib/notice.ts` + `components/Notice.tsx`,
  a small one-at-a-time notice mounted by `AppShell`, also used for "no room").
- **Not a bug:** "Float over the page floats the wrong pane" (Dashboard | Metronome) came from the
  review script's locator — `filter({ hasText: "Tap tempo" })` matched the Dashboard pane too
  (hidden text), so it opened the Dashboard's menu. Floating from the right pane's own ⋮ floats it.

Verified in headless Chromium (dev, signed out and a throwaway `.test` account, deleted after):
the old unchosen "overlay" pref opening beside; the pane menu's wording; thirds from "Open beside…"
and a fourth pane opening in a new tab with the notice; browser Back/Forward in a split (pane Back,
no duplicate); a PDF from Files beside the Files pane, Upload uncovered; Metronome floated over the
PDF page (embedded editor, float on top, sidebar usable); a PDF from a Files pane in a split (new
pane beside it, thirds); "Open side by side" from inside the floating side view (docked, three
panes); a PDF opened from a pane the float covered (float docked, Back in it); 1440 dark three panes
with a PDF (no overflow); 390 phone PDF from Files (full-screen side view). Tabs: a desktop tab with
Metronome + PDF side view, a phone switching into it, navigating and showing the PDF through "Also
in this tab", then the desktop reloaded — the tab still had both panes; Close other tabs + Undo.
`tsc` (web, desktop), eslint on the changed files.
**Not verified:** a real phone and two devices open at the same moment; Safari/Firefox (no
Navigation API in older ones: Back is assumed); the desktop app running; hover tooltips (the split
mark's list); audio by ear.

## 2026-11-23 (evening) — Jack's follow-ups: over the page, a tab always, Back/Forward everywhere

- **The side view always opens over the page** ("it should be over the content"): a new side view
  floats over the page even in a split, and isn't docked when it would cover the pane it was opened
  from (that rule, and opening beside a pane of a split, were removed — `floatCovers` is gone).
  "Beside the page" in its ⋮ docks that one; the next opens over again.
- **The tab strip is always there on desktop** ("so there is always a tab you are working in"):
  with one tab it shows the page you're on, without × / rename / close-others (nothing is saved
  until a second tab); + and Duplicate make the second.
- **"Now practicing" moved into the tab strip's row** (right end), out of the page bar and the main
  pane's bar.
- **Back and Forward on every window's header** (`components/HistoryArrows.tsx`): the page bar
  uses the browser's history (`useBrowserHistory`: the Navigation API's canGoBack/canGoForward where
  there is one, both enabled in Safari / the desktop app's WebKit); every pane bar uses the pane's
  own history — panes now have a Forward list (`PaneLeaf.forward`, filled by Back, cleared by going
  somewhere new; browser Forward in a split goes forward in the active pane). The listener re-reads
  a tick later: Next changes the address inside an insertion effect, and updating React there gave
  "useInsertionEffect must not schedule updates".
Checked in headless Chromium (signed out, 1440): one tab in the strip, Back/Forward on a page
(Metronome → Tuner → Back → Forward), arrows in each pane bar, a side view opened in a
Tuner | Metronome split floating over it, no console errors.
