import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CurrentStaffResponse } from "./types";

export async function requireStaffRole(
  allowedRoles: string[],
  options: { allowPasswordChange?: boolean } = {}
): Promise<CurrentStaffResponse> {
  const cookieStore = await cookies();
  const tokenCookie = cookieStore.get("staff_token");
  if (!tokenCookie?.value) {
    redirect("/login");
  }

  const backendBaseUrl = process.env.BACKEND_API_BASE_URL || "http://localhost:8000";
  let staffInfo: CurrentStaffResponse;
  try {
    const res = await fetch(`${backendBaseUrl}/auth/staff/me`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${tokenCookie.value}`,
      },
      cache: "no-store",
    });
    if (!res.ok) redirect("/login");
    staffInfo = await res.json();
  } catch {
    redirect("/login");
  }

  if (staffInfo.must_change_password && !options.allowPasswordChange) {
    redirect("/staff/change-password");
  }
  if (!allowedRoles.includes(staffInfo.role)) {
    redirect("/login");
  }
  return staffInfo;
}
