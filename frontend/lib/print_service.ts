import { checkBridgeHealth, sendPrintJobToBridge } from "@/lib/print_bridge";
import { getStaffBillReceiptPayload, requestPrintBridgeToken } from "@/lib/api";

export type PrintResult =
  | { success: true; method: "bridge"; confirmed: true }
  | { success: true; method: "iframe"; confirmed: false }
  | { success: false; method: "none"; error: string };

export interface PrintIssuedBillOptions {
  billNumber: string;
  sessionToken: string;
  receiptToken: string;
}

export async function printIssuedBill(
  options: PrintIssuedBillOptions
): Promise<PrintResult> {
  const { billNumber, sessionToken, receiptToken } = options;

  if (typeof window === "undefined") {
    return { success: false, method: "none", error: "Printing is only supported in browser environment." };
  }

  // 1. Attempt direct OMLU Windows Print Bridge direct print first
  try {
    const bridge = await checkBridgeHealth();
    if (bridge && bridge.printer_online && bridge.installation_id) {
      const payload = await getStaffBillReceiptPayload(billNumber);
      const authRes = await requestPrintBridgeToken(
        "bill:print",
        bridge.installation_id,
        billNumber
      );

      const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const jobPayload = {
        schema_version: "1.0" as const,
        job_id: jobId,
        idempotency_key: `idemp_${billNumber}_${Date.now()}`,
        installation_id: bridge.installation_id,
        tenant_id: bridge.tenant_id || "default",
        bill_id: billNumber,
        bill_number: billNumber,
        receipt_type: "bill" as const,
        receipt_data: payload,
        copy_count: 1,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 300000).toISOString(),
        retry_count: 0,
        signed_token: authRes.token,
      };

      const printRes = await sendPrintJobToBridge(jobPayload);
      if (printRes.success) {
        return { success: true, method: "bridge", confirmed: true };
      }
    }
  } catch {
    // Print bridge failed or unavailable, fallback to hidden iframe
  }

  // 2. Browser print fallback using hidden same-origin iframe
  return new Promise<PrintResult>((resolve) => {
    try {
      const printUrl = `/bill/${encodeURIComponent(sessionToken)}?receipt=${encodeURIComponent(receiptToken)}`;

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
      const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        try {
          if (iframe.parentNode) {
            iframe.parentNode.removeChild(iframe);
          }
        } catch {}
      };

      // Safe fallback cleanup timeout (2 minutes) to ensure elements do not linger
      const cleanupTimeout = setTimeout(cleanup, 120000);

      const handleLoad = () => {
        try {
          const win = iframe.contentWindow;
          if (!win) {
            clearTimeout(cleanupTimeout);
            cleanup();
            resolve({ success: false, method: "none", error: "Could not access printable receipt frame." });
            return;
          }

          win.addEventListener(
            "afterprint",
            () => {
              clearTimeout(cleanupTimeout);
              cleanup();
            },
            { once: true }
          );

          win.focus();
          win.print();
          resolve({ success: true, method: "iframe", confirmed: false });
        } catch (err) {
          clearTimeout(cleanupTimeout);
          cleanup();
          resolve({
            success: false,
            method: "none",
            error: err instanceof Error ? err.message : "Failed to trigger browser print dialog.",
          });
        }
      };

      iframe.onerror = () => {
        clearTimeout(cleanupTimeout);
        cleanup();
        resolve({ success: false, method: "none", error: "Failed to load printable receipt frame." });
      };

      iframe.onload = handleLoad;
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
