import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/proxyHelper";

type Params = Promise<{ groupId: string }>;

export async function PATCH(request: NextRequest, { params }: { params: Params }) {
  const { groupId } = await params;
  return proxyAdminRequest(request, `/menu/option-groups/${encodeURIComponent(groupId)}`);
}
