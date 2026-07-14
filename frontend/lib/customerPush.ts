import { ApiError } from "./api";

type PushConfig = {
  enabled: boolean;
  public_key: string | null;
};

function publicBackendBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "http://localhost:8000"
  ).replace(/\/+$/, "");
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    let message = "Push notifications are unavailable.";
    try {
      const errorData = await response.json();
      if (errorData && typeof errorData.detail === "string") {
        message = errorData.detail;
      }
    } catch {}
    throw new ApiError(response.status, message);
  }
  return response.json();
}

export function customerPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function getCustomerPushConfig(): Promise<PushConfig> {
  return requestJson<PushConfig>(`${publicBackendBaseUrl()}/public/push/config`, {
    cache: "no-store",
  });
}

export async function enableCustomerPush(sessionToken: string) {
  if (!customerPushSupported()) {
    throw new ApiError(400, "This browser does not support push notifications.");
  }

  const config = await getCustomerPushConfig();
  if (!config.enabled || !config.public_key) {
    throw new ApiError(503, "Push notifications are not configured.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new ApiError(403, "Notification permission was not granted.");
  }

  const registration = await navigator.serviceWorker.register("/customer-push-sw.js");
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.public_key),
    }));

  await requestJson(`${publicBackendBaseUrl()}/public/sessions/${encodeURIComponent(sessionToken)}/push-subscriptions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });

  return subscription;
}
