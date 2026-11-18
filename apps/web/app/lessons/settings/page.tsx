import LessonSettingsPage from "@/components/lessons/LessonSettingsPage";

export const metadata = { title: "Lesson settings" };

/** `/lessons/settings` — a teacher's lesson features, teaching hours and booking rules. */
export default function LessonSettingsRoute() {
  return <LessonSettingsPage />;
}
