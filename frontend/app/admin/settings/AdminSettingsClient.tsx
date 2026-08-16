"use client";

import Link from "next/link";
import { FormEvent, ReactNode, useCallback, useEffect, useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ApiError, confirmBridgePairing, createPairingChallenge, exchangeBridgeCredential, getRestaurantSettings, requestPrintBridgeToken, updateRestaurantSettings } from "@/lib/api";
import { BridgeHealth, checkBridgeHealth, configureKitchenPrinter, testKitchenPrinter } from "@/lib/print_bridge";
import { RestaurantSettingsResponse, RestaurantSettingsUpdate } from "@/lib/types";

const TIMEZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Bangkok",
  "Europe/London",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
];

const LEGAL_LINKS = [
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/refunds", label: "Refund & Cancellation" },
  { href: "/acceptable-use", label: "Acceptable Use Policy" },
  { href: "/service-policy", label: "Service & Support Policy" },
];

export default function AdminSettingsClient() {
  const [settings, setSettings] = useState<RestaurantSettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [bridgeStatus, setBridgeStatus] = useState<"checking" | "connected" | "disconnected">("checking");
  const [bridgeHealth, setBridgeHealth] = useState<BridgeHealth | null>(null);
  const [printerHost, setPrinterHost] = useState("");
  const [printerPort, setPrinterPort] = useState("9100");
  const [printerName, setPrinterName] = useState("Kitchen Printer");
  const [printerBusy, setPrinterBusy] = useState(false);
  const [printerMessage, setPrinterMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [gstEditing, setGstEditing] = useState(false);

  const [timezone, setTimezone] = useState("");
  const [orderPrefix, setOrderPrefix] = useState("");
  const [serviceRequestsEnabled, setServiceRequestsEnabled] = useState(true);
  const [kitchenMode, setKitchenMode] = useState<"kds" | "direct_print">("kds");
  const [gstEnabled, setGstEnabled] = useState(false);
  const [gstin, setGstin] = useState("");
  const [legalBusinessName, setLegalBusinessName] = useState("");
  const [billingAddress, setBillingAddress] = useState("");
  const [gstStateName, setGstStateName] = useState("");
  const [gstStateCode, setGstStateCode] = useState("");
  const [gstRate, setGstRate] = useState("0.00");
  const [taxMode, setTaxMode] = useState<"inclusive" | "exclusive">("exclusive");
  const [invoicePrefix, setInvoicePrefix] = useState("INV");

  const hasUnsavedChanges = settings !== null && (
    timezone !== settings.timezone ||
    orderPrefix.toUpperCase() !== settings.order_prefix ||
    serviceRequestsEnabled !== settings.service_requests_enabled ||
    kitchenMode !== settings.kitchen_mode ||
    gstEnabled !== settings.gst_enabled ||
    (gstin || null) !== settings.gstin ||
    (legalBusinessName || null) !== settings.legal_business_name ||
    (billingAddress || null) !== settings.registered_billing_address ||
    (gstStateName || null) !== settings.gst_state_name ||
    (gstStateCode || null) !== settings.gst_state_code ||
    gstRate !== settings.default_gst_rate ||
    taxMode !== settings.tax_mode ||
    invoicePrefix.toUpperCase() !== settings.invoice_prefix
  );

  const applySettings = useCallback((data: RestaurantSettingsResponse) => {
    setSettings(data);
    setTimezone(data.timezone);
    setOrderPrefix(data.order_prefix);
    setServiceRequestsEnabled(data.service_requests_enabled);
    setKitchenMode(data.kitchen_mode);
    setGstEnabled(data.gst_enabled);
    setGstin(data.gstin || "");
    setLegalBusinessName(data.legal_business_name || "");
    setBillingAddress(data.registered_billing_address || "");
    setGstStateName(data.gst_state_name || "");
    setGstStateCode(data.gst_state_code || "");
    setGstRate(data.default_gst_rate);
    setTaxMode(data.tax_mode);
    setInvoicePrefix(data.invoice_prefix);
  }, []);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      applySettings(await getRestaurantSettings());
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load settings.");
    } finally {
      setLoading(false);
    }
  }, [applySettings]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadSettings(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadSettings]);

  useEffect(() => {
    let active = true;
    void checkBridgeHealth().then((health) => {
      if (active) {
        setBridgeHealth(health);
        setBridgeStatus(health ? "connected" : "disconnected");
        if (health?.kitchen_printer_configured) {
          setPrinterName(health.kitchen_printer_name || "Kitchen Printer");
          setPrinterHost(health.kitchen_printer_host || "");
          setPrinterPort(String(health.kitchen_printer_port || 9100));
        }
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const refreshBridgeHealth = async () => {
    const health = await checkBridgeHealth();
    setBridgeHealth(health);
    setBridgeStatus(health ? "connected" : "disconnected");
    return health;
  };

  const saveKitchenPrinter = async () => {
    if (printerBusy) return;
    const port = Number(printerPort);
    if (!printerHost.trim() || !Number.isInteger(port) || port < 1 || port > 65535) {
      setPrinterMessage({ tone: "error", text: "Enter a valid printer IP or host and port." }); return;
    }
    setPrinterBusy(true); setPrinterMessage(null);
    try {
      const health = await refreshBridgeHealth();
      if (!health?.installation_id) throw new Error("Install or start the OMLU Windows Printer Bridge first.");
      const challenge = await createPairingChallenge(health.installation_id);
      const paired = await confirmBridgePairing(health.installation_id, challenge.pairing_code);
      const credential = await exchangeBridgeCredential(paired.exchange_token);
      const auth = await requestPrintBridgeToken("printer:configure", health.installation_id);
      const result = await configureKitchenPrinter(auth.token, {
        backendUrl: paired.backend_url, credentialSecret: credential.credential_secret, tenantId: credential.tenant_id,
        kitchenPrinterName: printerName.trim() || "Kitchen Printer", kitchenPrinterHost: printerHost.trim(), kitchenPrinterPort: port,
      });
      if (!result.success) throw new Error(result.error);
      await refreshBridgeHealth();
      setPrinterMessage({ tone: "success", text: "Kitchen printer configured. Send a test print to confirm the connection." });
    } catch (reason) {
      setPrinterMessage({ tone: "error", text: reason instanceof Error ? reason.message : "Could not configure the kitchen printer." });
    } finally { setPrinterBusy(false); }
  };

  const runKitchenPrinterTest = async () => {
    if (printerBusy || !bridgeHealth?.installation_id) return;
    setPrinterBusy(true); setPrinterMessage(null);
    try {
      const auth = await requestPrintBridgeToken("printer:test", bridgeHealth.installation_id);
      const result = await testKitchenPrinter(auth.token);
      if (!result.success) throw new Error(result.error);
      setPrinterMessage({ tone: "success", text: "Kitchen printer test completed successfully." });
    } catch (reason) {
      setPrinterMessage({ tone: "error", text: reason instanceof Error ? reason.message : "Kitchen printer unavailable." });
    } finally { setPrinterBusy(false); }
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const saveGstOnly = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("data-save-scope") === "gst";
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const gstUpdateData: RestaurantSettingsUpdate = {
        gst_enabled: gstEnabled,
        gstin: gstin || null,
        legal_business_name: legalBusinessName || null,
        registered_billing_address: billingAddress || null,
        gst_state_name: gstStateName || null,
        gst_state_code: gstStateCode || null,
        default_gst_rate: gstRate,
        tax_mode: taxMode,
        invoice_prefix: invoicePrefix.toUpperCase(),
      };
      const updateData: RestaurantSettingsUpdate = saveGstOnly ? gstUpdateData : {
        timezone: timezone || undefined,
        order_prefix: orderPrefix.toUpperCase() || undefined,
        service_requests_enabled: serviceRequestsEnabled,
        kitchen_mode: kitchenMode,
        ...gstUpdateData,
      };
      const updated = await updateRestaurantSettings(updateData);
      if (saveGstOnly) {
        setSettings(updated);
        setGstEnabled(updated.gst_enabled);
        setGstin(updated.gstin || "");
        setLegalBusinessName(updated.legal_business_name || "");
        setBillingAddress(updated.registered_billing_address || "");
        setGstStateName(updated.gst_state_name || "");
        setGstStateCode(updated.gst_state_code || "");
        setGstRate(updated.default_gst_rate);
        setTaxMode(updated.tax_mode);
        setInvoicePrefix(updated.invoice_prefix);
        setGstEditing(false);
        setSuccess("GST settings saved successfully.");
      } else {
        applySettings(updated);
        setGstEditing(false);
        setSuccess("Settings saved successfully.");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  const discardChanges = () => {
    if (!settings || saving) return;
    applySettings(settings);
    setGstEditing(false);
    setError(null);
    setSuccess(null);
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-t-2 border-orange-500" />
          <p className="text-sm font-semibold text-[var(--omlu-text-secondary)]">Loading settings…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-6 pb-8">
      <header>
        <h1 className="text-2xl font-black text-[var(--omlu-text-primary)]">Restaurant Settings</h1>
        <p className="mt-1 text-sm text-[var(--omlu-text-secondary)]">Manage how your restaurant operates, bills customers, and prints receipts.</p>
      </header>

      {error && <div role="alert" className="rounded-xl border border-red-700/40 bg-red-950/20 px-4 py-3 text-sm font-semibold text-red-600 dark:text-red-400">{error}</div>}
      {success && <div role="status" className="rounded-xl border border-emerald-700/40 bg-emerald-950/20 px-4 py-3 text-sm font-semibold text-emerald-700 dark:text-emerald-400">{success}</div>}

      <form onSubmit={handleSave} className={`flex min-w-0 flex-col gap-6 ${hasUnsavedChanges ? "pb-28 sm:pb-24" : ""}`}>
        {hasUnsavedChanges && (
          <div role="region" aria-label="Unsaved settings" className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-5xl flex-col gap-3 rounded-2xl border border-orange-500/50 bg-[var(--omlu-primary-surface)] p-4 shadow-2xl sm:flex-row sm:items-center">
            <p className="flex-1 text-sm font-black text-[var(--omlu-text-primary)]">Unsaved changes</p>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <button type="button" onClick={discardChanges} disabled={saving} className="min-h-11 rounded-xl border border-[var(--omlu-border-strong)] px-5 text-sm font-bold text-[var(--omlu-text-primary)] hover:bg-[var(--omlu-muted-surface)] disabled:cursor-not-allowed disabled:opacity-50">Discard</button>
              <button id="save-settings-btn" type="submit" disabled={saving} className="min-h-11 rounded-xl bg-orange-600 px-6 text-sm font-black text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Saving…" : "Save changes"}</button>
            </div>
          </div>
        )}
        <SettingsSection title="General" description="Your restaurant’s core display and numbering preferences.">
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Timezone" htmlFor="timezone" help="Used for dashboard metrics, order timestamps, and daily revenue calculations.">
              <select id="timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)} className={controlClass}>
                {TIMEZONES.map((item) => <option key={item} value={item}>{item}</option>)}
                {timezone && !TIMEZONES.includes(timezone) && <option value={timezone}>{timezone}</option>}
              </select>
            </Field>
            <Field label="Currency" htmlFor="currency" help="Currency is read-only in the current OMLU release.">
              <input id="currency" disabled value={`${settings?.currency || "INR"} — Indian Rupee (₹)`} className={`${controlClass} cursor-not-allowed opacity-75`} />
            </Field>
            <Field label="Order number prefix" htmlFor="order-prefix" help={<>Orders will appear as: <code className="font-mono font-bold text-[var(--omlu-text-primary)]">{(orderPrefix || "NS").toUpperCase()}-20260712-0001</code></>}>
              <input id="order-prefix" value={orderPrefix} onChange={(event) => setOrderPrefix(event.target.value.toUpperCase())} maxLength={6} placeholder="NS" className={`${controlClass} uppercase`} />
            </Field>
          </div>
        </SettingsSection>

        <SettingsSection title="Billing &amp; GST" description="Configure the tax details used on customer bills and tax invoices.">
          {!gstEditing ? (
            <div className="space-y-5">
              <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
                <SummaryItem label="GST status" value={gstEnabled ? "Enabled" : "Disabled"} status={gstEnabled ? "positive" : "neutral"} />
                <SummaryItem label="GSTIN" value={gstin || "Not provided"} mono />
                <SummaryItem label="Legal business name" value={legalBusinessName || "Not provided"} />
                <SummaryItem label="State + state code" value={gstStateName || gstStateCode ? `${gstStateName || "State"} (${gstStateCode || "—"})` : "Not provided"} />
                <SummaryItem label="Default GST rate" value={`${gstRate}%`} />
                <SummaryItem label="Tax mode" value={taxMode === "exclusive" ? "Exclusive — GST is added to menu prices" : "Inclusive — GST is included in menu prices"} />
                <SummaryItem label="Invoice prefix" value={invoicePrefix || "Not provided"} />
                <SummaryItem label="Registered billing address" value={billingAddress || "Not provided"} className="sm:col-span-2" />
              </div>
              <div className="flex justify-end border-t border-[var(--omlu-border)] pt-4">
                <button type="button" onClick={() => { setGstEditing(true); setError(null); setSuccess(null); }} className="min-h-11 rounded-xl border border-[var(--omlu-border-strong)] px-5 text-sm font-black text-[var(--omlu-text-primary)] hover:bg-[var(--omlu-muted-surface)]">Edit GST settings</button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <SwitchRow label="Enable GST" description="Use your saved GST details on bills and tax invoices." checked={gstEnabled} onChange={setGstEnabled} />
              <div className={`grid gap-5 md:grid-cols-2 ${gstEnabled ? "" : "opacity-60"}`} aria-disabled={!gstEnabled}>
                <SettingsInput id="gstin" label="GSTIN" value={gstin} onChange={(value) => setGstin(value.toUpperCase())} maxLength={15} required={gstEnabled} disabled={!gstEnabled} />
                <SettingsInput id="legal-business-name" label="Legal business name" value={legalBusinessName} onChange={setLegalBusinessName} required={gstEnabled} disabled={!gstEnabled} />
                <SettingsInput id="gst-state-name" label="State" value={gstStateName} onChange={setGstStateName} required={gstEnabled} disabled={!gstEnabled} />
                <SettingsInput id="gst-state-code" label="State code" value={gstStateCode} onChange={setGstStateCode} maxLength={2} required={gstEnabled} disabled={!gstEnabled} />
                <Field label="Default GST rate" htmlFor="gst-rate">
                  <div className="relative"><input id="gst-rate" value={gstRate} onChange={(event) => setGstRate(event.target.value)} inputMode="decimal" required={gstEnabled} disabled={!gstEnabled} className={`${controlClass} pr-10`} /><span className="pointer-events-none absolute inset-y-0 right-4 flex items-center font-bold text-[var(--omlu-text-secondary)]">%</span></div>
                </Field>
                <SettingsInput id="invoice-prefix" label="Invoice prefix" value={invoicePrefix} onChange={(value) => setInvoicePrefix(value.toUpperCase())} maxLength={10} required />
              </div>
              <fieldset disabled={!gstEnabled} className={`min-w-0 ${gstEnabled ? "" : "opacity-60"}`}>
                <legend className="text-sm font-bold text-[var(--omlu-text-primary)]">Tax mode</legend>
                <div className="mt-2 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Tax mode">
                  <TaxModeCard value="exclusive" selected={taxMode === "exclusive"} onChange={setTaxMode} title="Exclusive" description="GST is added to menu prices." />
                  <TaxModeCard value="inclusive" selected={taxMode === "inclusive"} onChange={setTaxMode} title="Inclusive" description="GST is already included in menu prices." />
                </div>
              </fieldset>
              <Field label="Registered billing address" htmlFor="billing-address">
                <textarea id="billing-address" value={billingAddress} onChange={(event) => setBillingAddress(event.target.value)} required={gstEnabled} disabled={!gstEnabled} rows={4} className={`${controlClass} min-h-28 resize-y`} />
              </Field>
              <div className="flex flex-col-reverse gap-3 border-t border-[var(--omlu-border)] pt-4 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => { if (settings) { setGstEnabled(settings.gst_enabled); setGstin(settings.gstin || ""); setLegalBusinessName(settings.legal_business_name || ""); setBillingAddress(settings.registered_billing_address || ""); setGstStateName(settings.gst_state_name || ""); setGstStateCode(settings.gst_state_code || ""); setGstRate(settings.default_gst_rate); setTaxMode(settings.tax_mode); setInvoicePrefix(settings.invoice_prefix); } setGstEditing(false); setError(null); setSuccess(null); }} disabled={saving} className="min-h-11 rounded-xl border border-[var(--omlu-border-strong)] px-5 text-sm font-bold text-[var(--omlu-text-primary)] hover:bg-[var(--omlu-muted-surface)] disabled:opacity-50">Cancel</button>
                <button type="submit" data-save-scope="gst" disabled={saving} className="min-h-11 rounded-xl bg-orange-600 px-6 text-sm font-black text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Saving…" : "Save GST settings"}</button>
              </div>
            </div>
          )}
        </SettingsSection>

        <SettingsSection title="Operations" description="Control customer-facing restaurant operations.">
          <div className="space-y-5">
            <SwitchRow label="Customer service requests" description="Allow customers to request a waiter, water, or assistance from their table." checked={serviceRequestsEnabled} onChange={setServiceRequestsEnabled} />
            <fieldset>
              <legend className="text-sm font-black text-[var(--omlu-text-primary)]">Kitchen System</legend>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <KitchenModeCard value="kds" selected={kitchenMode === "kds"} onChange={setKitchenMode} title="Kitchen Display" description="Live kitchen screen with realtime order progress." />
                <KitchenModeCard value="direct_print" selected={kitchenMode === "direct_print"} onChange={setKitchenMode} title="Direct Kitchen Print" description="Orders are sent directly to the kitchen printer." />
              </div>
            </fieldset>
            {kitchenMode === "direct_print" && !bridgeHealth?.kitchen_printer_configured && <div role="alert" className="flex flex-col gap-3 rounded-xl border border-amber-500/50 bg-amber-500/10 p-4 sm:flex-row sm:items-center"><p className="flex-1 text-sm font-bold text-[var(--omlu-text-primary)]">Direct Kitchen Print is enabled, but no kitchen printer is configured.</p><a href="#kitchen-printer" className="text-sm font-black text-orange-700 underline dark:text-orange-400">Configure kitchen printer</a></div>}
          </div>
        </SettingsSection>

        <SettingsSection id="printing" title="Printing" description="Choose the printing option that fits each billing device.">
          <div id="kitchen-printer" className="scroll-mt-24 rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-muted-surface)] p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="text-sm font-black text-[var(--omlu-text-primary)]">Kitchen Printer</h3><p className="mt-1 text-xs leading-5 text-[var(--omlu-text-secondary)]">Dedicated LAN thermal printer for kitchen tickets. Customer bill printing remains separate.</p></div><span className={`w-fit rounded-full border px-3 py-1 text-xs font-bold ${bridgeHealth?.kitchen_printer_configured ? "border-emerald-600/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "border-[var(--omlu-border-strong)] text-[var(--omlu-text-secondary)]"}`}>{!bridgeHealth ? "Bridge offline" : bridgeHealth.kitchen_printer_configured ? "Configured" : "Not configured"}</span></div>
            <div className="mt-4 grid gap-4 md:grid-cols-[1fr_1fr_140px]">
              <SettingsInput id="kitchen-printer-name" label="Printer name" value={printerName} onChange={setPrinterName} />
              <SettingsInput id="kitchen-printer-host" label="Printer IP / Host" value={printerHost} onChange={setPrinterHost} />
              <SettingsInput id="kitchen-printer-port" label="Port" value={printerPort} onChange={setPrinterPort} />
            </div>
            {printerMessage && <p role={printerMessage.tone === "error" ? "alert" : "status"} className={`mt-3 text-sm font-bold ${printerMessage.tone === "error" ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>{printerMessage.text}</p>}
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end"><button type="button" disabled={printerBusy || !bridgeHealth?.kitchen_printer_configured} onClick={() => void runKitchenPrinterTest()} className="min-h-11 rounded-xl border border-[var(--omlu-border-strong)] px-5 text-sm font-black disabled:opacity-50">Test Print</button><button type="button" disabled={printerBusy} onClick={() => void saveKitchenPrinter()} className="min-h-11 rounded-xl bg-orange-600 px-5 text-sm font-black text-white disabled:opacity-50">{printerBusy ? "Working…" : bridgeHealth?.kitchen_printer_configured ? "Reconfigure" : "Save kitchen printer"}</button></div>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <InfoCard title="Browser Printing" description="Print bills and receipts using your system print dialog." />
            <InfoCard title="Windows Printer Bridge" description="Connect supported receipt printers directly from a Windows billing PC.">
              <BridgeStatus status={bridgeStatus} />
              <a href="/downloads/omlu-print-bridge-developer-package.zip" download className={primaryLinkClass}>Download Windows Bridge (Developer / Hardware Test Package)</a>
            </InfoCard>
            <InfoCard title="OMLU Operations App" description="Use the Android Operations app for direct LAN thermal printing.">
              <a href="/downloads/omlu.apk" download className={secondaryLinkClass}>Download Operations App</a>
            </InfoCard>
          </div>
          <details className="rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-muted-surface)]">
            <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-[var(--omlu-text-primary)]">Advanced / Troubleshooting</summary>
            <div className="space-y-2 border-t border-[var(--omlu-border)] px-4 py-4 text-xs leading-5 text-[var(--omlu-text-secondary)]">
              <p>The Windows bridge runs locally at <code className="font-mono">127.0.0.1:24242</code> and supports Windows RAW Spooler, Driver Spooler, TCP/LAN, and Bluetooth COM transports.</p>
              <p>Browser printing remains available when the bridge is offline. The developer / hardware test package requires Node.js v18+ and uses <code className="font-mono">npm install --omit=dev &amp;&amp; npm start</code>.</p>
              <p>Thermal printers and the Android device must be connected to the same local network.</p>
              <p>Direct ESC/POS printing (IP address, port, paper width, and copies) is configured directly inside the Android app settings.</p>
              <p>Web admin does not store raw TCP printer IP addresses, ports, paper widths, or copy preferences.</p>
            </div>
          </details>
        </SettingsSection>

        <SettingsSection title="Appearance" description="Choose how OMLU Admin looks on this device.">
          <div className="max-w-md"><ThemeToggle /></div>
          <p className="text-xs text-[var(--omlu-text-secondary)]">Appearance is saved on this device immediately and is separate from restaurant settings.</p>
        </SettingsSection>

        <SettingsSection title="Legal &amp; Policies" description="Review the policies governing your restaurant account and use of OMLU.">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {LEGAL_LINKS.map((item) => <Link key={item.href} href={item.href} target="_blank" className="flex min-h-11 items-center justify-between rounded-xl border border-[var(--omlu-border)] px-4 py-3 text-sm font-bold text-[var(--omlu-text-primary)] hover:bg-[var(--omlu-muted-surface)]"><span>{item.label}</span><span aria-hidden="true">↗</span></Link>)}
          </div>
        </SettingsSection>

      </form>
    </div>
  );
}

const controlClass = "min-h-11 w-full min-w-0 rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-muted-surface)] px-4 py-2.5 text-sm font-semibold text-[var(--omlu-text-primary)] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 disabled:cursor-not-allowed";
const primaryLinkClass = "inline-flex min-h-10 w-full items-center justify-center rounded-xl bg-orange-600 px-3 py-2 text-center text-xs font-black text-white hover:bg-orange-700";
const secondaryLinkClass = "inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-[var(--omlu-border-strong)] px-3 py-2 text-center text-xs font-black text-[var(--omlu-text-primary)] hover:bg-[var(--omlu-hover-background)]";

function SettingsSection({ id, title, description, children }: { id?: string; title: string; description: string; children: ReactNode }) {
  const headingId = `${id || title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-heading`;
  return <section id={id} aria-labelledby={headingId} className="min-w-0 space-y-5 rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-5 shadow-sm sm:p-6"><div><h2 id={headingId} className="text-lg font-black text-[var(--omlu-text-primary)]">{title}</h2><p className="mt-1 text-sm text-[var(--omlu-text-secondary)]">{description}</p></div>{children}</section>;
}

function Field({ label, htmlFor, help, children }: { label: string; htmlFor: string; help?: ReactNode; children: ReactNode }) {
  return <div className="min-w-0"><label htmlFor={htmlFor} className="block text-sm font-bold text-[var(--omlu-text-primary)]">{label}</label><div className="mt-2">{children}</div>{help && <p className="mt-2 text-xs leading-5 text-[var(--omlu-text-secondary)]">{help}</p>}</div>;
}

function SettingsInput({ id, label, value, onChange, maxLength, required, disabled }: { id: string; label: string; value: string; onChange: (value: string) => void; maxLength?: number; required?: boolean; disabled?: boolean }) {
  return <Field label={label} htmlFor={id}><input id={id} value={value} onChange={(event) => onChange(event.target.value)} maxLength={maxLength} required={required} disabled={disabled} className={controlClass} /></Field>;
}

function SummaryItem({ label, value, mono, status, className = "" }: { label: string; value: string; mono?: boolean; status?: "positive" | "neutral"; className?: string }) {
  return <div className={`min-w-0 ${className}`}><p className="text-xs font-bold uppercase tracking-wide text-[var(--omlu-text-secondary)]">{label}</p>{status ? <span className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${status === "positive" ? "border-emerald-600/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "border-[var(--omlu-border-strong)] text-[var(--omlu-text-secondary)]"}`}>{value}</span> : <p className={`mt-1 break-words text-sm font-semibold leading-6 text-[var(--omlu-text-primary)] ${mono ? "font-mono" : ""}`}>{value}</p>}</div>;
}

function SwitchRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <div className="flex min-w-0 items-start justify-between gap-4 rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-muted-surface)] p-4"><div className="min-w-0"><p className="text-sm font-bold text-[var(--omlu-text-primary)]">{label}</p><p className="mt-1 text-xs leading-5 text-[var(--omlu-text-secondary)]">{description}</p></div><button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={`relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500 ${checked ? "bg-orange-600" : "bg-[var(--omlu-border-strong)]"}`}><span className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} /></button></div>;
}

function TaxModeCard({ value, selected, onChange, title, description }: { value: "inclusive" | "exclusive"; selected: boolean; onChange: (value: "inclusive" | "exclusive") => void; title: string; description: string }) {
  return <label className={`flex cursor-pointer gap-3 rounded-xl border p-4 ${selected ? "border-orange-500 bg-orange-500/10" : "border-[var(--omlu-border)] bg-[var(--omlu-muted-surface)]"}`}><input type="radio" name="tax-mode" value={value} checked={selected} onChange={() => onChange(value)} className="mt-0.5 h-4 w-4 accent-orange-600" /><span><span className="block text-sm font-bold text-[var(--omlu-text-primary)]">{title}</span><span className="mt-1 block text-xs text-[var(--omlu-text-secondary)]">{description}</span></span></label>;
}

function KitchenModeCard({ value, selected, onChange, title, description }: { value: "kds" | "direct_print"; selected: boolean; onChange: (value: "kds" | "direct_print") => void; title: string; description: string }) {
  return <label data-selected={selected} className={`flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors ${selected ? "border-orange-500 bg-orange-500/10 ring-2 ring-orange-500/20" : "border-[var(--omlu-border)] bg-[var(--omlu-muted-surface)] hover:border-[var(--omlu-border-strong)]"}`}><input type="radio" name="kitchen-mode" value={value} checked={selected} onChange={() => onChange(value)} className="mt-0.5 h-5 w-5 shrink-0 accent-orange-600" /><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-3"><span className="block text-sm font-bold text-[var(--omlu-text-primary)]">{title}</span>{selected && <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-600 text-xs font-black text-white">✓</span>}</span><span className="mt-1 block text-xs leading-5 text-[var(--omlu-text-secondary)]">{description}</span></span><span className="sr-only">{selected ? "Selected" : "Not selected"}</span></label>;
}

function InfoCard({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <div className="flex min-w-0 flex-col gap-4 rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-muted-surface)] p-4"><div className="flex-1"><h3 className="text-sm font-black text-[var(--omlu-text-primary)]">{title}</h3><p className="mt-1 text-xs leading-5 text-[var(--omlu-text-secondary)]">{description}</p></div>{children}</div>;
}

function BridgeStatus({ status }: { status: "checking" | "connected" | "disconnected" }) {
  const label = status === "checking" ? "Checking…" : status === "connected" ? "Connected" : "Not connected";
  return <span role="status" className={`w-fit rounded-full border px-3 py-1 text-xs font-bold ${status === "connected" ? "border-emerald-600/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "border-[var(--omlu-border-strong)] text-[var(--omlu-text-secondary)]"}`}>{label}</span>;
}
