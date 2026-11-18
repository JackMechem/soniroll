/**
 * The desktop app's update manifest (Tauri's updater endpoint, `apps/desktop/src-tauri/tauri.conf.json`).
 * Hands back the `latest.json` attached to the newest desktop release on GitHub: the newest Stable
 * one (a plain version), or the newest of all while there isn't one yet, or with `?channel=unstable`.
 * 204 (no update) when no release has a `latest.json` (releases before the updater, or a failed
 * build). GitHub's answers are cached for five minutes.
 */

const RELEASES = "https://api.github.com/repos/JackMechem/soniroll/releases?per_page=30";

type Release = { tag_name: string; prerelease: boolean; draft: boolean; assets: { name: string; browser_download_url: string }[] };

export async function GET(request: Request) {
  const unstable = new URL(request.url).searchParams.get("channel") === "unstable";
  const res = await fetch(RELEASES, { headers: { Accept: "application/vnd.github+json" }, next: { revalidate: 300 } });
  if (!res.ok) return new Response(null, { status: 204 });
  const releases = ((await res.json()) as Release[]).filter(
    (r) => !r.draft && r.tag_name.startsWith("desktop-v") && r.assets.some((a) => a.name === "latest.json"),
  );
  const pick = (unstable ? releases[0] : (releases.find((r) => !r.prerelease) ?? releases[0])) ?? null;
  const manifest = pick?.assets.find((a) => a.name === "latest.json");
  if (!manifest) return new Response(null, { status: 204 });
  const body = await fetch(manifest.browser_download_url, { next: { revalidate: 300 } });
  if (!body.ok) return new Response(null, { status: 204 });
  return new Response(await body.text(), {
    headers: { "Content-Type": "application/json", "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
  });
}
