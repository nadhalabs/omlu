import { requireStaffRole } from "@/lib/serverAuth";
import StaffTablesClient from "./StaffTablesClient";
import { WebAuthScope } from "@/components/WebAuthScope";

export const metadata = {
  title: "Staff Tables - OMLU Staff",
};

export default async function StaffTablesPage() {
  const staff = await requireStaffRole(["owner", "admin", "staff"]);
  return <WebAuthScope scope={staff.scope}><StaffTablesClient /></WebAuthScope>;
}
