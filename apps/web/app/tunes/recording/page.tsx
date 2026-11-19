import RecordingPage from "@/components/recordings/RecordingPage";

export const metadata = { title: "Recording" };

/** `/tunes/recording?id=…` — one recording, under the Library (see
    `components/recordings/RecordingPage.tsx`). The old `/recordings/view?id=…` redirects here. */
export default async function RecordingRoute({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  return <RecordingPage id={id ?? ""} />;
}
