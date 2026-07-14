import { NextRequest, NextResponse } from "next/server";
import { backendUrl, getBackendBaseUrl } from "@/lib/backendUrl";

async function proxyAvailabilityRequest(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  const tokenCookie = request.cookies.get("staff_token");
  if (!tokenCookie?.value) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }
  const { path = [] } = await params;
  const suffix = path.length > 0 ? `/${path.map(encodeURIComponent).join("/")}` : "";
  const targetUrl = new URL(backendUrl(`/staff/availability${suffix}`));
  request.nextUrl.searchParams.forEach((value, key) => targetUrl.searchParams.set(key, value));
  const headers: HeadersInit = { Authorization: `Bearer ${tokenCookie.value}` };
  let body: string | undefined;
  if (request.method === "PATCH") {
    headers["Content-Type"] = "application/json";
    body = await request.text();
  }
  try {
    const res = await fetch(targetUrl.toString(), { method: request.method, headers, body, cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown connection error";
    return NextResponse.json({ detail: `Could not connect to the backend server at ${getBackendBaseUrl()}. ${message}` }, { status: 500 });
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  return proxyAvailabilityRequest(request, context);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  return proxyAvailabilityRequest(request, context);
}
