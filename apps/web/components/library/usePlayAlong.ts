/** Rhythm Section's address for playing one of your charts (optionally in another key, a
    `KEY_NAMES` entry): the "Play along" button on tune and chart pages. */
export function playAlongHref(chartId: string, key = ""): string {
  const q = new URLSearchParams({ chart: chartId });
  if (key) q.set("key", key);
  return `/rhythm-section?${q}`;
}
