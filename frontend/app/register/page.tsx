import { redirect } from "next/navigation";
import RegisterClient from "./RegisterClient";
import { authenticatedHomePath } from "@/lib/publicAuth";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ type?: string | string[] }> }) {
  const destination = await authenticatedHomePath();
  if (destination && destination !== "/login") redirect(destination);

  const requestedType = (await searchParams).type;
  if (requestedType !== "restaurant" && requestedType !== "cinema") redirect("/get-started");
  return <RegisterClient venueType={requestedType} />;
}
