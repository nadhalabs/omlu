import ChangePasswordClient from "./ChangePasswordClient";
import { requireStaffRole } from "@/lib/serverAuth";

export const metadata = {
  title: "Change Password - Nadha Serve",
};

export default async function ChangePasswordPage() {
  await requireStaffRole(["owner", "admin", "staff", "kitchen"], { allowPasswordChange: true });
  return <ChangePasswordClient />;
}
