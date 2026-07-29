import ChangePasswordClient from "./ChangePasswordClient";
import { requireStaffRole } from "@/lib/serverAuth";
import { WebAuthScope } from "@/components/WebAuthScope";

export const metadata = {
  title: "Change Password - OMLU Staff",
};

export default async function ChangePasswordPage() {
  const staff = await requireStaffRole(["owner", "admin", "staff", "kitchen"], { allowPasswordChange: true });
  return <WebAuthScope scope={staff.scope}><ChangePasswordClient /></WebAuthScope>;
}
