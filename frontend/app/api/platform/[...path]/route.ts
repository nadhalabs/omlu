import { NextRequest } from "next/server";
import { proxyPlatformRequest } from "@/lib/proxyPlatformHelper";

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const subPath = "/" + path.join("/");
  const search = request.nextUrl.search;
  return proxyPlatformRequest(request, subPath + search);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const subPath = "/" + path.join("/");
  const search = request.nextUrl.search;
  return proxyPlatformRequest(request, subPath + search);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const subPath = "/" + path.join("/");
  const search = request.nextUrl.search;
  return proxyPlatformRequest(request, subPath + search);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const subPath = "/" + path.join("/");
  const search = request.nextUrl.search;
  return proxyPlatformRequest(request, subPath + search);
}
