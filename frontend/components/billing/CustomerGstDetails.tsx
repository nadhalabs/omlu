"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

export type CustomerGstValue = {
  gstin: string;
  businessName: string;
};

type Props = {
  value: CustomerGstValue | null;
  editable: boolean;
  disabled?: boolean;
  onSave: (value: CustomerGstValue) => Promise<void> | void;
  onRemove: () => Promise<void> | void;
};

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function CustomerGstDetails({ value, editable, disabled = false, onSave, onRemove }: Props) {
  const [open, setOpen] = useState(false);
  const [gstin, setGstin] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const timeout = window.setTimeout(() => dialogRef.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { window.clearTimeout(timeout); window.removeEventListener("keydown", onKeyDown); };
  }, [open, saving]);

  function openDialog() {
    setGstin(value?.gstin ?? "");
    setBusinessName(value?.businessName ?? "");
    setError(null);
    setOpen(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const normalizedGstin = gstin.trim().toUpperCase();
    const normalizedName = businessName.trim();
    if (!GSTIN_PATTERN.test(normalizedGstin)) {
      setError("Enter a valid 15-character GSTIN, for example 33AAAAA0000A1Z5.");
      return;
    }
    if (!normalizedName) {
      setError("Business Name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ gstin: normalizedGstin, businessName: normalizedName });
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save customer GST details.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    setError(null);
    try {
      await onRemove();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove customer GST details.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="mt-4 rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-muted-surface)] p-3">
    {value ? <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-black text-emerald-700 dark:text-emerald-400">Customer GST added · {value.gstin.slice(0, 7)}…</p>
        <p className="mt-1 truncate text-xs text-[var(--omlu-text-secondary)]">{value.businessName}</p>
      </div>
      {editable && <button type="button" disabled={disabled} onClick={openDialog} className="rounded-lg border border-[var(--omlu-border-strong)] px-3 py-2 text-xs font-black disabled:opacity-50">Edit GST Details</button>}
    </div> : editable ? <button type="button" disabled={disabled} onClick={openDialog} className="rounded-lg border border-orange-500 px-3 py-2 text-xs font-black text-orange-700 dark:text-orange-300 disabled:opacity-50">Add Customer GST Details</button> : null}

    {open && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-3 sm:items-center" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setOpen(false); }}>
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="customer-gst-title" className="w-full max-w-md rounded-2xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] p-5 text-[var(--omlu-text-primary)] shadow-2xl outline-none">
        <div className="flex items-start justify-between gap-3"><div><h2 id="customer-gst-title" className="text-xl font-black">Customer GST Details</h2><p className="mt-1 text-sm text-[var(--omlu-text-secondary)]">Add these only when the customer wants business details on the invoice.</p></div><button type="button" aria-label="Close customer GST details" disabled={saving} onClick={() => setOpen(false)} className="h-10 w-10 rounded-lg text-xl">×</button></div>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <label className="block text-sm font-bold">GSTIN<input autoFocus value={gstin} onChange={(event) => setGstin(event.target.value.toUpperCase())} maxLength={15} autoComplete="off" placeholder="33AAAAA0000A1Z5" className="mt-2 h-12 w-full rounded-xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-muted-surface)] px-3 font-mono uppercase outline-none focus:border-orange-500" /></label>
          <label className="block text-sm font-bold">Business Name<input value={businessName} onChange={(event) => setBusinessName(event.target.value)} maxLength={255} placeholder="Customer's registered business name" className="mt-2 h-12 w-full rounded-xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-muted-surface)] px-3 outline-none focus:border-orange-500" /></label>
          {error && <p role="alert" className="rounded-lg bg-red-950/20 p-3 text-sm font-bold text-red-600 dark:text-red-300">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2">{value && <button type="button" disabled={saving} onClick={() => void remove()} className="mr-auto rounded-xl border border-red-600 px-4 py-3 text-sm font-black text-red-600 disabled:opacity-50">Remove GST Details</button>}<button type="button" disabled={saving} onClick={() => setOpen(false)} className="rounded-xl border border-[var(--omlu-border-strong)] px-4 py-3 text-sm font-bold">Cancel</button><button type="submit" disabled={saving} className="rounded-xl bg-orange-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50">{saving ? "Saving…" : "Save GST Details"}</button></div>
        </form>
      </div>
    </div>}
  </div>;
}
