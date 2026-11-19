import ShedLogGate from "@/components/practicelog/ShedLogGate";
import RoutinePage from "@/components/practicelog/RoutinePage";

export const metadata = { title: "Routine" };

/** `/shed-log/routine?id=…` — one routine's page. */
export default async function RoutineRoute({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  return (
    <ShedLogGate>
      <RoutinePage id={id ?? ""} />
    </ShedLogGate>
  );
}
