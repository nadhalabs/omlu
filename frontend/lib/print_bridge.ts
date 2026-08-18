const BRIDGE_BASE = "http://127.0.0.1:24242/v1";

export interface PrinterProfile {
  id: string;
  name: string;
  purpose: "billing" | "kitchen";
  transport: "windows_raw_spooler" | "windows_driver_spooler" | "tcp_lan" | "bluetooth_com";
  host?: string;
  port?: number;
  queueName?: string;
  paperWidth: "58" | "80";
  enabled: boolean;
  is_default: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BridgeHealth {
  bridge_version: string;
  operating_system: string;
  readiness: string;
  configured_printer: string;
  active_transport: string;
  supported_transports: string[];
  active_job_id: string | null;
  printer_online: boolean;
  installation_id: string | null;
  tenant_id: string | null;
  paired: boolean;
  kitchen_printer_configured: boolean;
  kitchen_printer_name: string;
  kitchen_printer_host: string;
  kitchen_printer_port: number;
  billing_printer_configured: boolean;
  billing_printer_name: string;
  billing_printer_host: string;
  billing_printer_port: number;
  printers?: PrinterProfile[];
}

export interface BridgeDiagnostics {
  bridge_version: string;
  operating_system: string;
  installation_id: string | null;
  tenant_id: string | null;
  paired: boolean;
  uptime_seconds: number;
  active_job_id: string | null;
  supported_transports: string[];
  printers: Array<{
    id: string;
    name: string;
    purpose: string;
    transport: string;
    host: string | null;
    port: number | null;
    enabled: boolean;
    is_default: boolean;
  }>;
}

export interface RecentJobRecord {
  jobId: string;
  billNumber?: string;
  receiptType?: string;
  state: string;
  createdAt: string;
  completedAt?: string;
  error?: string;
}

type BridgeHealthPayload = Omit<BridgeHealth, "paired"> & { paired?: boolean };

export function normalizeBridgeHealth(payload: BridgeHealthPayload): BridgeHealth {
  const {
    billing_printer_configured = false,
    billing_printer_name = "",
    billing_printer_host = "",
    billing_printer_port = 9100,
    ...rest
  } = payload;
  return {
    ...rest,
    billing_printer_configured,
    billing_printer_name,
    billing_printer_host,
    billing_printer_port,
    paired: typeof payload.paired === "boolean"
      ? payload.paired
      : Boolean(payload.installation_id && payload.tenant_id),
  };
}

function friendlyBridgeError(code?: string, fallback = "Could not communicate with the Printer Bridge."): string {
  if (code === "MISSING_PUBLIC_KEY" || code === "INCOMPLETE_PAIRING") return "Printer Bridge is not paired yet.";
  if (code === "INVALID_PAIRING_CODE") return "Pairing code expired. Start pairing again.";
  if (code?.includes("aborted") || code?.includes("timeout") || code?.includes("Timeout")) return "Printing timed out.";
  return fallback;
}

export async function createLocalPairingCode(): Promise<{ pairing_code: string }> {
  try {
    const res = await fetch(`${BRIDGE_BASE}/pairing/code`, { method: "POST", signal: AbortSignal.timeout(5000) });
    const body = await res.json();
    if (!res.ok) throw new Error();
    return body;
  } catch { throw new Error("Printer Bridge is not running on this device."); }
}

export async function completeLocalPairing(payload: {
  pairing_code: string; installation_id: string; tenant_id: string; backend_url: string;
  backend_public_key_pem: string; credential_secret: string;
}): Promise<void> {
  try {
    const res = await fetch(`${BRIDGE_BASE}/pairing/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(8000) });
    const body = await res.json();
    if (!res.ok) throw new Error(friendlyBridgeError(body.error, "Could not pair the Printer Bridge."));
  } catch (error) {
    if (error instanceof Error && error.message !== "Failed to fetch") throw error;
    throw new Error("Printer Bridge is not running on this device.");
  }
}

export async function checkBridgeHealth(): Promise<BridgeHealth | null> {
  try {
    const res = await fetch(`${BRIDGE_BASE}/health`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) {
      return normalizeBridgeHealth(await res.json());
    }
  } catch {
    // Bridge offline or uninstalled
  }
  return null;
}

export async function configureKitchenPrinter(token: string, settings: {
  kitchenPrinterName: string; kitchenPrinterHost: string; kitchenPrinterPort: number;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${BRIDGE_BASE}/kitchen-printer/setup`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(settings), signal: AbortSignal.timeout(8000) });
    const body = await res.json();
    return res.ok ? { success: true } : { success: false, error: friendlyBridgeError(body.error || body.message, "Could not configure kitchen printer.") };
  } catch { return { success: false, error: "Local OMLU Print Bridge is unavailable." }; }
}

export async function configureBillingPrinter(token: string, settings: {
  billingPrinterName: string; billingPrinterHost: string; billingPrinterPort: number;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${BRIDGE_BASE}/billing-printer/setup`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(settings), signal: AbortSignal.timeout(8000) });
    const body = await res.json();
    return res.ok ? { success: true } : { success: false, error: friendlyBridgeError(body.error || body.message, "Could not configure billing printer.") };
  } catch { return { success: false, error: "Local OMLU Print Bridge is unavailable." }; }
}

export async function testKitchenPrinter(token: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${BRIDGE_BASE}/kitchen-printer/test`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(12000) });
    const body = await res.json();
    return res.ok && body.success ? { success: true } : { success: false, error: friendlyBridgeError(body.error || body.message, "Kitchen printer unavailable.") };
  } catch { return { success: false, error: "Local OMLU Print Bridge is unavailable." }; }
}

export async function testBillingPrinter(token: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${BRIDGE_BASE}/billing-printer/test`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(12000) });
    const body = await res.json();
    return res.ok && body.success ? { success: true } : { success: false, error: friendlyBridgeError(body.error || body.message, "Billing printer unavailable.") };
  } catch { return { success: false, error: "Local OMLU Print Bridge is unavailable." }; }
}

export async function fetchPrinterProfiles(): Promise<PrinterProfile[]> {
  try {
    const res = await fetch(`${BRIDGE_BASE}/printer-profiles`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = await res.json();
      return data.printers || [];
    }
  } catch {
    // Fall through
  }
  return [];
}

export async function addPrinterProfile(profile: Partial<PrinterProfile>): Promise<{ success: boolean; profile?: PrinterProfile; error?: string }> {
  try {
    const res = await fetch(`${BRIDGE_BASE}/printer-profiles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    if (res.ok) {
      return { success: true, profile: data.profile };
    }
    return { success: false, error: friendlyBridgeError(data.error || data.message, "Could not add printer profile.") };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Printer Bridge unavailable." };
  }
}

export async function updatePrinterProfile(id: string, profile: Partial<PrinterProfile>): Promise<{ success: boolean; profile?: PrinterProfile; error?: string }> {
  try {
    const res = await fetch(`${BRIDGE_BASE}/printer-profiles/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    if (res.ok) {
      return { success: true, profile: data.profile };
    }
    return { success: false, error: friendlyBridgeError(data.error || data.message, "Could not update printer profile.") };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Printer Bridge unavailable." };
  }
}

export async function deletePrinterProfile(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${BRIDGE_BASE}/printer-profiles/${encodeURIComponent(id)}`, {
      method: "DELETE",
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    if (res.ok) {
      return { success: true };
    }
    return { success: false, error: friendlyBridgeError(data.error || data.message, "Could not delete printer profile.") };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Printer Bridge unavailable." };
  }
}

export async function setDefaultPrinterProfile(id: string): Promise<{ success: boolean; profile?: PrinterProfile; error?: string }> {
  try {
    const res = await fetch(`${BRIDGE_BASE}/printer-profiles/${encodeURIComponent(id)}/set-default`, {
      method: "POST",
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    if (res.ok) {
      return { success: true, profile: data.profile };
    }
    return { success: false, error: friendlyBridgeError(data.error || data.message, "Could not set default printer.") };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Printer Bridge unavailable." };
  }
}

export async function testPrinterProfile(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${BRIDGE_BASE}/printer-profiles/${encodeURIComponent(id)}/test`, {
      method: "POST",
      signal: AbortSignal.timeout(12000),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      return { success: true };
    }
    return { success: false, error: friendlyBridgeError(data.error || data.message, "Test print failed.") };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Printer Bridge unavailable." };
  }
}

export async function discoverPrinters(): Promise<Array<{ id: string; name: string; transport: string; host?: string; port?: number; description?: string }>> {
  try {
    const res = await fetch(`${BRIDGE_BASE}/printers/discover`, {
      method: "POST",
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      return data.printers || [];
    }
  } catch {}
  return [];
}

export async function fetchBridgeDiagnostics(): Promise<BridgeDiagnostics | null> {
  try {
    const res = await fetch(`${BRIDGE_BASE}/diagnostics`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      return res.json();
    }
  } catch {}
  return null;
}

export async function fetchRecentBridgeJobs(): Promise<RecentJobRecord[]> {
  try {
    const res = await fetch(`${BRIDGE_BASE}/recent-jobs`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = await res.json();
      return data.jobs || [];
    }
  } catch {}
  return [];
}

export async function sendPrintJobToBridge(job: {
  schema_version: "1.0";
  job_id: string;
  idempotency_key: string;
  installation_id: string;
  tenant_id: string;
  bill_id?: string;
  bill_number?: string;
  receipt_type: "bill" | "receipt" | "test";
  receipt_data?: Record<string, unknown>;
  copy_count: number;
  created_at: string;
  expires_at: string;
  retry_count: number;
  signed_token: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${BRIDGE_BASE}/print-jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(job),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    if (res.ok && data.result?.state === "completed") {
      return { success: true };
    }
    return { success: false, error: friendlyBridgeError(data.result?.error || data.error || data.message, "Print job failed on bridge.") };
  } catch (err: unknown) {
    if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError" || err.message.includes("aborted") || err.message.includes("timeout") || err.message.includes("Timeout"))) {
      return { success: false, error: "Printing timed out." };
    }
    const errorMsg = err instanceof Error ? err.message : "Could not reach local OMLU Print Bridge.";
    return { success: false, error: errorMsg };
  }
}

export async function testBridgePrinter(token: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${BRIDGE_BASE}/printers/test`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    if (res.ok && data.result?.state === "completed") {
      return { success: true };
    }
    return { success: false, error: friendlyBridgeError(data.result?.error || data.error || data.message, "Test print failed on bridge.") };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Could not communicate with local OMLU Print Bridge.";
    return { success: false, error: errorMsg };
  }
}

export async function saveBridgeSettings(token: string, settings: Record<string, unknown>): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${BRIDGE_BASE}/settings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(settings),
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    if (res.ok) {
      return { success: true };
    }
    return { success: false, error: friendlyBridgeError(data.error || data.message, "Could not save bridge settings.") };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Could not save settings on local OMLU Print Bridge.";
    return { success: false, error: errorMsg };
  }
}
