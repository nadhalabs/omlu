import { NextRequest, NextResponse } from "next/server";
import { backendUrl, getBackendBaseUrl } from "@/lib/backendUrl";

export async function POST(request: NextRequest) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const res = await fetch(backendUrl("/public/restaurants/register"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail =
        typeof data.detail === "string" || (data.detail && typeof data.detail === "object")
          ? data.detail
          : "Registration failed.";
      return NextResponse.json({ detail }, { status: res.status });
    }

    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown connection error";
    return NextResponse.json(
      {
        detail: `Could not connect to the backend server at ${getBackendBaseUrl()}. ${message}`,
      },
      { status: 500 }
    );
  }
}
