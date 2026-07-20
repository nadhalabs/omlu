"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type Base = { title: string; message: string; details?: string[]; confirmLabel?: string; cancelLabel?: string; tone?: "default" | "destructive"; onConfirm?: () => void | Promise<void> };
type Input = Omit<Base, "onConfirm"> & { label: string; placeholder?: string; initialValue?: string; required?: boolean; maxLength?: number; onConfirm?: (value: string) => void | Promise<void> };
type Alert = { title: string; message: string; details?: string[]; acknowledgeLabel?: string; cancelLabel?: string };
type State = ({ kind: "confirm"; options: Base } | { kind: "input"; options: Input } | { kind: "alert"; options: Alert }) & { resolve: (value: boolean | string | null) => void };
type Tone = "success" | "error" | "warning" | "information";
type Ui = { confirm: (o: Base) => Promise<boolean>; input: (o: Input) => Promise<string | null>; alert: (o: Alert) => Promise<void>; toast: (message: string, tone?: Tone) => void };
const UiContext = createContext<Ui | null>(null);

export function OmluUiProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<State | null>(null);
  const [toasts, setToasts] = useState<{ id: number; message: string; tone: Tone }[]>([]);
  const id = useRef(1);
  const confirm = useCallback((options: Base) => new Promise<boolean>((resolve) => setDialog({ kind: "confirm", options, resolve: (value) => resolve(value === true) })), []);
  const input = useCallback((options: Input) => new Promise<string | null>((resolve) => setDialog({ kind: "input", options, resolve: (value) => resolve(typeof value === "string" ? value : null) })), []);
  const alert = useCallback((options: Alert) => new Promise<void>((resolve) => setDialog({ kind: "alert", options, resolve: () => resolve() })), []);
  const toast = useCallback((message: string, tone: Tone = "information") => setToasts((current) => current.some((item) => item.message === message) ? current : [...current, { id: id.current++, message, tone }]), []);
  return <UiContext.Provider value={{ confirm, input, alert, toast }}>{children}{dialog && <OmluConfirmDialog state={dialog} close={(value) => { dialog.resolve(value); setDialog(null); }} />}<div className="pointer-events-none fixed inset-x-4 top-[max(1rem,env(safe-area-inset-top))] z-[70] flex flex-col items-end gap-2 print:hidden" aria-live="polite">{toasts.map((item) => <OmluToast key={item.id} item={item} dismiss={() => setToasts((current) => current.filter((toastItem) => toastItem.id !== item.id))} />)}</div></UiContext.Provider>;
}
export function useOmluUi() { const ui = useContext(UiContext); if (!ui) throw new Error("OmluUiProvider is required"); return ui; }

function OmluConfirmDialog({ state, close }: { state: State; close: (value: boolean | string | null) => void }) {
  const [value, setValue] = useState(state.kind === "input" ? state.options.initialValue || "" : "");
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null); const previous = useRef<HTMLElement | null>(null); const options = state.options;
  useEffect(() => { previous.current = document.activeElement as HTMLElement; const overflow = document.body.style.overflow; document.body.style.overflow = "hidden"; const timer = window.setTimeout(() => panel.current?.querySelector<HTMLElement>("textarea,button")?.focus(), 0); return () => { window.clearTimeout(timer); document.body.style.overflow = overflow; previous.current?.focus(); }; }, []);
  const cancel = () => { if (!busy) close(state.kind === "confirm" ? false : null); };
  const submit = async () => { if (busy) return; if (state.kind === "alert") { close(true); return; } if (state.kind === "input" && state.options.required && !value.trim()) { setError(`${state.options.label} is required.`); return; } setBusy(true); setError(null); try { if (state.kind === "input") await state.options.onConfirm?.(value.trim()); else await state.options.onConfirm?.(); close(state.kind === "input" ? value.trim() : true); } catch (reason) { setError(reason instanceof Error ? reason.message : "The action could not be completed. Try again."); setBusy(false); } };
  const onKeyDown = (event: React.KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); cancel(); } if (event.key === "Tab" && panel.current) { const controls = [...panel.current.querySelectorAll<HTMLElement>("button:not(:disabled),textarea:not(:disabled)")]; if (!controls.length) return; const first = controls[0], last = controls[controls.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } } };
  const actionOptions = state.kind === "alert" ? null : state.options;
  const destructive = actionOptions?.tone === "destructive";
  const label = state.kind === "alert" ? state.options.acknowledgeLabel || "Got it" : actionOptions?.confirmLabel || "Confirm";
  return <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/70 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]" onMouseDown={(event) => { if (event.target === event.currentTarget) cancel(); }}><div ref={panel} role="dialog" aria-modal="true" aria-labelledby="omlu-dialog-title" aria-describedby="omlu-dialog-message" onKeyDown={onKeyDown} className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-900 p-5 text-zinc-100 shadow-2xl sm:p-6"><h2 id="omlu-dialog-title" className="text-xl font-black text-white">{options.title}</h2><p id="omlu-dialog-message" className="mt-2 text-sm leading-6 text-zinc-400">{options.message}</p>{options.details && <div className="mt-4 space-y-2 rounded-xl bg-zinc-950 p-4 text-sm">{options.details.map((detail) => <div key={detail} className="font-bold text-zinc-300">{detail}</div>)}</div>}{state.kind === "input" && <label className="mt-4 block text-sm font-bold text-zinc-300">{state.options.label}<textarea value={value} onChange={(event) => setValue(event.target.value)} placeholder={state.options.placeholder} maxLength={state.options.maxLength || 1024} disabled={busy} className="mt-2 min-h-24 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-white outline-none focus:border-amber-500" /><span className="block text-right text-[10px] text-zinc-600">{value.length}/{state.options.maxLength || 1024}</span></label>}{error && <div role="alert" className="mt-4 rounded-xl border border-red-900/50 bg-red-950/30 p-3 text-sm font-bold text-red-300">{error}</div>}<div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{state.kind !== "alert" && <button disabled={busy} onClick={cancel} className="min-h-11 rounded-xl bg-zinc-800 px-4 text-sm font-bold disabled:opacity-50">{options.cancelLabel || "Cancel"}</button>}<button disabled={busy} onClick={submit} className={`min-h-11 rounded-xl px-4 text-sm font-black text-white disabled:opacity-60 ${destructive ? "bg-red-700" : "bg-amber-600"}`}>{busy ? "Confirming…" : label}</button></div></div></div>;
}

function OmluToast({ item, dismiss }: { item: { message: string; tone: Tone }; dismiss: () => void }) {
  useEffect(() => { const timer = window.setTimeout(dismiss, item.tone === "error" ? 7000 : 4000); return () => window.clearTimeout(timer); }, [dismiss, item.tone]);
  const colors = { success: "border-emerald-800 bg-emerald-950 text-emerald-200", error: "border-red-800 bg-red-950 text-red-200", warning: "border-amber-800 bg-amber-950 text-amber-200", information: "border-zinc-700 bg-zinc-900 text-zinc-200" };
  return <div role={item.tone === "error" ? "alert" : "status"} className={`pointer-events-auto flex max-w-sm gap-3 rounded-xl border px-4 py-3 text-sm font-bold shadow-xl ${colors[item.tone]}`}><span className="flex-1">{item.message}</span><button onClick={dismiss} aria-label="Dismiss notification">×</button></div>;
}
