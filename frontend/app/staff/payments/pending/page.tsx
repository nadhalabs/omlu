import { WebAuthScope } from "@/components/WebAuthScope";
import PendingPaymentsClient from "@/app/admin/payments/pending/PendingPaymentsClient";
import { requireStaffRole } from "@/lib/serverAuth";

export const metadata = { title: "Payment Code Lookup — OMLU" };

export default async function StaffPendingPaymentPage() {
  const staff = await requireStaffRole(["owner", "admin", "staff"]);
  return <WebAuthScope scope={staff.scope}><main className="min-h-screen bg-[var(--omlu-page-background)] px-4 py-8"><div className="mx-auto max-w-5xl"><PendingPaymentsClient actorRole={staff.role} showQueue={staff.role === "owner" || staff.role === "admin"} /></div></main></WebAuthScope>;
}
