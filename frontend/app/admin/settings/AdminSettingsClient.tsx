"use client";

import { useEffect, useState, useCallback } from "react";
import { getRestaurantSettings, updateRestaurantSettings, ApiError } from "@/lib/api";
import { RestaurantSettingsResponse, RestaurantSettingsUpdate } from "@/lib/types";
import { ThemeToggle } from "@/components/ThemeToggle";

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

export default function AdminSettingsClient() {
  const [settings, setSettings] = useState<RestaurantSettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Editable form state
  const [timezone, setTimezone] = useState("");
  const [orderPrefix, setOrderPrefix] = useState("");
  const [serviceRequestsEnabled, setServiceRequestsEnabled] = useState(true);
  const [gstEnabled, setGstEnabled] = useState(false);
  const [gstin, setGstin] = useState("");
  const [legalBusinessName, setLegalBusinessName] = useState("");
  const [billingAddress, setBillingAddress] = useState("");
  const [gstStateName, setGstStateName] = useState("");
  const [gstStateCode, setGstStateCode] = useState("");
  const [gstRate, setGstRate] = useState("0.00");
  const [taxMode, setTaxMode] = useState<"inclusive" | "exclusive">("exclusive");
  const [invoicePrefix, setInvoicePrefix] = useState("INV");

  const applySettings = (data: RestaurantSettingsResponse) => {
    setSettings(data);
    setTimezone(data.timezone);
    setOrderPrefix(data.order_prefix);
    setServiceRequestsEnabled(data.service_requests_enabled);
    setGstEnabled(data.gst_enabled);
    setGstin(data.gstin || "");
    setLegalBusinessName(data.legal_business_name || "");
    setBillingAddress(data.registered_billing_address || "");
    setGstStateName(data.gst_state_name || "");
    setGstStateCode(data.gst_state_code || "");
    setGstRate(data.default_gst_rate);
    setTaxMode(data.tax_mode);
    setInvoicePrefix(data.invoice_prefix);
  };

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getRestaurantSettings();
      applySettings(data);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Could not load settings.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => loadSettings(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadSettings]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updateData: RestaurantSettingsUpdate = {
        timezone: timezone || undefined,
        order_prefix: orderPrefix.toUpperCase() || undefined,
        service_requests_enabled: serviceRequestsEnabled,
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
      const updated = await updateRestaurantSettings(updateData);
      applySettings(updated);
      setSuccess("Settings saved successfully.");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to save settings.");
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-t-2 border-b-2 border-orange-500 rounded-full animate-spin" />
          <p className="text-[var(--omlu-text-secondary)] font-semibold text-sm">Loading settings…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-black text-[var(--omlu-text-primary)]">Restaurant Settings</h1>
        <p className="text-[var(--omlu-text-secondary)] text-sm mt-1">
          Only owners can modify settings. Changes apply immediately.
        </p>
      </div>

      <section className="rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-6" aria-labelledby="appearance-heading">
        <h2 id="appearance-heading" className="text-lg font-black text-[var(--omlu-text-primary)]">Appearance</h2>
        <p className="mb-4 mt-1 text-xs text-[var(--omlu-text-secondary)]">Choose how OMLU Admin looks on this device.</p>
        <ThemeToggle />
      </section>

      {/* Error / Success Banner */}
      {error && (
        <div className="bg-red-950/20 border border-red-800/40 text-red-400 rounded-xl px-4 py-3 text-sm font-semibold">
          ⚠️ {error}
        </div>
      )}
      {success && (
        <div className="bg-emerald-950/20 border border-emerald-700/40 text-emerald-400 rounded-xl px-4 py-3 text-sm font-semibold">
          ✓ {success}
        </div>
      )}

      {/* Form */}
      <div className="bg-[var(--omlu-primary-surface)] border border-[var(--omlu-border)] rounded-2xl p-6 flex flex-col gap-6">

        {/* Timezone */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold text-[var(--omlu-text-secondary)] uppercase tracking-wider">
            Timezone
          </label>
          <p className="text-[var(--omlu-text-secondary)] text-xs">
            Used for dashboard metrics and daily revenue calculations.
          </p>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="bg-[var(--omlu-muted-surface)] border border-[var(--omlu-border)] rounded-xl px-4 py-2.5 text-[var(--omlu-text-primary)] text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
            {/* Allow current value if not in list */}
            {timezone && !TIMEZONES.includes(timezone) && (
              <option value={timezone}>{timezone}</option>
            )}
          </select>
        </div>

        {/* Currency (read-only for MVP) */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold text-[var(--omlu-text-secondary)] uppercase tracking-wider">
            Currency
          </label>
          <p className="text-[var(--omlu-text-secondary)] text-xs">
            INR is the only supported currency for this MVP.
          </p>
          <div className="bg-[var(--omlu-muted-surface)] border border-[var(--omlu-border)] rounded-xl px-4 py-2.5 text-[var(--omlu-text-secondary)] text-sm font-semibold">
            {settings?.currency || "INR"} (Indian Rupee ₹)
          </div>
        </div>

        {/* Order Prefix */}
        <div className="flex flex-col gap-2">
          <label
            htmlFor="order-prefix"
            className="text-xs font-bold text-[var(--omlu-text-secondary)] uppercase tracking-wider"
          >
            Order Number Prefix
          </label>
          <p className="text-[var(--omlu-text-secondary)] text-xs">
            2–6 uppercase letters/numbers. Orders will appear as:{" "}
            <strong className="text-orange-500">
              {(orderPrefix || "NS").toUpperCase()}-20260712-0001
            </strong>
          </p>
          <input
            id="order-prefix"
            type="text"
            value={orderPrefix}
            onChange={(e) => setOrderPrefix(e.target.value.toUpperCase())}
            maxLength={6}
            placeholder="NS"
            className="bg-[var(--omlu-muted-surface)] border border-[var(--omlu-border)] rounded-xl px-4 py-2.5 text-[var(--omlu-text-primary)] text-sm font-semibold uppercase focus:outline-none focus:ring-2 focus:ring-orange-500 w-40"
          />
        </div>

        {/* Service Requests Toggle */}
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <label className="text-xs font-bold text-[var(--omlu-text-secondary)] uppercase tracking-wider">
              Customer Service Requests
            </label>
            <p className="text-[var(--omlu-text-secondary)] text-xs mt-1">
              When enabled, customers can request a waiter, water, or assistance from their table.
            </p>
          </div>
          <button
            id="toggle-service-requests"
            type="button"
            onClick={() => setServiceRequestsEnabled(!serviceRequestsEnabled)}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-orange-500 shrink-0 mt-1 cursor-pointer ${
              serviceRequestsEnabled ? "bg-orange-600" : "bg-[var(--omlu-muted-surface)]"
            }`}
            aria-label={`Service requests ${serviceRequestsEnabled ? "enabled" : "disabled"}`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-[var(--omlu-primary-surface)] shadow transition-transform duration-200 ${
                serviceRequestsEnabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        <section className="flex flex-col gap-5 border-t border-[var(--omlu-border)] pt-6">
          <div>
            <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">Billing &amp; GST</h2>
            <p className="mt-1 text-xs text-[var(--omlu-text-secondary)]">GST is calculated only by the backend when a bill is generated.</p>
          </div>
          <label className="flex items-center justify-between gap-4">
            <span className="text-sm font-bold text-[var(--omlu-text-secondary)]">GST enabled</span>
            <input type="checkbox" checked={gstEnabled} onChange={(event) => setGstEnabled(event.target.checked)} className="h-5 w-5 accent-orange-600" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <SettingsInput label="GSTIN" value={gstin} onChange={(value) => setGstin(value.toUpperCase())} maxLength={15} required={gstEnabled} />
            <SettingsInput label="Legal business name" value={legalBusinessName} onChange={setLegalBusinessName} required={gstEnabled} />
            <SettingsInput label="State name" value={gstStateName} onChange={setGstStateName} required={gstEnabled} />
            <SettingsInput label="State code" value={gstStateCode} onChange={setGstStateCode} maxLength={2} required={gstEnabled} />
            <SettingsInput label="Default GST rate (%)" value={gstRate} onChange={setGstRate} inputMode="decimal" required={gstEnabled} />
            <SettingsInput label="Invoice prefix" value={invoicePrefix} onChange={(value) => setInvoicePrefix(value.toUpperCase())} maxLength={10} required />
          </div>
          <label className="flex flex-col gap-2 text-xs font-bold uppercase tracking-wider text-[var(--omlu-text-secondary)]">
            Tax mode
            <select value={taxMode} onChange={(event) => setTaxMode(event.target.value as "inclusive" | "exclusive")} className="rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-muted-surface)] px-4 py-2.5 text-sm font-semibold normal-case text-[var(--omlu-text-primary)]">
              <option value="exclusive">Exclusive — GST added to menu prices</option>
              <option value="inclusive">Inclusive — GST included in menu prices</option>
            </select>
          </label>
          <label className="flex flex-col gap-2 text-xs font-bold uppercase tracking-wider text-[var(--omlu-text-secondary)]">
            Registered billing address
            <textarea value={billingAddress} onChange={(event) => setBillingAddress(event.target.value)} required={gstEnabled} rows={3} className="rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-muted-surface)] px-4 py-2.5 text-sm font-semibold normal-case text-[var(--omlu-text-primary)]" />
          </label>
        </section>

        {/* Printing Section */}
        <section id="printing" className="flex flex-col gap-4 border-t border-[var(--omlu-border)] pt-6">
          <div>
            <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">Printing</h2>
            <p className="mt-1 text-xs font-semibold text-[var(--omlu-text-secondary)]">
              Browser printing uses your system print dialog.
            </p>
            <p className="mt-0.5 text-xs font-semibold text-[var(--omlu-text-secondary)]">
              Direct LAN thermal printing is configured locally in the OMLU Operations Android app.
            </p>
            <p className="mt-0.5 text-xs font-semibold text-orange-500">
              🖥️ Windows PCs use the local OMLU Print Bridge for direct USB, TCP/LAN, and Bluetooth COM printing.
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-muted-surface)] p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-black text-[var(--omlu-text-primary)]">🖥️ OMLU Desktop Print Bridge (Windows)</h3>
                <p className="text-xs text-[var(--omlu-text-secondary)] mt-0.5">
                  Direct thermal-printer bridge running on <code className="font-mono text-orange-500">127.0.0.1:24242</code>.
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-amber-950/40 border border-amber-700/60 px-3 py-1 text-xs font-bold text-amber-400">
                ● Not detected
              </span>
            </div>

            <div className="text-xs text-[var(--omlu-text-secondary)] flex flex-col gap-1.5 border-t border-[var(--omlu-border)] pt-3">
              <p>• Supported Transports: Windows RAW Spooler, Windows Driver Spooler, TCP/LAN Network Printers, Bluetooth Serial COM Ports.</p>
              <p>• Emergency Fallback: Standard browser print dialog remains available if the bridge is offline or uninstalled.</p>
              <p>• Developer / Hardware Test Package: Requires Node.js v18+ on target PC. Run <code className="font-mono text-orange-400">npm install --omit=dev && npm start</code> inside extracted archive.</p>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-muted-surface)] p-4 text-xs text-[var(--omlu-text-secondary)] flex flex-col gap-2">
            <p>• Thermal printers and the Android device must be connected to the same local network.</p>
            <p>• Direct ESC/POS printing (IP address, port, paper width, and copies) is configured directly inside the Android app settings.</p>
            <p>• Web admin does not store raw TCP printer IP addresses, ports, paper widths, or copy preferences.</p>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <a
              href="/downloads/omlu-print-bridge-developer-package.zip"
              download
              className="px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-black rounded-xl transition inline-flex items-center gap-2"
            >
              🖥️ Download Windows Bridge (Developer / Hardware Test Package)
            </a>
            <a
              href="/downloads/omlu.apk"
              download
              className="px-4 py-2.5 border border-[var(--omlu-border)] hover:bg-[var(--omlu-muted-surface)] text-[var(--omlu-text-primary)] text-xs font-bold rounded-xl transition inline-flex items-center gap-2"
            >
              📱 Download Operations App
            </a>
          </div>
        </section>

        {/* Save Button */}
        <div className="flex items-center gap-4 pt-2 border-t border-[var(--omlu-border)]">
          <button
            id="save-settings-btn"
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-[var(--omlu-primary-action-text)] font-bold rounded-xl transition cursor-pointer"
          >
            {saving ? "Saving…" : "Save Settings"}
          </button>
          <button
            type="button"
            onClick={() => {
              if (settings) {
                setTimezone(settings.timezone);
                setOrderPrefix(settings.order_prefix);
                setServiceRequestsEnabled(settings.service_requests_enabled);
                applySettings(settings);
                setError(null);
                setSuccess(null);
              }
            }}
            className="text-sm text-[var(--omlu-text-secondary)] hover:text-[var(--omlu-text-secondary)] transition font-semibold cursor-pointer"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingsInput({ label, value, onChange, maxLength, required, inputMode }: { label: string; value: string; onChange: (value: string) => void; maxLength?: number; required?: boolean; inputMode?: "text" | "decimal" }) {
  return (
    <label className="flex flex-col gap-2 text-xs font-bold uppercase tracking-wider text-[var(--omlu-text-secondary)]">
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} maxLength={maxLength} required={required} inputMode={inputMode} className="rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-muted-surface)] px-4 py-2.5 text-sm font-semibold normal-case text-[var(--omlu-text-primary)]" />
    </label>
  );
}
