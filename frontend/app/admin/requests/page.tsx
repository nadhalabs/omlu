import AdminRequestsClient from "./AdminRequestsClient";
import { requireStaffRole } from "@/lib/serverAuth";

export const metadata = {
  title: "Service Requests — Admin Console",
};

export default async function AdminRequestsPage() {
  await requireStaffRole(["owner", "admin"]);
  return <AdminRequestsClient />;
}
