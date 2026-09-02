import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { WebAuthScope } from "@/components/WebAuthScope";
import { requireStaffRole } from "@/lib/serverAuth";
import CinemaAdminClient from "./CinemaAdminClient";

export default async function CinemaAdminLayout({ children }: { children: ReactNode }) {
  const staff = await requireStaffRole(["owner", "admin", "staff", "kitchen"]);
  if (staff.venue_type !== "cinema") {
    redirect(["owner", "admin"].includes(staff.role) ? "/admin" : "/staff");
  }

  return (
    <WebAuthScope scope={staff.scope}>
      <CinemaAdminClient staffName={staff.name}>{children}</CinemaAdminClient>
    </WebAuthScope>
  );
}
