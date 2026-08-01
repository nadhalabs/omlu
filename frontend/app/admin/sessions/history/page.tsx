import { redirect } from "next/navigation";

export default function SessionHistoryPage() {
  redirect("/admin/history?view=sessions");
}
