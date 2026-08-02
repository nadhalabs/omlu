import { requireStaffRole } from "@/lib/serverAuth";
import PendingPaymentsClient from "./PendingPaymentsClient";

export const metadata = { title: "Pending Payments — Admin Console" };

export default async function PendingPaymentsPage() {
  const staff = await requireStaffRole(["owner", "admin"]);
  return <PendingPaymentsClient actorRole={staff.role} />;
}
