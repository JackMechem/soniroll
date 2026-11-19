import { redirect } from "next/navigation";

export const metadata = { title: "Availability · Lessons" };

/** Teaching hours moved into Lesson settings. */
export default function AvailabilityRoute() {
  redirect("/lessons/settings#hours");
}
