import { NextRequest, NextResponse } from "next/server";
import { backendUrl } from "@/lib/backendUrl";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: "Invalid request." }, { status: 400 });
  }

  try {
    const response = await fetch(backendUrl("/public/sales-leads"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ detail: "OMLU is temporarily unavailable. Please try again shortly." }, { status: 503 });
  }
}
