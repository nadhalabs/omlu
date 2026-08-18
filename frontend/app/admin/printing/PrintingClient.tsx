"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useOmluUi } from "@/components/OmluUiProvider";
import {
  BridgeDiagnostics,
  BridgeHealth,
  PrinterProfile,
  RecentJobRecord,
  addPrinterProfile,
  checkBridgeHealth,
  completeLocalPairing,
  createLocalPairingCode,
  deletePrinterProfile,
  discoverPrinters,
  fetchBridgeDiagnostics,
  fetchRecentBridgeJobs,
  setDefaultPrinterProfile,
  testPrinterProfile,
  updatePrinterProfile,
} from "@/lib/print_bridge";
import {
  confirmBridgePairing,
  createPairingChallenge,
  exchangeBridgeCredential,
  getPrintBridgePublicKey,
  listBridgeInstallations,
  requestPrintBridgeToken,
} from "@/lib/api";
import { printIssuedBill } from "@/lib/print_service";

type Tab = "all" | "billing" | "kitchen" | "recent_jobs";

export default function PrintingClient() {
  const { confirm: confirmDialog, toast } = useOmluUi();
  const [bridge, setBridge] = useState<BridgeHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [profiles, setProfiles] = useState<PrinterProfile[]>([]);
  const [recentJobs, setRecentJobs] = useState<RecentJobRecord[]>([]);
  const [diagnostics, setDiagnostics] = useState<BridgeDiagnostics | null>(null);

  // Modals & Drawers
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDiagnosticsModal, setShowDiagnosticsModal] = useState(false);
  const [showPairingModal, setShowPairingModal] = useState(false);

  // Add / Edit Printer Form State
  const [editingProfile, setEditingProfile] = useState<PrinterProfile | null>(null);
  const [formName, setFormName] = useState("");
  const [formPurpose, setFormPurpose] = useState<"billing" | "kitchen">("billing");
  const [formTransport, setFormTransport] = useState<"tcp_lan" | "windows_raw_spooler">("tcp_lan");
  const [formHost, setFormHost] = useState("");
  const [formPort, setFormPort] = useState("9100");
  const [formQueueName, setFormQueueName] = useState("POS58");
  const [formPaperWidth, setFormPaperWidth] = useState<"58" | "80">("80");
  const [formIsDefault, setFormIsDefault] = useState(true);
  const [savingPrinter, setSavingPrinter] = useState(false);

  // Discovery State
  const [discovering, setDiscovering] = useState(false);
  const [discoveredList, setDiscoveredList] = useState<Array<{ id: string; name: string; host?: string; port?: number; transport: string }>>([]);

  // Pairing Flow State
  const [pairingStep, setPairingStep] = useState<"idle" | "code" | "pairing" | "complete">("idle");
  const [pairingCode, setPairingCode] = useState("");
  const [pairingError, setPairingError] = useState<string | null>(null);

  // Busy/Testing state
  const [busyPrinters, setBusyPrinters] = useState<Record<string, string>>({});

  const setPrinterBusy = (id: string, label?: string) => {
    setBusyPrinters((prev) => {
      const next = { ...prev };
      if (label) next[id] = label;
      else delete next[id];
      return next;
    });
  };

  const load = useCallback(async () => {
    try {
      const health = await checkBridgeHealth();
      setBridge(health);
      if (health) {
        setProfiles(health.printers || []);
        const jobs = await fetchRecentBridgeJobs();
        setRecentJobs(jobs);
      } else {
        setProfiles([]);
        setRecentJobs([]);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not communicate with Printer Bridge.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    const interval = window.setInterval(() => void load(), 10000);
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, [load]);

  // Open Add Printer Modal
  const openAddModal = (purpose: "billing" | "kitchen" = "billing") => {
    setEditingProfile(null);
    setFormName(purpose === "billing" ? "Counter Billing Printer" : "Main Kitchen Printer");
    setFormPurpose(purpose);
    setFormTransport("tcp_lan");
    setFormHost("");
    setFormPort("9100");
    setFormQueueName("POS58");
    setFormPaperWidth("80");
    setFormIsDefault(true);
    setDiscoveredList([]);
    setShowAddModal(true);
  };

  // Open Edit Printer Modal
  const openEditModal = (profile: PrinterProfile) => {
    setEditingProfile(profile);
    setFormName(profile.name);
    setFormPurpose(profile.purpose);
    setFormTransport(profile.transport === "windows_raw_spooler" ? "windows_raw_spooler" : "tcp_lan");
    setFormHost(profile.host || "");
    setFormPort(String(profile.port || 9100));
    setFormQueueName(profile.queueName || "POS58");
    setFormPaperWidth(profile.paperWidth || "80");
    setFormIsDefault(profile.is_default);
    setShowAddModal(true);
  };

  // Save Printer Profile (Add / Edit)
  const handleSavePrinter = async () => {
    if (!formName.trim()) {
      toast("Please enter a printer name.", "error");
      return;
    }
    if (formTransport === "tcp_lan" && !formHost.trim()) {
      toast("Please enter a valid IP address or host.", "error");
      return;
    }

    setSavingPrinter(true);
    try {
      const payload: Partial<PrinterProfile> = {
        name: formName.trim(),
        purpose: formPurpose,
        transport: formTransport,
        host: formHost.trim() || undefined,
        port: Number(formPort) || 9100,
        queueName: formQueueName.trim() || undefined,
        paperWidth: formPaperWidth,
        enabled: true,
        is_default: formIsDefault,
      };

      if (editingProfile) {
        const res = await updatePrinterProfile(editingProfile.id, payload);
        if (res.success) {
          toast("Printer updated successfully.", "success");
          setShowAddModal(false);
          await load();
        } else {
          toast(res.error || "Could not update printer.", "error");
        }
      } else {
        const res = await addPrinterProfile(payload);
        if (res.success) {
          toast("Printer added successfully.", "success");
          setShowAddModal(false);
          await load();
        } else {
          toast(res.error || "Could not add printer.", "error");
        }
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to save printer.", "error");
    } finally {
      setSavingPrinter(false);
    }
  };

  // Run Printer Discovery
  const handleDiscover = async () => {
    setDiscovering(true);
    try {
      const results = await discoverPrinters();
      setDiscoveredList(results);
      if (results.length === 0) {
        toast("No printers discovered on local network. Enter IP manually.", "information");
      } else {
        toast(`Discovered ${results.length} printer(s).`, "success");
      }
    } catch {
      toast("Printer discovery failed. Enter IP manually.", "error");
    } finally {
      setDiscovering(false);
    }
  };

  // Select Discovered Printer
  const selectDiscovered = (item: { name: string; host?: string; port?: number }) => {
    setFormName(item.name);
    if (item.host) setFormHost(item.host);
    if (item.port) setFormPort(String(item.port));
    toast(`Selected ${item.name}`, "information");
  };

  // Test Print Profile
  const handleTestPrint = async (profile: PrinterProfile) => {
    setPrinterBusy(profile.id, "Testing…");
    try {
      toast(`Sending test receipt to ${profile.name}…`, "information");
      const res = await testPrinterProfile(profile.id);
      if (res.success) {
        toast(`Test print successful on ${profile.name}!`, "success");
      } else {
        toast(res.error || `Test print failed on ${profile.name}.`, "error");
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Test print failed.", "error");
    } finally {
      setPrinterBusy(profile.id);
    }
  };

  // Set Default Printer
  const handleSetDefault = async (profile: PrinterProfile) => {
    setPrinterBusy(profile.id, "Updating…");
    try {
      const res = await setDefaultPrinterProfile(profile.id);
      if (res.success) {
        toast(`${profile.name} set as default ${profile.purpose} printer.`, "success");
        await load();
      } else {
        toast(res.error || "Could not set default printer.", "error");
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to update default printer.", "error");
    } finally {
      setPrinterBusy(profile.id);
    }
  };

  // Toggle Printer Enabled State
  const handleToggleEnabled = async (profile: PrinterProfile) => {
    setPrinterBusy(profile.id, "Updating…");
    try {
      const res = await updatePrinterProfile(profile.id, { enabled: !profile.enabled });
      if (res.success) {
        toast(`${profile.name} ${profile.enabled ? "disabled" : "enabled"}.`, "success");
        await load();
      } else {
        toast(res.error || "Could not toggle printer.", "error");
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to update printer.", "error");
    } finally {
      setPrinterBusy(profile.id);
    }
  };

  // Remove Printer
  const handleRemovePrinter = async (profile: PrinterProfile) => {
    const accepted = await confirmDialog({
      title: `Remove ${profile.name}?`,
      message: `Are you sure you want to remove this ${profile.purpose} printer profile?`,
      confirmLabel: "Remove Printer",
    });
    if (!accepted) return;

    setPrinterBusy(profile.id, "Removing…");
    try {
      const res = await deletePrinterProfile(profile.id);
      if (res.success) {
        toast("Printer removed.", "success");
        await load();
      } else {
        toast(res.error || "Could not remove printer.", "error");
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to remove printer.", "error");
    } finally {
      setPrinterBusy(profile.id);
    }
  };

  // Start Pairing Flow
  const handleStartPairing = async () => {
    setPairingStep("code");
    setPairingError(null);
    try {
      const res = await createLocalPairingCode();
      setPairingCode(res.pairing_code);
    } catch (err) {
      setPairingError(err instanceof Error ? err.message : "Could not generate pairing code.");
    }
  };

  // Confirm Pairing Flow
  const handleConfirmPairing = async () => {
    if (!pairingCode) return;
    setPairingStep("pairing");
    setPairingError(null);
    try {
      const instId = bridge?.installation_id || "inst_local";
      const confirmed = await confirmBridgePairing(instId, pairingCode);
      const ex = await exchangeBridgeCredential(confirmed.exchange_token);
      const pk = await getPrintBridgePublicKey();
      await completeLocalPairing({
        pairing_code: pairingCode,
        installation_id: ex.installation_id,
        tenant_id: ex.tenant_id,
        backend_url: confirmed.backend_url,
        backend_public_key_pem: pk.public_key_pem,
        credential_secret: ex.credential_secret,
      });
      setPairingStep("complete");
      toast("Printer Bridge paired successfully!", "success");
      setShowPairingModal(false);
      await load();
    } catch (err) {
      setPairingStep("code");
      setPairingError(err instanceof Error ? err.message : "Pairing failed.");
    }
  };

  // Open Diagnostics Modal
  const handleOpenDiagnostics = async () => {
    setShowDiagnosticsModal(true);
    try {
      const diag = await fetchBridgeDiagnostics();
      setDiagnostics(diag);
    } catch {
      setDiagnostics(null);
    }
  };

  // Copy Safe Diagnostics
  const handleCopyDiagnostics = () => {
    if (!diagnostics && !bridge) return;
    const text = JSON.stringify(diagnostics || bridge, null, 2);
    navigator.clipboard.writeText(text);
    toast("Diagnostics copied to clipboard.", "success");
  };

  // Retry Print Job
  const handleRetryJob = async (job: RecentJobRecord) => {
    if (!job.billNumber) {
      toast("Cannot retry job without bill number.", "error");
      return;
    }
    toast(`Retrying print for Bill ${job.billNumber}…`, "information");
    const res = await printIssuedBill({
      billNumber: job.billNumber,
      sessionToken: "staff_retry",
      receiptToken: "staff_retry",
    });
    if (res.success) {
      toast("Reprint job sent to bridge.", "success");
      await load();
    } else {
      toast(res.error || "Reprint failed.", "error");
    }
  };

  const visibleProfiles = profiles.filter((p) => {
    if (tab === "billing") return p.purpose === "billing";
    if (tab === "kitchen") return p.purpose === "kitchen";
    return true;
  });

  const billingPrinters = profiles.filter((p) => p.purpose === "billing");
  const kitchenPrinters = profiles.filter((p) => p.purpose === "kitchen");

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      {/* Page Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-black text-[var(--omlu-text-primary)]">🖨️ Printing & Thermal Hardware</h1>
          <p className="mt-1 text-sm text-[var(--omlu-text-secondary)]">
            Manage OMLU Printer Bridge, LAN thermal printers, and receipt routing across your restaurant.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleOpenDiagnostics}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] px-3.5 py-2 text-xs font-bold text-[var(--omlu-text-primary)] hover:bg-[var(--omlu-muted-surface)] transition"
          >
            📊 Diagnostics
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-orange-600 px-3.5 py-2 text-xs font-black text-white shadow-sm hover:bg-orange-500 transition"
          >
            ↻ Refresh Status
          </button>
        </div>
      </header>

      {/* Top Status Banner */}
      <section className="rounded-2xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${bridge?.paired ? "bg-emerald-500/10 text-emerald-600" : bridge ? "bg-amber-500/10 text-amber-600" : "bg-red-500/10 text-red-600"}`}>
              <span className="text-2xl">{bridge?.paired ? "✓" : bridge ? "⚠" : "✕"}</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">
                  {bridge?.paired ? "OMLU Printer Bridge Connected" : bridge ? "Printer Bridge Authorization Required" : "Printer Bridge Not Detected"}
                </h2>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-black ${bridge?.paired ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" : bridge ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300" : "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300"}`}>
                  {bridge?.paired ? "● ONLINE" : bridge ? "PAIRED REQUIRED" : "OFFLINE"}
                </span>
              </div>
              <p className="mt-1 text-xs text-[var(--omlu-text-secondary)]">
                {bridge
                  ? `Device: ${bridge.operating_system.toUpperCase()} · Bridge v${bridge.bridge_version} · Installation ID: ${bridge.installation_id || "Unpaired"}`
                  : "Install and run OMLU Printer Bridge on your Windows or Mac desktop computer."}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!bridge && (
              <>
                <a
                  href="/downloads/omlu-print-bridge-developer-package.zip"
                  download
                  className="rounded-xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] px-4 py-2.5 text-xs font-bold hover:bg-[var(--omlu-muted-surface)]"
                >
                  Download for Windows (.exe)
                </a>
                <a
                  href="/downloads/omlu-print-bridge-developer-package.zip"
                  download
                  className="rounded-xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] px-4 py-2.5 text-xs font-bold hover:bg-[var(--omlu-muted-surface)]"
                >
                  Download for macOS (.dmg)
                </a>
              </>
            )}
            {bridge && !bridge.paired && (
              <button
                type="button"
                onClick={() => {
                  setShowPairingModal(true);
                  void handleStartPairing();
                }}
                className="rounded-xl bg-orange-600 px-4 py-2.5 text-xs font-black text-white hover:bg-orange-500"
              >
                Pair Desktop Device
              </button>
            )}
            {bridge && bridge.paired && (
              <button
                type="button"
                onClick={() => openAddModal("billing")}
                className="rounded-xl bg-orange-600 px-4 py-2.5 text-xs font-black text-white hover:bg-orange-500 shadow-sm"
              >
                + Add Thermal Printer
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Onboarding State (when bridge or printers missing) */}
      {(!bridge || profiles.length === 0) && (
        <section className="rounded-2xl border border-dashed border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] p-8 text-[var(--omlu-text-primary)]">
          <h3 className="text-xl font-black">🚀 Production Print Setup Walkthrough</h3>
          <p className="mt-1 text-sm text-[var(--omlu-text-secondary)]">
            Follow these simple steps to set up direct thermal printing for your billing counter and kitchen.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className={`rounded-xl border p-4 ${bridge ? "border-emerald-500/50 bg-emerald-50/20 dark:bg-emerald-950/20" : "border-[var(--omlu-border-strong)] bg-[var(--omlu-muted-surface)]"}`}>
              <div className="text-xs font-black uppercase text-orange-600">Step 1</div>
              <h4 className="mt-1 font-black">1. Install Bridge App</h4>
              <p className="mt-1 text-xs text-[var(--omlu-text-secondary)]">Download and launch OMLU Printer Bridge on your restaurant PC or Mac.</p>
              {!bridge && (
                <div className="mt-3 flex flex-col gap-1.5">
                  <a href="/downloads/omlu-print-bridge-developer-package.zip" download className="rounded-lg bg-orange-600 px-3 py-1.5 text-center text-xs font-bold text-white hover:bg-orange-500">Download Package</a>
                </div>
              )}
              {bridge && <span className="mt-3 inline-block text-xs font-bold text-emerald-600">✓ App Installed</span>}
            </div>

            <div className={`rounded-xl border p-4 ${bridge?.paired ? "border-emerald-500/50 bg-emerald-50/20 dark:bg-emerald-950/20" : "border-[var(--omlu-border-strong)] bg-[var(--omlu-muted-surface)]"}`}>
              <div className="text-xs font-black uppercase text-orange-600">Step 2</div>
              <h4 className="mt-1 font-black">2. Connect Computer</h4>
              <p className="mt-1 text-xs text-[var(--omlu-text-secondary)]">Pair this computer securely with your OMLU restaurant account.</p>
              {bridge && !bridge.paired && (
                <button type="button" onClick={() => { setShowPairingModal(true); void handleStartPairing(); }} className="mt-3 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-orange-500">Pair Device</button>
              )}
              {bridge?.paired && <span className="mt-3 inline-block text-xs font-bold text-emerald-600">✓ Device Paired</span>}
            </div>

            <div className={`rounded-xl border p-4 ${profiles.length > 0 ? "border-emerald-500/50 bg-emerald-50/20 dark:bg-emerald-950/20" : "border-[var(--omlu-border-strong)] bg-[var(--omlu-muted-surface)]"}`}>
              <div className="text-xs font-black uppercase text-orange-600">Step 3</div>
              <h4 className="mt-1 font-black">3. Add Printers</h4>
              <p className="mt-1 text-xs text-[var(--omlu-text-secondary)]">Connect your LAN thermal printer IP addresses for Billing and Kitchen.</p>
              {bridge?.paired && (
                <button type="button" onClick={() => openAddModal("billing")} className="mt-3 rounded-lg border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] px-3 py-1.5 text-xs font-bold hover:border-orange-500">+ Add Printer</button>
              )}
            </div>

            <div className="rounded-xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-muted-surface)] p-4">
              <div className="text-xs font-black uppercase text-orange-600">Step 4</div>
              <h4 className="mt-1 font-black">4. Test Print</h4>
              <p className="mt-1 text-xs text-[var(--omlu-text-secondary)]">Send a test receipt to verify ESC/POS formatting and paper cut.</p>
              <span className="mt-3 inline-block text-xs font-medium text-[var(--omlu-text-secondary)]">Ready after adding printer</span>
            </div>
          </div>
        </section>
      )}

      {/* Tabs Filter */}
      <nav className="flex flex-wrap gap-2" aria-label="Printer section tabs">
        {([
          ["all", "All Printers", profiles.length],
          ["billing", "Billing Printers", billingPrinters.length],
          ["kitchen", "Kitchen Printers", kitchenPrinters.length],
          ["recent_jobs", "Recent Print Jobs", recentJobs.length],
        ] as const).map(([value, label, count]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`min-h-11 rounded-xl px-4 text-sm font-black transition ${tab === value ? "bg-orange-600 text-white shadow-sm" : "bg-[var(--omlu-muted-surface)] text-[var(--omlu-text-primary)] hover:bg-[var(--omlu-primary-surface)]"}`}
          >
            {label} ({count})
          </button>
        ))}
      </nav>

      {/* Main Content Area */}
      {tab !== "recent_jobs" ? (
        <section aria-labelledby="printers-heading">
          <h2 id="printers-heading" className="sr-only">Configured Printers</h2>
          {visibleProfiles.length === 0 ? (
            <div className="rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-10 text-center font-bold">
              No printers in this category. Click &ldquo;+ Add Thermal Printer&rdquo; to set up your billing or kitchen printer.
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2">
              {visibleProfiles.map((profile) => {
                const isBusy = Boolean(busyPrinters[profile.id]);
                return (
                  <article key={profile.id} className="rounded-2xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] p-5 shadow-sm transition hover:shadow-md">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${profile.purpose === "billing" ? "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300" : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"}`}>
                            {profile.purpose}
                          </span>
                          {profile.is_default && (
                            <span className="inline-flex rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                              DEFAULT {profile.purpose.toUpperCase()}
                            </span>
                          )}
                        </div>
                        <h3 className="mt-2 text-xl font-black text-[var(--omlu-text-primary)]">{profile.name}</h3>
                        <p className="mt-1 text-xs text-[var(--omlu-text-secondary)] font-mono">
                          {profile.transport === "tcp_lan" ? `${profile.host || "No IP"}:${profile.port || 9100}` : `Queue: ${profile.queueName || "Default"}`} · {profile.paperWidth}mm Paper
                        </p>
                      </div>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-black ${profile.enabled ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"}`}>
                        {profile.enabled ? "● ONLINE" : "○ DISABLED"}
                      </span>
                    </div>

                    <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[var(--omlu-border)] pt-4">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleTestPrint(profile)}
                        className="rounded-xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] px-3.5 py-2 text-xs font-black text-[var(--omlu-text-primary)] hover:bg-[var(--omlu-muted-surface)] disabled:opacity-50"
                      >
                        {busyPrinters[profile.id] || "🧪 Test Print"}
                      </button>
                      {!profile.is_default && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleSetDefault(profile)}
                          className="rounded-xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] px-3.5 py-2 text-xs font-bold hover:bg-[var(--omlu-muted-surface)] disabled:opacity-50"
                        >
                          Make Default
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => openEditModal(profile)}
                        className="rounded-xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] px-3.5 py-2 text-xs font-bold hover:bg-[var(--omlu-muted-surface)] disabled:opacity-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleToggleEnabled(profile)}
                        className="rounded-xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] px-3 py-2 text-xs font-bold text-[var(--omlu-text-secondary)] hover:bg-[var(--omlu-muted-surface)] disabled:opacity-50"
                      >
                        {profile.enabled ? "Disable" : "Enable"}
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleRemovePrinter(profile)}
                        className="ml-auto rounded-xl border border-red-900/40 bg-red-950/20 px-3 py-2 text-xs font-bold text-red-400 hover:bg-red-950/40 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : (
        /* Recent Jobs Tab */
        <section aria-labelledby="jobs-heading" className="rounded-2xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] p-5">
          <h2 id="jobs-heading" className="text-lg font-black text-[var(--omlu-text-primary)]">Recent Print Jobs</h2>
          {recentJobs.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--omlu-text-secondary)]">No recent print jobs recorded.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--omlu-border)] text-xs font-black uppercase text-[var(--omlu-text-secondary)]">
                    <th className="pb-3">Bill / Job ID</th>
                    <th className="pb-3">Type</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3">Time</th>
                    <th className="pb-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--omlu-border)]">
                  {recentJobs.map((job) => (
                    <tr key={job.jobId} className="hover:bg-[var(--omlu-muted-surface)]">
                      <td className="py-3 font-mono font-bold">{job.billNumber || job.jobId}</td>
                      <td className="py-3 capitalize text-[var(--omlu-text-secondary)]">{job.receiptType || "Bill"}</td>
                      <td className="py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-black ${job.state === "completed" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300"}`}>
                          {job.state.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 text-xs text-[var(--omlu-text-secondary)]">{new Date(job.createdAt).toLocaleTimeString()}</td>
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          onClick={() => void handleRetryJob(job)}
                          className="rounded-lg border border-[var(--omlu-border-strong)] px-3 py-1.5 text-xs font-bold hover:bg-[var(--omlu-primary-surface)]"
                        >
                          Retry Print
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Add / Edit Printer Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4" role="dialog" aria-modal="true" aria-labelledby="modal-printer-title">
          <div className="w-full max-w-lg rounded-2xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] p-6 text-[var(--omlu-text-primary)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--omlu-border)] pb-4">
              <h3 id="modal-printer-title" className="text-xl font-black">
                {editingProfile ? "Edit Printer Profile" : "+ Add Thermal Printer"}
              </h3>
              <button type="button" onClick={() => setShowAddModal(false)} className="text-xl font-bold text-[var(--omlu-text-secondary)] hover:text-[var(--omlu-text-primary)]">×</button>
            </div>

            {/* Discovery Section */}
            {!editingProfile && (
              <div className="mt-4 rounded-xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-muted-surface)] p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-black uppercase text-orange-600">Automatic Discovery</h4>
                    <p className="text-xs text-[var(--omlu-text-secondary)]">Search local LAN network or OS installed printers.</p>
                  </div>
                  <button type="button" disabled={discovering} onClick={() => void handleDiscover()} className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-orange-500 disabled:opacity-50">
                    {discovering ? "Searching…" : "Find Printers"}
                  </button>
                </div>
                {discoveredList.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {discoveredList.map((item) => (
                      <button key={item.id} type="button" onClick={() => selectDiscovered(item)} className="flex w-full items-center justify-between rounded-lg border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] p-2 text-left text-xs font-bold hover:border-orange-500">
                        <span>{item.name} {item.host ? `(${item.host})` : ""}</span>
                        <span className="text-orange-600 underline">Use Printer</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <form onSubmit={(e) => { e.preventDefault(); void handleSavePrinter(); }} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-[var(--omlu-text-secondary)]">Printer Name</label>
                <input required value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Counter Billing Printer" className="mt-1 h-11 w-full rounded-xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-muted-surface)] px-3 text-sm font-bold text-[var(--omlu-text-primary)] outline-none focus:border-orange-500" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[var(--omlu-text-secondary)]">Printer Purpose</label>
                  <select value={formPurpose} onChange={(e) => setFormPurpose(e.target.value as "billing" | "kitchen")} className="mt-1 h-11 w-full rounded-xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-muted-surface)] px-3 text-sm font-bold text-[var(--omlu-text-primary)] outline-none focus:border-orange-500">
                    <option value="billing">Billing Printer</option>
                    <option value="kitchen">Kitchen Printer</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[var(--omlu-text-secondary)]">Paper Width</label>
                  <select value={formPaperWidth} onChange={(e) => setFormPaperWidth(e.target.value as "58" | "80")} className="mt-1 h-11 w-full rounded-xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-muted-surface)] px-3 text-sm font-bold text-[var(--omlu-text-primary)] outline-none focus:border-orange-500">
                    <option value="80">80mm (Standard)</option>
                    <option value="58">58mm (Compact)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--omlu-text-secondary)]">Connection Type</label>
                <select value={formTransport} onChange={(e) => setFormTransport(e.target.value as "tcp_lan" | "windows_raw_spooler")} className="mt-1 h-11 w-full rounded-xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-muted-surface)] px-3 text-sm font-bold text-[var(--omlu-text-primary)] outline-none focus:border-orange-500">
                  <option value="tcp_lan">Network Thermal Printer (TCP LAN IP)</option>
                  <option value="windows_raw_spooler">Windows OS Printer Queue</option>
                </select>
              </div>

              {formTransport === "tcp_lan" ? (
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-[var(--omlu-text-secondary)]">IP Address / Host</label>
                    <input required value={formHost} onChange={(e) => setFormHost(e.target.value)} placeholder="192.168.1.100" className="mt-1 h-11 w-full rounded-xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-muted-surface)] px-3 font-mono text-sm font-bold text-[var(--omlu-text-primary)] outline-none focus:border-orange-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[var(--omlu-text-secondary)]">Port</label>
                    <input required type="number" value={formPort} onChange={(e) => setFormPort(e.target.value)} placeholder="9100" className="mt-1 h-11 w-full rounded-xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-muted-surface)] px-3 font-mono text-sm font-bold text-[var(--omlu-text-primary)] outline-none focus:border-orange-500" />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-[var(--omlu-text-secondary)]">Windows Spooler Queue Name</label>
                  <input required value={formQueueName} onChange={(e) => setFormQueueName(e.target.value)} placeholder="POS58" className="mt-1 h-11 w-full rounded-xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-muted-surface)] px-3 text-sm font-bold text-[var(--omlu-text-primary)] outline-none focus:border-orange-500" />
                </div>
              )}

              <label className="flex items-center gap-2 pt-2 text-xs font-bold text-[var(--omlu-text-primary)] cursor-pointer">
                <input type="checkbox" checked={formIsDefault} onChange={(e) => setFormIsDefault(e.target.checked)} className="h-4 w-4 rounded accent-orange-600" />
                Set as default printer for {formPurpose} jobs
              </label>

              <div className="flex justify-end gap-2 border-t border-[var(--omlu-border)] pt-4">
                <button type="button" onClick={() => setShowAddModal(false)} className="rounded-xl border border-[var(--omlu-border-strong)] px-4 py-2.5 text-xs font-bold hover:bg-[var(--omlu-muted-surface)]">Cancel</button>
                <button type="submit" disabled={savingPrinter} className="rounded-xl bg-orange-600 px-5 py-2.5 text-xs font-black text-white hover:bg-orange-500 disabled:opacity-50">
                  {savingPrinter ? "Saving…" : editingProfile ? "Save Changes" : "Add Printer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Diagnostics Modal */}
      {showDiagnosticsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4" role="dialog" aria-modal="true" aria-labelledby="modal-diag-title">
          <div className="w-full max-w-2xl rounded-2xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] p-6 text-[var(--omlu-text-primary)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--omlu-border)] pb-4">
              <h3 id="modal-diag-title" className="text-xl font-black">📊 Printer Bridge Diagnostics</h3>
              <button type="button" onClick={() => setShowDiagnosticsModal(false)} className="text-xl font-bold text-[var(--omlu-text-secondary)] hover:text-[var(--omlu-text-primary)]">×</button>
            </div>
            <div className="mt-4 max-h-[60vh] overflow-y-auto font-mono text-xs">
              <pre className="rounded-xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-muted-surface)] p-4 text-[var(--omlu-text-primary)] whitespace-pre-wrap">
                {JSON.stringify(diagnostics || bridge || { error: "No diagnostics data available." }, null, 2)}
              </pre>
            </div>
            <div className="flex justify-end gap-2 border-t border-[var(--omlu-border)] pt-4">
              <button type="button" onClick={handleCopyDiagnostics} className="rounded-xl bg-orange-600 px-4 py-2.5 text-xs font-black text-white hover:bg-orange-500">Copy Diagnostics</button>
              <button type="button" onClick={() => setShowDiagnosticsModal(false)} className="rounded-xl border border-[var(--omlu-border-strong)] px-4 py-2.5 text-xs font-bold hover:bg-[var(--omlu-muted-surface)]">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Pairing Modal */}
      {showPairingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4" role="dialog" aria-modal="true" aria-labelledby="modal-pairing-title">
          <div className="w-full max-w-md rounded-2xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] p-6 text-[var(--omlu-text-primary)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--omlu-border)] pb-4">
              <h3 id="modal-pairing-title" className="text-xl font-black">🔗 Pair OMLU Printer Bridge</h3>
              <button type="button" onClick={() => setShowPairingModal(false)} className="text-xl font-bold text-[var(--omlu-text-secondary)] hover:text-[var(--omlu-text-primary)]">×</button>
            </div>
            <div className="mt-4 text-center">
              <p className="text-xs text-[var(--omlu-text-secondary)]">Enter this 6-digit code in your OMLU Printer Bridge desktop application:</p>
              <div className="mt-4 rounded-xl bg-orange-500/10 p-4 font-mono text-3xl font-black tracking-[0.25em] text-orange-600">
                {pairingCode || "------"}
              </div>
              {pairingError && <p className="mt-3 text-xs font-bold text-red-400">{pairingError}</p>}
              <div className="mt-6 flex justify-end gap-2 border-t border-[var(--omlu-border)] pt-4">
                <button type="button" onClick={() => setShowPairingModal(false)} className="rounded-xl border border-[var(--omlu-border-strong)] px-4 py-2 text-xs font-bold">Cancel</button>
                <button type="button" disabled={pairingStep === "pairing"} onClick={() => void handleConfirmPairing()} className="rounded-xl bg-orange-600 px-4 py-2 text-xs font-black text-white hover:bg-orange-500 disabled:opacity-50">
                  {pairingStep === "pairing" ? "Authorizing…" : "Confirm Pairing"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
