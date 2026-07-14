import { requireStaffRole } from "@/lib/serverAuth";
import StaffAvailabilityClient from "./StaffAvailabilityClient";

export const metadata = {
  title: "Availability - Nadha Serve",
};

export default async function StaffAvailabilityPage() {
  await requireStaffRole(["owner", "admin", "staff"]);
  return <StaffAvailabilityClient />;
}
