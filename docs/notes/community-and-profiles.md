<!-- Moved word for word from the old single PROJECT.md (lines 3085–3162) on 2026-10-18. Older entries give paths relative to apps/web/ (or packages/convex/ for convex/...); see docs/notes/repo-structure.md. -->

### Community, profiles, posts and account settings redesigned (2026-10-17, web)

- **Community** (`components/Community.tsx`): "New post" pill (menu: Post tunes / Post a setlist… /
  Share a routine or progress → the Shed Log's routines); one search across people (cards) and
  posts; the feed as **Latest / Following / Popular** (Following = posts by people you follow, by
  username; Popular = most liked) with kind chips **All / Tunes / Setlists / Routines / Milestones**.
  `MeCard` (banner, picture, @username, Posts / Followers / Following / Liked counts linking to the
  sub-pages, a nudge to make a private profile public → `/account?tab=profile`) sits in a right
  column from `xl` (sticky, with **People to follow** — authors in the feed you don't follow yet,
  newest first) and above the feed below that. Signed out: a hero ("See what other musicians are
  working on") with Sign up / Sign in, and people search. Post cards (`PostListItem`): bigger
  avatar, colored kind tags (setlist accent, routine green, milestone amber), the portrait milestone
  card at 17rem wide.
- **Public profile** (`PublicProfilePage.tsx`): banner card with the picture over it, @username,
  instrument chips, Posts / Followers / Following / Tunes stats, Share, Follow (or Edit profile /
  Sign in to follow); then tabs **Posts / Tunes I Know / Tunes to Learn / Ear training** (counts
  on each) instead of stacked boxes. `FollowButton` gained `size`.
- **Post page** (`PostPage.tsx`): back to Community; one card with a routine-colored top edge,
  author + date + kind tag, a big title (routine icon beside it), description, for a routine three
  stat tiles (tasks, total, schedule), an action bar (Like count, Share, Add to my Shed Log / Open
  in your Shed Log, delete as an icon), then the content (`RoutinePreview` gained `meta={false}` to
  skip its own summary line). From `lg` an author column: picture, @name, instruments, Follow,
  Profile, and **More from @name** (up to 4 posts). Signed out it says "Sign in to see this post"
  with the sign-in buttons instead of "not available".
- **Account** (`AccountPage.tsx`, `/account?tab=…` — `app/account/page.tsx` passes `initialTab`,
  the page keeps `?tab` in the address bar): a header card (banner, picture, @username, email,
  Public/Private, Password/Google, View profile, Sign out); settings grouped **You** (Profile —
  `PublicProfileEditor`), **Library** (Tunes I Know, Tunes to Learn), **Community** (Posts,
  Following), **Preferences** (**Shed Log**: the daily goal shown and changed with `GoalDialog`,
  sounds, counting tool time; **Appearance**: the 10 quick themes as swatches + the full
  `ThemeModal`), **Account** (Sign-in & security, Delete account). Phones: a settings-style list
  you tap into, with a back button. Signed out: a card with Sign up / Sign in.
Verified: `tsc`, `eslint`, `next build`; in nix Chromium signed out (Community hero, @jack's real
profile with tabs, the signed-out post page) and — with fake data patched in temporarily and then
removed — the signed-in Community feed and side column, a routine post page, and the account
page's sections, at 1440 and 390 wide with no overflow or errors. **Not verified signed in for
real** (follow counts, the Following feed, More from @name, saving settings).

**Profiles show the Shed Log (same day):** `profiles.getPublicByUsername` takes an optional
`today` (the viewer's date) and returns `practice` from the owner's `jam-practice-practice-log`
blob via `packages/core/practiceLog.ts`'s `practiceLogFrom` (defensive parse) +
`publicPracticeStats`: current and best streak, hours, hours this week, days in the last 365,
days on goal in the last 30, the last 26 weeks as levels, and the hour / streak milestones reached
— never routines, tasks or notes. A profile can opt out: `profiles.showPracticeStats` (optional,
missing = shown; "Show my Shed Log stats on my profile" in the profile editor; `upsertProfile`
takes it). The public profile page shows it as a "Shed Log" card (flame + streak, four stat
tiles, the 26-week grid, milestone badges) and has a Back button (history back, else
`/community`). Fixed: the banner's pattern layer was painted over the profile picture (the
picture now sits on `relative z-10`; same on the Community and Account banners). The privacy
policy's public-profile paragraph mentions the stats. Convex dev deployed; checked against real
dev data (@jack: 17-day streak, milestones) and in nix Chromium at 1440 and 390.

**Profile banners (same day):** `profiles.bannerPreset` (an id) / `bannerStorageId` (an uploaded
image, wins); `setBannerPreset` (also deletes an uploaded image) and `setBannerImage` (uploaded
through `generateAvatarUploadUrl`; deletes the previous file); `getMine` and
`getPublicByUsername` return `banner: {url} | {preset} | null`; account deletion deletes the file.
`apps/web/lib/banners.ts`: 12 built-in designs, pure CSS (gradients and small inline-SVG patterns:
Aurora (default), Sunset, Ocean (waveform), Forest, Midnight, Ember, Mint, Staff paper, Keys,
Vinyl, Stripes (theme accent), Sand). `components/ProfileBanner.tsx` draws one (used on the public
profile, the Account header and Community's `MeCard`); `components/BannerPicker.tsx` (Account →
Profile, under the picture): preview, the designs as swatches, "Upload your own" (cropped to 3:1,
≤1500×500 JPEG in the browser) and "Remove image". The Account header now matches the profile's
layout (name and badges under the picture, never on the banner's edge); on both, the buttons sit
below the banner (they used to touch it) and stay on one line on phones (icon-only Share / Sign
out). Mobile doesn't show banners yet. Convex dev deployed.

**Shed Log: resizable day panel (same day):** on desktop the grid is `var(--day-w) 1.5rem 1fr` with
a drag handle (a pill in the middle, `role="separator"`) between the day panel and the calendar —
drag to resize (300 px up to 60% of the page), double-click to reset (448 px), ←/→ when focused.
Saved per device in the page's view settings (`dayWidth`, key `jam-practice-practice-log-view`;
written on release, not on every move). Phones unchanged. Checked in nix Chromium: dragging both
ways, the minimum, double-click reset, the saved width.

**Sliders:** every `<input type="range">` should use the site's `slider` class with a
`--progress` style (the filled part of the track) — four newer ones were using the browser's
default look (`accent-[var(--accent)]`): the goal window, Bass Genius's Mix levels and drum
settings, and the Drum Generator's faders. Fixed.


## 2026-11-20 — UI pass 4 fixes (web)

- "1 follower", "1 post" (profile stats in `PublicProfilePage.tsx`, Community's own-profile card).
- **Following** (`FollowButton.tsx`) is a filled secondary button with a check (`aria-pressed`,
  "Unfollow" tooltip); before, it looked like plain text.
- Follow lists (`FollowLists.tsx`: `/community/following`, Account → Following) show "@name".
- New post: Unlisted's description is behind the switch's hint (`SwitchRow` `hint`), and Title and
  Description have `aria-label`s (they only had placeholders).
Checked signed in with throwaway accounts (deleted): a profile at 1 follower and the Following
state, 1440 and 390 dark.
