import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/proxyHelper";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const { type: rawType } = await params;
  const { searchParams } = new URL(request.url);

  let type = rawType.replace(/_/g, "-");
  if (type === "gst-summary" || type === "gst-rate-summary") {
    type = "rate-summary";
  }

  return proxyAdminRequest(request, `/gst/export/${type}?${searchParams.toString()}`, { isBinary: true });
}
