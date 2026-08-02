import { NextRequest, NextResponse } from "next/server";
import { backendUrl } from "@/lib/backendUrl";

export async function POST(request: NextRequest) {
  const token = request.cookies.get("staff_token")?.value;
  if (!token) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  const response = await fetch(backendUrl("/staff/bills/payment-code/lookup"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: await request.text(),
  });
  const data = await response.json();
  const headers = new Headers();
  const retryAfter = response.headers.get("Retry-After");
  if (retryAfter) headers.set("Retry-After", retryAfter);
  return NextResponse.json(data, { status: response.status, headers });
}
