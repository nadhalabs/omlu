import { checkBridgeHealth, sendPrintJobToBridge, BridgeHealth } from "@/lib/print_bridge";
import { getQuickSaleReceiptPayload, getStaffBillReceiptPayload, requestPrintBridgeToken } from "@/lib/api";

export type PrintResult =
  | { success: true; method: "bridge"; confirmed: true }
  | { success: true; method: "iframe"; confirmed: false }
  | { success: false; method: "none"; error: string };

export interface PrintIssuedBillOptions {
  billNumber: string;
  sessionToken: string;
  receiptToken: string;
  forceIframe?: boolean;
}

export async function printIssuedBill(
  options: PrintIssuedBillOptions
): Promise<PrintResult> {
  return printDocument({
    ...options,
    receiptType: "bill",
    printUrl: `/bill/${encodeURIComponent(options.sessionToken)}?receipt=${encodeURIComponent(options.receiptToken)}`,
    fetchPayload: () => getStaffBillReceiptPayload(options.billNumber),
  });
}

export async function printCompletedQuickSale(options: { orderNumber: string; publicToken: string; forceIframe?: boolean }): Promise<PrintResult> {
  return printDocument({
    billNumber: options.orderNumber,
    sessionToken: options.publicToken,
    receiptToken: options.publicToken,
    receiptType: "receipt",
    printUrl: `/bill/${encodeURIComponent(options.publicToken)}?receipt=${encodeURIComponent(options.publicToken)}&quickSale=1`,
    fetchPayload: () => getQuickSaleReceiptPayload(options.publicToken),
    forceIframe: options.forceIframe,
  });
}

async function printDocument(options: PrintIssuedBillOptions & {
  receiptType: "bill" | "receipt";
  printUrl: string;
  fetchPayload: () => Promise<Record<string, unknown>>;
  forceIframe?: boolean;
}): Promise<PrintResult> {
  if (typeof window === "undefined") {
    return {
      success: false,
      method: "none",
      error: "Printing is only supported in browser environment.",
    };
  }

  if (options.forceIframe) {
    return browserPrint(options);
  }

  return bridgePrint(options);
}

async function bridgePrint(options: PrintIssuedBillOptions & {
  receiptType: "bill" | "receipt";
  fetchPayload: () => Promise<Record<string, unknown>>;
}): Promise<PrintResult> {
  const { billNumber } = options;

  let bridge: BridgeHealth | null = null;
  try {
    bridge = await checkBridgeHealth();
  } catch (err) {
    return {
      success: false,
      method: "none",
      error: err instanceof Error ? err.message : "OMLU Printer Bridge is unavailable.",
    };
  }

  if (!bridge) {
    return {
      success: false,
      method: "none",
      error: "OMLU Printer Bridge is unavailable.",
    };
  }

  if (!bridge.paired || !bridge.installation_id) {
    return {
      success: false,
      method: "none",
      error: "Printer Bridge is not paired.",
    };
  }

  if (!bridge.billing_printer_configured) {
    return {
      success: false,
      method: "none",
      error: "Billing printer is not configured.",
    };
  }

  if (!bridge.billing_printer_host) {
    return {
      success: false,
      method: "none",
      error: "Billing printer address is missing.",
    };
  }

  if (bridge.printer_online === false) {
    return {
      success: false,
      method: "none",
      error: "Billing printer is offline.",
    };
  }

  let payload: Record<string, unknown>;
  try {
    payload = await options.fetchPayload();
  } catch (err) {
    return {
      success: false,
      method: "none",
      error: err instanceof Error ? err.message : "Could not fetch receipt payload.",
    };
  }

  let authRes: { token: string };
  try {
    authRes = await requestPrintBridgeToken(
      "bill:print",
      bridge.installation_id,
      billNumber
    );
  } catch {
    return {
      success: false,
      method: "none",
      error: "Unable to authorize printer job.",
    };
  }

  if (!authRes || !authRes.token) {
    return {
      success: false,
      method: "none",
      error: "Unable to authorize printer job.",
    };
  }

  const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const jobPayload = {
    schema_version: "1.0" as const,
    job_id: jobId,
    idempotency_key: `idemp_${billNumber}_${Date.now()}`,
    installation_id: bridge.installation_id,
    tenant_id: bridge.tenant_id || "default",
    bill_id: billNumber,
    bill_number: billNumber,
    receipt_type: options.receiptType,
    receipt_data: payload,
    copy_count: 1,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 300000).toISOString(),
    retry_count: 0,
    signed_token: authRes.token,
  };

  try {
    const printRes = await sendPrintJobToBridge(jobPayload);
    if (printRes.success) {
      return { success: true, method: "bridge", confirmed: true };
    }
    return {
      success: false,
      method: "none",
      error: printRes.error || "Billing printer unavailable.",
    };
  } catch (err) {
    if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError" || err.message.includes("aborted") || err.message.includes("timeout"))) {
      return { success: false, method: "none", error: "Printing timed out." };
    }
    return {
      success: false,
      method: "none",
      error: err instanceof Error ? err.message : "OMLU Printer Bridge is unavailable.",
    };
  }
}

async function browserPrint(options: {
  sessionToken: string;
  receiptToken: string;
  printUrl: string;
}): Promise<PrintResult> {
  const { sessionToken, receiptToken, printUrl } = options;
  return new Promise<PrintResult>((resolve) => {
    try {
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.top = "-9999px";
      iframe.style.left = "-9999px";
      iframe.style.width = "1px";
      iframe.style.height = "1px";
      iframe.style.opacity = "0";
      iframe.style.border = "0";
      iframe.style.pointerEvents = "none";
      iframe.setAttribute("aria-hidden", "true");

      let cleanedUp = false;
      let hasTriggeredPrint = false;

      const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        window.removeEventListener("message", messageListener);
        try {
          if (iframe.parentNode) {
            iframe.parentNode.removeChild(iframe);
          }
        } catch {}
      };

      const timeoutId = setTimeout(() => {
        if (!hasTriggeredPrint) {
          cleanup();
          resolve({
            success: false,
            method: "none",
            error: "Printable bill did not become ready.",
          });
        }
      }, 10000);

      const messageListener = (event: MessageEvent) => {
        try {
          if (event.origin !== window.location.origin) return;
          if (event.source !== iframe.contentWindow) return;
          if (event.data?.type !== "OMLU_PRINT_READY") return;
          if (event.data?.sessionToken !== sessionToken) return;
          if (event.data?.receiptToken !== receiptToken) return;

          if (hasTriggeredPrint) return;
          hasTriggeredPrint = true;

          const win = iframe.contentWindow;
          const doc = iframe.contentDocument;

          if (!win || win === window) {
            clearTimeout(timeoutId);
            cleanup();
            resolve({ success: false, method: "none", error: "Invalid print target window." });
            return;
          }

          if (!doc || !doc.querySelector(".print-bill-sheet")) {
            clearTimeout(timeoutId);
            cleanup();
            resolve({ success: false, method: "none", error: "Printable receipt sheet not found in document." });
            return;
          }

          const afterprintCleanupTimeout = setTimeout(cleanup, 120000);

          win.addEventListener(
            "afterprint",
            () => {
              clearTimeout(afterprintCleanupTimeout);
              clearTimeout(timeoutId);
              cleanup();
            },
            { once: true }
          );

          win.focus();
          win.print();
          resolve({ success: true, method: "iframe", confirmed: false });
        } catch (err) {
          clearTimeout(timeoutId);
          cleanup();
          resolve({
            success: false,
            method: "none",
            error: err instanceof Error ? err.message : "Failed to trigger browser print dialog.",
          });
        }
      };

      window.addEventListener("message", messageListener);

      iframe.onerror = () => {
        clearTimeout(timeoutId);
        cleanup();
        resolve({ success: false, method: "none", error: "Failed to load printable receipt frame." });
      };

      iframe.src = printUrl;
      document.body.appendChild(iframe);
    } catch (err) {
      resolve({
        success: false,
        method: "none",
        error: err instanceof Error ? err.message : "Failed to initialize print iframe.",
      });
    }
  });
}
