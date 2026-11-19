import FeedbackPage from "@/components/feedback/FeedbackPage";

export const metadata = { title: "Feedback" };

/** `/feedback` — report a bug, suggest something, or say anything else. */
export default function FeedbackRoute() {
  return <FeedbackPage />;
}
