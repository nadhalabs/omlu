import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/proxyHelper";

type Params = Promise<{ categoryId: string }>;

export async function POST(request: NextRequest, { params }: { params: Params }) {
  const { categoryId } = await params;
  return proxyAdminRequest(request, `/categories/${encodeURIComponent(categoryId)}/delete-with-items`);
}
