import RhythmSection from "@/components/RhythmSection";

/** `/rhythm-section[?tab=players][?play=drums][?chart=<id>&key=<key>]` — bass, drums and chords to
    play along with; `chart` opens one of your charts (Play along on a tune or chart page).
    `/bass-genius` and `/drum-generator` redirect here (`next.config.ts`). */
export default async function RhythmSectionPage({ searchParams }: { searchParams: Promise<{ tab?: string; play?: string; chart?: string; key?: string }> }) {
  const { tab, play, chart, key } = await searchParams;
  return <RhythmSection initialTab={tab} initialPlay={play} initialChart={chart} initialKey={key} />;
}
