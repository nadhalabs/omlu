import { CurrentStaffResponse, StaffSummaryResponse } from "./types";

export type StaffRouteInfo = Pick<
  CurrentStaffResponse | StaffSummaryResponse,
  "role" | "restaurant_slug" | "must_change_password" | "venue_type"
>;

export function roleHomePath(staff: StaffRouteInfo | null | undefined): string {
  if (!staff) return "/login";
  if ((staff.role === "owner" || staff.role === "admin") && staff.must_change_password) return "/staff/change-password";
  if (staff.venue_type === "cinema") return "/cinema-admin";
  if (staff.role === "owner" || staff.role === "admin") return "/admin";
  if (staff.role === "kitchen") return staff.restaurant_slug ? `/kitchen/${staff.restaurant_slug}` : "/kitchen";
  if (staff.role === "staff") return "/staff";
  return "/login";
}

export function isStaffAuthPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname === "/staff/login" ||
    pathname === "/register" ||
    pathname === "/get-started" ||
    pathname === "/staff/change-password" ||
    pathname.includes("/change-password")
  );
}
