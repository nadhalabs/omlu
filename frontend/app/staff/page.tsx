import StaffHomeClient from "./StaffHomeClient";
import { requireStaffRole } from "@/lib/serverAuth";

export const metadata = {
  title: "Staff Home - Nadha Serve",
  description: "Operational staff home for active tables and requests.",
};

export default async function StaffHomePage() {
  await requireStaffRole(["owner", "admin", "staff"]);
  return <StaffHomeClient />;
}
