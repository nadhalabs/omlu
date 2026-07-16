import StaffRequestsClient from "./StaffRequestsClient";
import { requireStaffRole } from "@/lib/serverAuth";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Service Requests — Nadha Serve Staff",
};

export default async function StaffRequestsPage() {
  const staff = await requireStaffRole(["owner", "admin", "staff"]);
  if (staff.role === "owner" || staff.role === "admin") {
    redirect("/admin/requests");
  }
  return <StaffRequestsClient />;
}
