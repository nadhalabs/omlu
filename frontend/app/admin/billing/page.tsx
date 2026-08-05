import { requireStaffRole } from "@/lib/serverAuth";
import BillingCounterClient from "./BillingCounterClient";

export const metadata = { title: "Billing Counter — Admin Console" };

export default async function BillingCounterPage() {
  await requireStaffRole(["owner", "admin"]);
  return <BillingCounterClient />;
}
