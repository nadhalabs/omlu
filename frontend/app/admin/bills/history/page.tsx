import { redirect } from "next/navigation";

export default function BillHistoryPage() {
  redirect("/admin/history?view=bills");
}
