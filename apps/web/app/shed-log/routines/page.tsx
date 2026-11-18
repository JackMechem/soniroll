import ShedLogGate from "@/components/practicelog/ShedLogGate";
import RoutinesPage from "@/components/practicelog/RoutinesPage";

export const metadata = { title: "Routines" };

export default function RoutinesRoute() {
  return (
    <ShedLogGate>
      <RoutinesPage />
    </ShedLogGate>
  );
}
