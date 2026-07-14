import { NextRequest, NextResponse } from "next/server";
import { backendUrl, getBackendBaseUrl } from "@/lib/backendUrl";

// Staff service requests proxy
// GET /api/staff/service-requests[?status_filter=...]
export async function GET(request: NextRequest) {
  const tokenCookie = request.cookies.get("staff_token");
  if (!tokenCookie?.value) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get("status_filter");
  const queryString = statusFilter ? `?status_filter=${encodeURIComponent(statusFilter)}` : "";
  const targetUrl = backendUrl(`/staff/service-requests${queryString}`);

  try {
    const res = await fetch(targetUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${tokenCookie.value}`,
      },
    });

    if (!res.ok) {
      let errDetail = `Backend error: ${res.status}`;
      try {
        const errJson = await res.json();
        if (errJson && typeof errJson.detail === "string") errDetail = errJson.detail;
      } catch {}
      return NextResponse.json({ detail: errDetail }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown connection error";
    return NextResponse.json(
      { detail: `Could not connect to the backend server at ${getBackendBaseUrl()}. ${message}` },
      { status: 500 }
    );
  }
}
