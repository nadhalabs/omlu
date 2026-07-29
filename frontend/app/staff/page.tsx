import StaffHomeClient from "./StaffHomeClient";
import { requireStaffRole } from "@/lib/serverAuth";
import { WebAuthScope } from "@/components/WebAuthScope";

export const metadata = {
  title: "Staff Home - OMLU Staff",
  description: "Operational staff home for active tables and requests.",
};

export default async function StaffHomePage() {
  const staff = await requireStaffRole(["owner", "admin", "staff"]);
  return <WebAuthScope scope={staff.scope}><StaffHomeClient /></WebAuthScope>;
}
