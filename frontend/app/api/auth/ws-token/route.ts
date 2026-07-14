import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const tokenCookie = request.cookies.get("staff_token");
  if (!tokenCookie?.value) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }

  return NextResponse.json({ token: tokenCookie.value }, { headers: { "Cache-Control": "no-store" } });
}
