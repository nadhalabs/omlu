import { requireStaffRole } from "@/lib/serverAuth";
import StaffAvailabilityClient from "./StaffAvailabilityClient";
import { WebAuthScope } from "@/components/WebAuthScope";

export const metadata = {
  title: "Availability - OMLU Staff",
};

export default async function StaffAvailabilityPage() {
  const staff = await requireStaffRole(["owner", "admin", "staff"]);
  return <WebAuthScope scope={staff.scope}><StaffAvailabilityClient /></WebAuthScope>;
}
