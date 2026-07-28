import { NextRequest, NextResponse } from "next/server";
import { backendUrl } from "@/lib/backendUrl";

export async function POST(request: NextRequest) {
  const token = request.cookies.get("staff_token")?.value;
  if (!token) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });

  const formData = await request.formData();
  const response = await fetch(backendUrl("/admin/menu-imports"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  const body = await response.json().catch(() => ({ detail: "Menu scan failed." }));
  return NextResponse.json(body, { status: response.status });
}

