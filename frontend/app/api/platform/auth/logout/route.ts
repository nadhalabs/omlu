import { NextResponse, NextRequest } from "next/server";
import { proxyPlatformRequest } from "@/lib/proxyPlatformHelper";

export async function POST(request: NextRequest) {
  const res = await proxyPlatformRequest(request, "/auth/logout");
  const response = NextResponse.json({ message: "Logged out" }, { status: res.status });
  response.cookies.delete("platform_token");
  return response;
}
