import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "OMLU Cinema Operations", description: "Persistent cinema concession ordering operations." };

const sections = new Set(["dashboard", "orders", "kds", "screens", "qr-codes", "menu", "staff", "reports", "printing", "settings"]);

export default async function CinemaAdminPage({ params }: { params: Promise<{ section?: string[] }> }) {
  const section = (await params).section;
  if (!section?.length || !sections.has(section[0])) redirect("/cinema-admin/dashboard");
  return null;
}
