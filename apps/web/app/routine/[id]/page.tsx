import SharedRoutinePage from "@/components/practicelog/SharedRoutinePage";

export const metadata = { title: "Shared routine" };

/** `/routine/<id>` — a Shed Log routine shared by link. */
export default async function SharedRoutineRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SharedRoutinePage id={id} />;
}
