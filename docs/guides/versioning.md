# Versioning and the changelog

soniroll is **v0.10.17 beta**. It uses semantic versioning (MAJOR.MINOR.PATCH); 1.0 will be the
first non-beta release.

## Where the version lives

- **One source:** `"version"` in `apps/web/package.json`.
- `apps/web/next.config.ts` passes it in as `NEXT_PUBLIC_APP_VERSION`; `apps/web/lib/version.ts`
  exposes `APP_VERSION`, `CHANNEL` ("beta" until 1.0) and `VERSION_LABEL` ("v0.10.17 beta").
- It shows under the sidebar logo (a link to `/changelog`, with a "New" pill until the visitor
  opens the latest version) and in the ⋮ menus as "What's new · vX".
- The root `README.md` has a "Current version" line that must match.
- The mobile app (`apps/mobile/app.json`, 1.0.0) is versioned separately for the stores and isn't
  bumped with the website.

## When to bump

Jack wants **small steps**:
- **PATCH** (0.9.1 → 0.9.2) for an ordinary update — fixes, and features too.
- **MINOR** (0.9.x → 0.10.0) only for a big milestone, and only when Jack says so.
- **MAJOR** (1.0.0) when Jack decides soniroll is out of beta (then set `CHANNEL` to "stable").

Bump when Jack asks for it, or when you finish a user-visible change and he's said to keep the
version current. Don't bump for docs-only or internal changes.

## How to bump (all of these, every time)

1. Change `"version"` in `apps/web/package.json`.
2. Add an entry at the **top** of `RELEASES` in `apps/web/lib/changelog.ts`: the same version,
   today's date (`YYYY-MM-DD`), a short title, an optional one-line summary, and one line per
   change with kind `new` (a feature), `improved` (a change to something that existed) or `fixed`
   (a bug). `**bold**` works inside a line. Write for people using the site, in plain words.
3. Update the "Current version" line in `README.md`.
4. Restart the dev server if it's running (it reads `next.config.ts` only at startup).
5. Tell Jack it's a good point to commit.

Bumps happen on `preview`. A release is `preview` merged into `main` (see "Branches" in the
README).

## Corrections

Admin → Changelog edits an entry without touching the file. A correction is a `changelogEdits` row
in Convex that replaces that version's entry on the site; later edits to `changelog.ts` don't
overwrite it ("Updated since your edit" shows when the file changed underneath), and "Revert to
original" drops it. Keep every version's entry in the file even after it's been corrected.

History of how this was built: `docs/notes/versioning-and-changelog.md`.
