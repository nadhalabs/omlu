import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/proxyHelper";

// GET /api/admin/settings
export async function GET(request: NextRequest) {
  return proxyAdminRequest(request, "/settings");
}

// PATCH /api/admin/settings
export async function PATCH(request: NextRequest) {
  return proxyAdminRequest(request, "/settings");
}
