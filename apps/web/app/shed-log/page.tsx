import ShedLogGate from "@/components/practicelog/ShedLogGate";
import PracticeLog from "@/components/PracticeLog";

export const metadata = { title: "Shed Log" };

/** `/shed-log[?date=YYYY-MM-DD]` — the practice calendar. */
export default async function PracticeLogRoute({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams;
  return (
    <ShedLogGate>
      <PracticeLog initialDate={date} />
    </ShedLogGate>
  );
}
