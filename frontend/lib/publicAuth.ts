import { cookies } from "next/headers";
import { backendUrl } from "./backendUrl";
import { roleHomePath } from "./roleRoutes";
import { CurrentStaffResponse } from "./types";

export async function authenticatedHomePath(): Promise<string | null> {
  const token = (await cookies()).get("staff_token")?.value;
  if (!token) return null;
  try {
    const response = await fetch(backendUrl("/auth/staff/me"), {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!response.ok) return null;
    return roleHomePath((await response.json()) as CurrentStaffResponse);
  } catch {
    return null;
  }
}
