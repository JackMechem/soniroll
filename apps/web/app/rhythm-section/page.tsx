import RhythmSection from "@/components/RhythmSection";

/** `/rhythm-section[?tab=players][?play=drums]` — bass, drums and chords to play along with.
    `/bass-genius` and `/drum-generator` redirect here (`next.config.ts`). */
export default async function RhythmSectionPage({ searchParams }: { searchParams: Promise<{ tab?: string; play?: string }> }) {
  const { tab, play } = await searchParams;
  return <RhythmSection initialTab={tab} initialPlay={play} />;
}
