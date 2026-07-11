import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/proxyHelper";

type Params = Promise<{ tableId: string }>;

export async function POST(
  request: NextRequest,
  { params }: { params: Params }
) {
  const { tableId } = await params;
  return proxyAdminRequest(
    request,
    `/tables/${encodeURIComponent(tableId)}/regenerate-code`
  );
}
