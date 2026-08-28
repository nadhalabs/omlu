"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useOmluUi } from "@/components/OmluUiProvider";
import {
  BridgeDiagnostics,
  BridgeHealth,
  DiscoveredPrinter,
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
  PrintBridgeInstallation,
  requestPrintBridgeToken,
} from "@/lib/api";
import { printIssuedBill } from "@/lib/print_service";

type Tab = "all" | "billing" | "kitchen" | "recent_jobs";

export default function PrintingClient() {
  const { confirm: confirmDialog, toast } = useOmluUi();
  const [bridge, setBridge] = useState<BridgeHealth | null>(null);
  const [installations, setInstallations] = useState<PrintBridgeInstallation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [profiles, setProfiles] = useState<PrinterProfile[]>([]);
  const [recentJobs, setRecentJobs] = useState<RecentJobRecord[]>([]);
  const [diagnostics, setDiagnostics] = useState<BridgeDiagnostics | null>(null);

  // Modals & Drawers
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDiagnosticsModal, setShowDiagnosticsModal] = useState(false);
  const [setupStartedAt, setSetupStartedAt] = useState<number | null>(null);
  const [setupMessage, setSetupMessage] = useState<string | null>(null);

  // Add / Edit Printer Form State
  const [editingProfile, setEditingProfile] = useState<PrinterProfile | null>(null);
  const [formName, setFormName] = useState("");
  const [formPurpose, setFormPurpose] = useState<"billing" | "kitchen">("billing");
  const [formTransport, setFormTransport] = useState<"tcp_lan" | "windows_raw_spooler" | "macos_spooler">("tcp_lan");
  const [formHost, setFormHost] = useState("");
  const [formPort, setFormPort] = useState("9100");
  const [formQueueName, setFormQueueName] = useState("POS58");
  const [formPaperWidth, setFormPaperWidth] = useState<"58" | "80">("80");
  const [formIsDefault, setFormIsDefault] = useState(true);
  const [savingPrinter, setSavingPrinter] = useState(false);

  // Discovery State
  const [discovering, setDiscovering] = useState(false);
  const [discoveredList, setDiscoveredList] = useState<DiscoveredPrinter[]>([]);
  const discoveryAttempted = useRef(false);

  // Pairing Flow State
  const [pairingStep, setPairingStep] = useState<"idle" | "pairing" | "complete">("idle");

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

  const authorizePrinterAction = async (action: "printer:configure" | "printer:test") => {
    if (!bridge?.installation_id) throw new Error("Reconnect OMLU Print and try again.");
    return (await requestPrintBridgeToken(action, bridge.installation_id)).token;
  };

  const load = useCallback(async () => {
    try {
      const [health, installationResult] = await Promise.all([
        checkBridgeHealth(),
        listBridgeInstallations(),
      ]);
      setBridge(health);
      setInstallations(installationResult.installations);
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
      setError(err instanceof Error ? err.message : "Could not load OMLU Print status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    const interval = window.setInterval(() => void load(), setupStartedAt ? 3000 : 30000);
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, [load, setupStartedAt]);

  useEffect(() => {
    if (!setupStartedAt) return;
    const timeout = window.setTimeout(() => setSetupStartedAt(null), 120000);
    return () => window.clearTimeout(timeout);
  }, [setupStartedAt]);

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
    setFormTransport(profile.transport === "windows_raw_spooler" || profile.transport === "macos_spooler" ? profile.transport : "tcp_lan");
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
      const token = await authorizePrinterAction("printer:configure");
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
        const res = await updatePrinterProfile(token, editingProfile.id, payload);
        if (res.success) {
          toast("Printer updated successfully.", "success");
          setShowAddModal(false);
          await load();
        } else {
          toast(res.error || "Could not update printer.", "error");
        }
      } else {
        const res = await addPrinterProfile(token, payload);
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
    if (discovering) return;
    setDiscovering(true);
    discoveryAttempted.current = true;
    try {
      const token = await authorizePrinterAction("printer:configure");
      const results = await discoverPrinters(token);
      setDiscoveredList(results);
      if (results.length === 0) {
        toast("No configured printers were found. You can add one manually.", "information");
      } else {
        toast(`Discovered ${results.length} printer(s).`, "success");
      }
    } catch {
      toast("Could not search for printers. Check OMLU Print, then try again or add one manually.", "error");
    } finally {
      setDiscovering(false);
    }
  };

  const assignDiscoveredPrinter = async (item: DiscoveredPrinter, purpose: "billing" | "kitchen") => {
    setPrinterBusy(item.id, `Saving for ${purpose}…`);
    try {
      const token = await authorizePrinterAction("printer:configure");
      const result = await addPrinterProfile(token, {
        name: item.name, purpose, transport: item.transport, host: item.host, port: item.port,
        queueName: item.queueName, paperWidth: "80", enabled: true, is_default: true,
      });
      if (!result.success) throw new Error(result.error || "Could not save this printer.");
      toast(`${item.name} is now used for ${purpose === "billing" ? "billing" : "kitchen"}. Send a test job to confirm it.`, "success");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not assign this printer.", "error");
    } finally {
      setPrinterBusy(item.id);
    }
  };

  // Test Print Profile
  const handleTestPrint = async (profile: PrinterProfile) => {
    setPrinterBusy(profile.id, "Testing…");
    try {
      const token = await authorizePrinterAction("printer:test");
      toast(`Sending test receipt to ${profile.name}…`, "information");
      const res = await testPrinterProfile(token, profile.id);
      if (res.success) {
        toast(`✓ Test job sent to ${profile.name}. Check the printer for the test slip.`, "success");
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
      const token = await authorizePrinterAction("printer:configure");
      const res = await setDefaultPrinterProfile(token, profile.id);
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
      const token = await authorizePrinterAction("printer:configure");
      const res = await updatePrinterProfile(token, profile.id, { enabled: !profile.enabled });
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
      const token = await authorizePrinterAction("printer:configure");
      const res = await deletePrinterProfile(token, profile.id);
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

  // The two independent short-lived codes prove that the authenticated browser can
  // reach both the backend and the local app. Neither code contains restaurant authority.
  const handleAutomaticPairing = async () => {
    if (pairingStep === "pairing") return;
    setPairingStep("pairing");
    setSetupMessage("Connecting OMLU Print…");
    try {
      const health = bridge || await checkBridgeHealth();
      if (!health?.installation_id) throw new Error("Open OMLU Print after installation, then try again.");
      const localChallenge = await createLocalPairingCode();
      const serverChallenge = await createPairingChallenge(health.installation_id);
      const confirmed = await confirmBridgePairing(health.installation_id, serverChallenge.pairing_code);
      const ex = await exchangeBridgeCredential(confirmed.exchange_token);
      const pk = await getPrintBridgePublicKey();
      await completeLocalPairing({
        pairing_code: localChallenge.pairing_code,
        installation_id: ex.installation_id,
        tenant_id: ex.tenant_id,
        backend_url: confirmed.backend_url,
        backend_public_key_pem: pk.public_key_pem,
        credential_secret: ex.credential_secret,
      });
      setPairingStep("complete");
      setSetupMessage("✓ OMLU Print connected");
      toast("OMLU Print connected.", "success");
      setSetupStartedAt(Date.now());
      await load();
    } catch (err) {
      setPairingStep("idle");
      setSetupMessage(err instanceof Error ? err.message : "OMLU Print could not connect.");
    }
  };

  const handleSetupPrinting = () => {
    setSetupStartedAt(Date.now());
    if (bridge) {
      void handleAutomaticPairing();
      return;
    }
    const platform = navigator.userAgent.toLowerCase();
    if (platform.includes("windows")) {
      setSetupMessage("The production Windows installer is not published yet. OMLU support must complete the signed installer before setup can continue.");
    } else if (platform.includes("mac")) {
      setSetupMessage("The production macOS installer is not published yet. OMLU support must complete signing and notarization before setup can continue.");
    } else {
      setSetupMessage("OMLU Print currently supports Windows and macOS computers.");
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
  const activeInstallation = installations
    .filter((item) => item.status === "paired" && !item.revoked_at)
    .sort((a, b) => Date.parse(b.last_seen_at || b.created_at || "") - Date.parse(a.last_seen_at || a.created_at || ""))[0];
  const lastSeenMs = activeInstallation?.last_seen_at ? Date.parse(activeInstallation.last_seen_at) : 0;
  const cloudConnected = Boolean(lastSeenMs && Date.now() - lastSeenMs < 90000);
  const failedJob = recentJobs.find((job) => job.state === "failed");
  const needsAttention = cloudConnected && Boolean(profiles.length === 0 || failedJob || profiles.some((profile) => !profile.enabled || !profile.lastSuccessfulTestAt || bridge?.printer_readiness?.[profile.id] === false));
  const primaryState = !activeInstallation
    ? "not_setup"
    : !cloudConnected
      ? "interrupted"
      : needsAttention
        ? "attention"
        : "connected";
  const lastConnected = activeInstallation?.last_seen_at
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(activeInstallation.last_seen_at))
    : null;

  useEffect(() => {
    if (cloudConnected && bridge?.paired && profiles.length === 0 && !discoveryAttempted.current) {
      void handleDiscover();
    }
  // Discovery is intentionally once per mounted setup screen, never continuous.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudConnected, bridge?.paired, profiles.length]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      {/* Owner-facing overview. Technical details stay in Advanced diagnostics. */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-black text-[var(--omlu-text-primary)]">Printing</h1>
          <p className="mt-1 text-sm text-[var(--omlu-text-secondary)]">
            Set up automatic bill and kitchen printing.
          </p>
        </div>
      </header>

      <section className="rounded-2xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${primaryState === "connected" ? "bg-emerald-500/10 text-emerald-600" : primaryState === "not_setup" ? "bg-slate-500/10 text-slate-600" : "bg-amber-500/10 text-amber-600"}`}>
              <span className="text-2xl">{primaryState === "connected" ? "✓" : primaryState === "not_setup" ? "○" : "⚠"}</span>
            </div>
            <div>
              <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">OMLU Print</h2>
              <p className={`mt-0.5 text-sm font-black ${primaryState === "connected" ? "text-emerald-700 dark:text-emerald-400" : primaryState === "not_setup" ? "text-[var(--omlu-text-secondary)]" : "text-amber-700 dark:text-amber-400"}`}>
                {primaryState === "not_setup" ? "Not set up" : primaryState === "connected" ? "✓ Connected" : primaryState === "interrupted" ? "⚠ Connection interrupted" : "⚠ Needs attention"}
              </p>
              <p className="mt-1 max-w-xl text-sm text-[var(--omlu-text-secondary)]">
                {primaryState === "not_setup" && "Install OMLU Print once on this computer to enable automatic bill and kitchen printing."}
                {primaryState === "connected" && "Printing is ready."}
                {primaryState === "interrupted" && "OMLU Print is installed, but OMLU cannot currently reach this computer. Make sure the computer is on and OMLU Print is running."}
                {primaryState === "attention" && (profiles.length === 0 ? "OMLU Print is connected. Choose a billing or kitchen printer to finish setup." : failedJob ? `A recent print job needs attention${failedJob.error ? `: ${failedJob.error}` : "."}` : profiles.some((profile) => !profile.enabled) ? "A configured printer is disabled." : profiles.some((profile) => bridge?.printer_readiness?.[profile.id] === false) ? "A configured printer cannot currently be reached. Check its power and connection, then try again." : "Send a test job to finish printer setup.")}
              </p>
              {primaryState === "interrupted" && lastConnected && <p className="mt-1 text-xs font-semibold text-[var(--omlu-text-secondary)]">Last connected: {lastConnected}</p>}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            {(primaryState === "not_setup" || (bridge && !bridge.paired)) && (
              <button
                type="button"
                disabled={pairingStep === "pairing"}
                onClick={handleSetupPrinting}
                className="min-h-12 rounded-xl bg-orange-600 px-5 py-3 text-sm font-black text-white hover:bg-orange-500 disabled:opacity-60"
              >
                {pairingStep === "pairing" ? "Connecting…" : "Set up printing"}
              </button>
            )}
            {primaryState === "interrupted" && (
              <button
                type="button"
                onClick={() => { setSetupStartedAt(Date.now()); void load(); }}
                className="min-h-11 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-black text-white hover:bg-orange-500"
              >
                Check connection
              </button>
            )}
            {setupMessage && <p role="status" className="max-w-sm text-sm font-semibold text-[var(--omlu-text-secondary)]">{setupMessage}</p>}
          </div>
        </div>
      </section>

      {activeInstallation && profiles.length === 0 && (
        <section className="rounded-2xl border border-dashed border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] p-6">
          <div className="text-center">
            <h2 className="text-lg font-black">{discovering ? "Finding printers…" : discoveredList.length ? `${discoveredList.length} printer${discoveredList.length === 1 ? "" : "s"} found` : "No printers found yet"}</h2>
            <p className="mt-1 text-sm text-[var(--omlu-text-secondary)]">OMLU Print checks printers already configured on this computer.</p>
          </div>
          {discoveredList.length > 0 && (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {discoveredList.map((item) => (
                <article key={item.id} className="rounded-xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-muted-surface)] p-4">
                  <h3 className="font-black">{item.name}</h3>
                  <p className="mt-1 text-sm text-[var(--omlu-text-secondary)]">{item.description || (item.connectionType === "network" ? "Network printer" : "Connected to this computer")}</p>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <button type="button" disabled={Boolean(busyPrinters[item.id])} onClick={() => void assignDiscoveredPrinter(item, "billing")} className="min-h-11 flex-1 rounded-xl bg-orange-600 px-3 text-sm font-black text-white disabled:opacity-50">Use for Billing</button>
                    <button type="button" disabled={Boolean(busyPrinters[item.id])} onClick={() => void assignDiscoveredPrinter(item, "kitchen")} className="min-h-11 flex-1 rounded-xl border border-[var(--omlu-border-strong)] px-3 text-sm font-black disabled:opacity-50">Use for Kitchen</button>
                  </div>
                </article>
              ))}
            </div>
          )}
          <div className="mt-5 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
            <button type="button" disabled={!cloudConnected || !bridge?.paired || discovering} onClick={() => void handleDiscover()} className="min-h-11 rounded-xl bg-orange-600 px-5 text-sm font-black text-white disabled:opacity-50">{discovering ? "Finding printers…" : "Find printers"}</button>
            <button type="button" disabled={!cloudConnected || !bridge?.paired} onClick={() => openAddModal("billing")} className="min-h-11 rounded-xl px-5 text-sm font-bold underline underline-offset-4 disabled:opacity-50">Can&apos;t find your printer? Add manually</button>
          </div>
          {!cloudConnected && <p className="mt-2 text-xs text-[var(--omlu-text-secondary)]">Reconnect OMLU Print before adding a printer.</p>}
        </section>
      )}

      {activeInstallation && (activeInstallation.billing_printer_configured || activeInstallation.kitchen_printer_configured) && (
        <section aria-label="Printer readiness" className="grid gap-4 sm:grid-cols-2">
          {(["billing", "kitchen"] as const).map((purpose) => {
            const configured = purpose === "billing" ? activeInstallation.billing_printer_configured : activeInstallation.kitchen_printer_configured;
            const label = purpose === "billing" ? activeInstallation.billing_printer_label : activeInstallation.kitchen_printer_label;
            const localProfile = profiles.find((profile) => profile.purpose === purpose && profile.is_default);
            const tested = Boolean(localProfile?.lastSuccessfulTestAt || (purpose === "billing" ? activeInstallation.billing_printer_last_success_at : activeInstallation.kitchen_printer_last_success_at));
            const reachable = !localProfile || bridge?.printer_readiness?.[localProfile.id] !== false;
            return (
              <article key={purpose} className="rounded-2xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] p-5 shadow-sm">
                <h2 className="text-lg font-black">{purpose === "billing" ? "Billing Printer" : "Kitchen Printer"}</h2>
                <p className={`mt-2 text-sm font-black ${configured && cloudConnected ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}`}>
                  {configured && cloudConnected && tested && reachable ? "✓ Ready" : configured && cloudConnected && !reachable ? "Needs attention" : configured && cloudConnected ? "Test required" : configured ? "Waiting for connection" : "Not set up"}
                </p>
                {label && <p className="mt-1 text-sm text-[var(--omlu-text-secondary)]">{label}</p>}
                {localProfile && (
                  <button type="button" disabled={Boolean(busyPrinters[localProfile.id]) || !cloudConnected} onClick={() => void handleTestPrint(localProfile)} className="mt-4 min-h-11 rounded-xl border border-[var(--omlu-border-strong)] px-4 text-sm font-black disabled:opacity-50">
                    {busyPrinters[localProfile.id] || "Test print"}
                  </button>
                )}
              </article>
            );
          })}
        </section>
      )}

      {activeInstallation && profiles.length > 0 && (
        <div className="flex justify-center">
          <button type="button" disabled={discovering || !cloudConnected} onClick={() => void handleDiscover()} className="min-h-11 rounded-xl border border-[var(--omlu-border-strong)] px-5 text-sm font-black disabled:opacity-50">{discovering ? "Finding printers…" : "Find printers"}</button>
        </div>
      )}

      {profiles.length > 0 && discoveredList.length > 0 && (
        <section aria-label="Printers found" className="rounded-2xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] p-5">
          <h2 className="text-lg font-black">{discoveredList.length} printer{discoveredList.length === 1 ? "" : "s"} found</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {discoveredList.map((item) => (
              <article key={item.id} className="rounded-xl bg-[var(--omlu-muted-surface)] p-4">
                <h3 className="font-black">{item.name}</h3>
                <p className="mt-1 text-sm text-[var(--omlu-text-secondary)]">{item.description || "Connected to this computer"}</p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <button type="button" disabled={Boolean(busyPrinters[item.id])} onClick={() => void assignDiscoveredPrinter(item, "billing")} className="min-h-11 flex-1 rounded-xl bg-orange-600 px-3 text-sm font-black text-white disabled:opacity-50">Use for Billing</button>
                  <button type="button" disabled={Boolean(busyPrinters[item.id])} onClick={() => void assignDiscoveredPrinter(item, "kitchen")} className="min-h-11 flex-1 rounded-xl border border-[var(--omlu-border-strong)] px-3 text-sm font-black disabled:opacity-50">Use for Kitchen</button>
                </div>
              </article>
            ))}
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
                        <p className="mt-1 text-sm font-semibold text-[var(--omlu-text-secondary)]">
                          {profile.enabled && cloudConnected && bridge?.printer_readiness?.[profile.id] === false ? "Needs attention" : profile.enabled && cloudConnected && profile.lastSuccessfulTestAt ? "✓ Ready" : profile.enabled && cloudConnected ? "Test required" : profile.enabled ? "Waiting for OMLU Print" : "Disabled"}
                        </p>
                      </div>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-black ${profile.enabled ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"}`}>
                        {profile.enabled && cloudConnected && profile.lastSuccessfulTestAt && bridge?.printer_readiness?.[profile.id] !== false ? "READY" : "NOT READY"}
                      </span>
                    </div>

                    <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[var(--omlu-border)] pt-4">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleTestPrint(profile)}
                        className="rounded-xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] px-3.5 py-2 text-xs font-black text-[var(--omlu-text-primary)] hover:bg-[var(--omlu-muted-surface)] disabled:opacity-50"
                      >
                        {busyPrinters[profile.id] || "Test print"}
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

      <div className="flex justify-center border-t border-[var(--omlu-border)] pt-4">
        <button type="button" onClick={handleOpenDiagnostics} className="min-h-11 rounded-xl px-4 text-sm font-bold text-[var(--omlu-text-secondary)] underline-offset-4 hover:underline">
          Advanced diagnostics
        </button>
      </div>

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

            {!editingProfile && <p className="mt-4 rounded-xl bg-[var(--omlu-muted-surface)] p-3 text-sm text-[var(--omlu-text-secondary)]">Manual setup is for printers that are not installed on this computer. Your printer manual or support team can provide these details.</p>}

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
                <select value={formTransport} onChange={(e) => setFormTransport(e.target.value as "tcp_lan" | "windows_raw_spooler" | "macos_spooler")} className="mt-1 h-11 w-full rounded-xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-muted-surface)] px-3 text-sm font-bold text-[var(--omlu-text-primary)] outline-none focus:border-orange-500">
                  <option value="tcp_lan">Network thermal printer</option>
                  <option value="windows_raw_spooler">Windows installed printer</option>
                  <option value="macos_spooler">macOS installed printer</option>
                </select>
              </div>

              {formTransport === "tcp_lan" ? (
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-[var(--omlu-text-secondary)]">Private local IP address</label>
                    <input required value={formHost} onChange={(e) => setFormHost(e.target.value)} placeholder="192.168.1.100" className="mt-1 h-11 w-full rounded-xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-muted-surface)] px-3 font-mono text-sm font-bold text-[var(--omlu-text-primary)] outline-none focus:border-orange-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[var(--omlu-text-secondary)]">Port</label>
                    <input required type="number" value={formPort} onChange={(e) => setFormPort(e.target.value)} placeholder="9100" className="mt-1 h-11 w-full rounded-xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-muted-surface)] px-3 font-mono text-sm font-bold text-[var(--omlu-text-primary)] outline-none focus:border-orange-500" />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-[var(--omlu-text-secondary)]">Installed printer name</label>
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
              <h3 id="modal-diag-title" className="text-xl font-black">Advanced diagnostics</h3>
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

    </div>
  );
}
