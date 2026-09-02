import { redirect } from "next/navigation";
import LoginClient from "./LoginClient";
import { authenticatedHomePath } from "@/lib/publicAuth";

export default async function LoginPage() {
  const destination = await authenticatedHomePath();

  if (destination && destination !== "/login") redirect(destination);

  return <LoginClient />;
}
