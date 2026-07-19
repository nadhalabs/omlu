import { NextRequest, NextResponse } from "next/server";
import { backendUrl, getBackendBaseUrl } from "@/lib/backendUrl";

type Params = Promise<{ billNumber: string }>;

export async function POST(
  request: NextRequest,
  { params }: { params: Params }
) {
  const tokenCookie = request.cookies.get("staff_token");
  if (!tokenCookie?.value) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }
  const { billNumber } = await params;
  try {
    const response = await fetch(
      backendUrl(`/staff/bills/${encodeURIComponent(billNumber)}/send-to-counter`),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenCookie.value}`,
          "Content-Type": "application/json",
        },
      }
    );
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown connection error";
    return NextResponse.json(
      { detail: `Could not connect to the backend server at ${getBackendBaseUrl()}. ${message}` },
      { status: 500 }
    );
  }
}
