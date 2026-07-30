import { NextResponse } from "next/server";
import { backendUrl } from "@/lib/backendUrl";

export async function GET() {
  try {
    const response = await fetch(backendUrl("/health/ready"), {
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    const body = await response.json().catch(() => ({
      status: "unavailable",
      checks: {},
    }));
    return NextResponse.json(body, { status: response.status });
  } catch {
    return NextResponse.json(
      {
        status: "unavailable",
        checks: {
          api: "unavailable",
          postgresql: "unknown",
          redis: "unknown",
          realtime: "unavailable",
        },
      },
      { status: 503 },
    );
  }
}
