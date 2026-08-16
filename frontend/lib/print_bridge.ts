const BRIDGE_BASE = "http://127.0.0.1:24242/v1";

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

function friendlyBridgeError(code?: string, fallback = "Could not communicate with the Printer Bridge."): string {
  if (code === "MISSING_PUBLIC_KEY" || code === "INCOMPLETE_PAIRING") return "Printer Bridge is not paired yet.";
  if (code === "INVALID_PAIRING_CODE") return "Pairing code expired. Start pairing again.";
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

export async function testKitchenPrinter(token: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${BRIDGE_BASE}/kitchen-printer/test`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(12000) });
    const body = await res.json();
    return res.ok && body.success ? { success: true } : { success: false, error: friendlyBridgeError(body.error || body.message, "Kitchen printer unavailable.") };
  } catch { return { success: false, error: "Local OMLU Print Bridge is unavailable." }; }
}

export interface BridgeSettings {
  enabled: boolean;
  transport: "windows_raw_spooler" | "windows_driver_spooler" | "tcp_lan" | "bluetooth_com";
  printerName: string;
  queueName: string;
  paperWidth: "58" | "80";
  copies: number;
  autoCut: boolean;
  codePage: string;
  charsPerLine: number;
  connectTimeoutMs: number;
  writeTimeoutMs: number;
  chunkSize: number;
  interChunkDelayMs: number;
  feedLines: number;
  tcpHost: string;
  tcpPort: number;
  comPort: string;
  baudRate: number;
  dataBits: number;
  stopBits: number;
  parity: "none" | "even" | "odd";
  installationId: string;
  tenantId: string;
}

export async function checkBridgeHealth(): Promise<BridgeHealth | null> {
  try {
    const res = await fetch(`${BRIDGE_BASE}/health`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // Bridge offline or uninstalled
  }
  return null;
}

export async function fetchBridgePrinters(): Promise<Array<{ id: string; name: string; transport: string; description?: string }>> {
  try {
    const res = await fetch(`${BRIDGE_BASE}/printers`, {
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

export async function saveBridgeSettings(token: string, settings: Partial<BridgeSettings>): Promise<{ success: boolean; error?: string }> {
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
