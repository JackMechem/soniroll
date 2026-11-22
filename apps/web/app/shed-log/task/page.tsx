import ShedLogGate from "@/components/practicelog/ShedLogGate";
import TaskPage from "@/components/practicelog/TaskPage";

export const metadata = { title: "Task" };

/** `/shed-log/task?routine=…&task=…` (a task in a routine) or `?date=…&task=…` (a day's own task). */
export default async function TaskRoute({ searchParams }: { searchParams: Promise<{ routine?: string; date?: string; task?: string }> }) {
  const { routine, date, task } = await searchParams;
  return (
    <ShedLogGate>
      <TaskPage routineId={routine || undefined} date={date || undefined} taskId={task ?? ""} />
    </ShedLogGate>
  );
}
