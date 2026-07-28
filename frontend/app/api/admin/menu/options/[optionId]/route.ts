import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/proxyHelper";

type Params = Promise<{ optionId: string }>;

export async function PATCH(request: NextRequest, { params }: { params: Params }) {
  const { optionId } = await params;
  return proxyAdminRequest(request, `/menu/options/${encodeURIComponent(optionId)}`);
}
