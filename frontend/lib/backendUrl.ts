const LOCAL_BACKEND_URL = "http://localhost:8000";

export function getBackendBaseUrl(): string {
  const rawUrl =
    process.env.BACKEND_URL ||
    LOCAL_BACKEND_URL;

  return rawUrl.replace(/\/+$/, "");
}

export function backendUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getBackendBaseUrl()}${normalizedPath}`;
}
