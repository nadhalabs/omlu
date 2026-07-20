import { requireStaffRole } from "@/lib/serverAuth";
import StaffTablesClient from "./StaffTablesClient";

export const metadata = {
  title: "Staff Tables - OMLU Staff",
};

export default async function StaffTablesPage() {
  await requireStaffRole(["owner", "admin", "staff"]);
  return <StaffTablesClient />;
}
