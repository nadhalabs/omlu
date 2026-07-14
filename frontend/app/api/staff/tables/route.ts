import { NextRequest, NextResponse } from "next/server";
import { backendUrl, getBackendBaseUrl } from "@/lib/backendUrl";

export async function GET(request: NextRequest) {
  const tokenCookie = request.cookies.get("staff_token");
  if (!tokenCookie?.value) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }
  const targetUrl = new URL(backendUrl("/staff/tables"));
  request.nextUrl.searchParams.forEach((value, key) => targetUrl.searchParams.set(key, value));
  try {
    const res = await fetch(targetUrl.toString(), {
      headers: { Authorization: `Bearer ${tokenCookie.value}` },
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown connection error";
    return NextResponse.json({ detail: `Could not connect to the backend server at ${getBackendBaseUrl()}. ${message}` }, { status: 500 });
  }
}
