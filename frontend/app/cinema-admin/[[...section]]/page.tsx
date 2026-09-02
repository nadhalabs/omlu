import type { Metadata } from "next";
import CinemaAdminClient from "../CinemaAdminClient";

export const metadata: Metadata = { title: "OMLU Cinema · Development Preview", description: "Local Cinema operations UI prototype." };

export default async function CinemaAdminPage({ params }: { params: Promise<{ section?: string[] }> }) {
  const { section } = await params;
  return <CinemaAdminClient section={section?.[0] ?? "dashboard"}/>;
}
