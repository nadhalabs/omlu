import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/proxyHelper";

// GET /api/admin/dashboard/summary
export async function GET(request: NextRequest) {
  return proxyAdminRequest(request, "/dashboard/summary");
}
