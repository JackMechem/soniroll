/**
 * The desktop app's update manifest (Tauri's updater endpoint, `apps/desktop/src-tauri/tauri.conf.json`).
 * Hands back the `latest.json` attached to the newest desktop release on GitHub: the newest Stable
 * one (GitHub's "latest" release), or with `?channel=unstable` the newest of all, pre-releases too.
 * 204 (no update) when there isn't one (releases before the updater, or a failed build).
 *
 * Kept fresh: an app checks once at launch, so a stale answer means it waits for the next launch.
 * Stable reads GitHub's `releases/latest/download/` link (not the API, which allows 60 calls an hour)
 * uncached; the CDN keeps the answer for a minute. (It used to cache GitHub's release list for five
 * minutes under the CDN's five plus ten stale — a new release took ~20 minutes to show.)
 */

const REPO = "https://github.com/JackMechem/soniroll";
const RELEASES = "https://api.github.com/repos/JackMechem/soniroll/releases?per_page=30";

type Release = { tag_name: string; prerelease: boolean; draft: boolean; assets: { name: string; browser_download_url: string }[] };

const noUpdate = () => new Response(null, { status: 204, headers: { "Cache-Control": "public, s-maxage=60" } });

async function manifestUrl(unstable: boolean): Promise<string | null> {
  if (!unstable) return `${REPO}/releases/latest/download/latest.json`;
  const res = await fetch(RELEASES, { headers: { Accept: "application/vnd.github+json" }, next: { revalidate: 60 } });
  if (!res.ok) return null;
  const release = ((await res.json()) as Release[]).find(
    (r) => !r.draft && r.tag_name.startsWith("desktop-v") && r.assets.some((a) => a.name === "latest.json"),
  );
  return release?.assets.find((a) => a.name === "latest.json")?.browser_download_url ?? null;
}

export async function GET(request: Request) {
  const url = await manifestUrl(new URL(request.url).searchParams.get("channel") === "unstable");
  if (!url) return noUpdate();
  const body = await fetch(url, { cache: "no-store" });
  if (!body.ok) return noUpdate();
  return new Response(await body.text(), {
    headers: { "Content-Type": "application/json", "Cache-Control": "public, s-maxage=60, stale-while-revalidate=60" },
  });
}
