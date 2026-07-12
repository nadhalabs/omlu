"use client";

import { useEffect, useState, useCallback } from "react";
import { getRestaurantSettings, updateRestaurantSettings, ApiError } from "@/lib/api";
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

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getRestaurantSettings();
      setSettings(data);
      setTimezone(data.timezone);
      setOrderPrefix(data.order_prefix);
      setServiceRequestsEnabled(data.service_requests_enabled);
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
      };
      const updated = await updateRestaurantSettings(updateData);
      setSettings(updated);
      setTimezone(updated.timezone);
      setOrderPrefix(updated.order_prefix);
      setServiceRequestsEnabled(updated.service_requests_enabled);
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
          <div className="w-10 h-10 border-t-2 border-b-2 border-amber-500 rounded-full animate-spin" />
          <p className="text-zinc-400 font-semibold text-sm">Loading settings…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-black text-white">Restaurant Settings</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Only owners can modify settings. Changes apply immediately.
        </p>
      </div>

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
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex flex-col gap-6">

        {/* Timezone */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
            Timezone
          </label>
          <p className="text-zinc-500 text-xs">
            Used for dashboard metrics and daily revenue calculations.
          </p>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500"
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
          <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
            Currency
          </label>
          <p className="text-zinc-500 text-xs">
            INR is the only supported currency for this MVP.
          </p>
          <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-4 py-2.5 text-zinc-400 text-sm font-semibold">
            {settings?.currency || "INR"} (Indian Rupee ₹)
          </div>
        </div>

        {/* Order Prefix */}
        <div className="flex flex-col gap-2">
          <label
            htmlFor="order-prefix"
            className="text-xs font-bold text-zinc-400 uppercase tracking-wider"
          >
            Order Number Prefix
          </label>
          <p className="text-zinc-500 text-xs">
            2–6 uppercase letters/numbers. Orders will appear as:{" "}
            <strong className="text-amber-500">
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
            className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm font-semibold uppercase focus:outline-none focus:ring-2 focus:ring-amber-500 w-40"
          />
        </div>

        {/* Service Requests Toggle */}
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              Customer Service Requests
            </label>
            <p className="text-zinc-500 text-xs mt-1">
              When enabled, customers can send waiter / water / bill requests from the tracking page.
            </p>
          </div>
          <button
            id="toggle-service-requests"
            type="button"
            onClick={() => setServiceRequestsEnabled(!serviceRequestsEnabled)}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-amber-500 shrink-0 mt-1 cursor-pointer ${
              serviceRequestsEnabled ? "bg-amber-600" : "bg-zinc-700"
            }`}
            aria-label={`Service requests ${serviceRequestsEnabled ? "enabled" : "disabled"}`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
                serviceRequestsEnabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {/* Save Button */}
        <div className="flex items-center gap-4 pt-2 border-t border-zinc-800">
          <button
            id="save-settings-btn"
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold rounded-xl transition cursor-pointer"
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
                setError(null);
                setSuccess(null);
              }
            }}
            className="text-sm text-zinc-500 hover:text-zinc-300 transition font-semibold cursor-pointer"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
