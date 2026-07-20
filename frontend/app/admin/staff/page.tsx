import StaffManagementClient from "./StaffManagementClient";

export const metadata = {
  title: "Staff Management - OMLU Admin",
  description: "Manage restaurant-scoped staff access.",
};

export default function StaffManagementPage() {
  return <StaffManagementClient />;
}
