import StaffSessionsClient from "./StaffSessionsClient";
import { requireStaffRole } from "@/lib/serverAuth";

export const metadata = {
  title: "Active Tables — Nadha Serve Staff",
  description: "View and manage active dining sessions for your restaurant.",
};

export default async function StaffSessionsPage() {
  await requireStaffRole(["owner", "admin", "staff"]);
  return <StaffSessionsClient />;
}
