import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireStaffRole } from "@/lib/serverAuth";
import CinemaAdminClient from "../CinemaAdminClient";

export const metadata: Metadata = { title: "OMLU Cinema Operations", description: "Persistent cinema concession ordering operations." };

export default async function CinemaAdminPage({ params }: { params: Promise<{ section?: string[] }> }) {
  const staff = await requireStaffRole(["owner", "admin", "staff", "kitchen"]);
  if (staff.venue_type !== "cinema") {
    redirect(["owner", "admin"].includes(staff.role) ? "/admin" : "/staff");
  }
  const { section } = await params;
  return <CinemaAdminClient section={section?.[0] ?? "dashboard"}/>;
}
