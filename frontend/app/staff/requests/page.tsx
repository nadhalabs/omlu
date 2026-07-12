import StaffRequestsClient from "./StaffRequestsClient";
import { requireStaffRole } from "@/lib/serverAuth";

export const metadata = {
  title: "Service Requests — Nadha Serve Staff",
};

export default async function StaffRequestsPage() {
  await requireStaffRole(["owner", "admin", "staff"]);
  return <StaffRequestsClient />;
}
