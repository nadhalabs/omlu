import { redirect } from "next/navigation";

export default function OrderHistoryPage() {
  redirect("/admin/history?view=orders");
}
