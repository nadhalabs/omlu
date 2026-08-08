import { NextRequest, NextResponse } from "next/server";
import { backendUrl } from "@/lib/backendUrl";

type Params = Promise<{ billNumber: string }>;

export async function PUT(request: NextRequest, { params }: { params: Params }) {
  const token = request.cookies.get("staff_token")?.value;
  if (!token) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  const { billNumber } = await params;
  try {
    const response = await fetch(backendUrl(`/staff/bills/${encodeURIComponent(billNumber)}/customer-gst-details`), {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: await request.text(),
    });
    const body = await response.json().catch(() => ({}));
    return NextResponse.json(body, { status: response.status });
  } catch {
    return NextResponse.json({ detail: "The service is temporarily unavailable. Please try again." }, { status: 503 });
  }
}
