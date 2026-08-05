import { NextRequest, NextResponse } from "next/server";
import { backendUrl, getBackendBaseUrl } from "@/lib/backendUrl";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("staff_token")?.value;
  if (!token) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  try {
    const response = await fetch(backendUrl("/staff/bills/billing-counter"), {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown connection error";
    return NextResponse.json(
      { detail: `Could not connect to the backend server at ${getBackendBaseUrl()}. ${message}` },
      { status: 500 },
    );
  }
}
