import StaffSessionsClient from "./StaffSessionsClient";
import { requireStaffRole } from "@/lib/serverAuth";
import { WebAuthScope } from "@/components/WebAuthScope";

export const metadata = {
  title: "Active Tables — OMLU Staff",
  description: "View and manage active dining sessions for your restaurant.",
};

export default async function StaffSessionsPage() {
  const staff = await requireStaffRole(["owner", "admin", "staff"]);
  return <WebAuthScope scope={staff.scope}><StaffSessionsClient /></WebAuthScope>;
}
