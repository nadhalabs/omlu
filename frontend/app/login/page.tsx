import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import LoginClient from "./LoginClient";
import { backendUrl } from "@/lib/backendUrl";
import { roleHomePath } from "@/lib/roleRoutes";
import { CurrentStaffResponse } from "@/lib/types";

export default async function LoginPage() {
  const token = (await cookies()).get("staff_token")?.value;
  let destination: string | null = null;

  if (token) {
    try {
      const res = await fetch(backendUrl("/auth/staff/me"), {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.ok) {
        const staff = (await res.json()) as CurrentStaffResponse;
        destination = roleHomePath(staff);
      }
    } catch {
      // Invalid or unreachable auth should render the normal login form.
    }
  }

  if (destination && destination !== "/login") redirect(destination);

  return <LoginClient />;
}
