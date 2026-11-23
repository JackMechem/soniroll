# Support / donations (2026-10-18, web)

sheddex has no ads. Jack asked whether very unintrusive ads could pay for hosting; the advice was
no for now: at this size they'd earn a few dollars a month, they'd make the site commercial (the
Rhodes samples were CC BY-NC then — CC BY since 2026-11-22; Vercel's Hobby plan is for non-commercial use, so check its terms),
and most ad networks add tracking the privacy policy rules out. If ads ever happen: one small
tracking-free unit (Carbon Ads / EthicalAds, which have traffic minimums) or a direct sponsor line,
only on browsing pages (landing, Help), never inside a tool. Instead, donations were made much more
visible:

- **`/support`** (`components/support/SupportPage.tsx`): why (free, no ads, one person), a big
  **Buy me a coffee** button (`DONATE_URL` = buymeacoffee.com/jackmechem), "What it pays for" (the
  database and storage, the website, email, the domain — the services in the privacy policy; no
  amounts yet), and other ways to help (tell a friend via `shareLink`, send feedback, Community).
  No dollar figure is shown; Jack can add his real monthly cost later.
- **Sidebar**: a **Support sheddex** row with a heart, always visible just above the account row
  (desktop, phone menu; a heart button in the collapsed sidebar), and a "Support sheddex" item in
  each ⋮ menu (`SupportRow` in `components/support/SupportParts.tsx`).
- **Dashboard**: a **Keep sheddex free** card right under Today's practice, with Buy me a coffee and
  "Why it helps"; its × ("Not now") hides it on that device for 30 days
  (`jam-practice-support-card-hidden-until`; hidden on the server so it doesn't flash). The quiet
  note at the bottom of the dashboard stays, now with a "Why it helps" link too.
- The heart uses the theme's `--danger` (its warm red), since the category colours derived from the
  accent come out blue in the default theme.

Checked in nix Chromium (signed out): the page at 1440 and 390 (no overflow), the sidebar row
(desktop, phone menu), the dashboard card in light and dark, and "Not now" hiding it across a
reload. Not done: a donation link on the Account page, and showing real hosting costs.

Note for later: the landing page's quote says "There will never be ads, popups or paywalls."
That's still true of the tools, but if paid storage plans happen (see
`files-and-tune-sharing.md`), reword it.
