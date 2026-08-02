import { NextRequest, NextResponse } from "next/server";
import { backendUrl } from "@/lib/backendUrl";

type Params = Promise<{ billNumber: string }>;

export async function POST(request: NextRequest, { params }: { params: Params }) {
  const token = request.cookies.get("staff_token")?.value;
  if (!token) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  const { billNumber } = await params;
  const response = await fetch(
    backendUrl(`/staff/bills/${encodeURIComponent(billNumber)}/issue-and-release`),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(request.headers.get("Idempotency-Key")
          ? { "Idempotency-Key": request.headers.get("Idempotency-Key")! }
          : {}),
      },
      body: await request.text(),
    },
  );
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
