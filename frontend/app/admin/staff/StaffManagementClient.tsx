"use client";

import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { FormToast } from "@/components/FormToast";
import { PasswordInput } from "@/components/PasswordInput";
import {
  ApiError,
  createStaffAccount,
  getStaffAccounts,
  getStaffOperations,
  removeStaffAccess,
  resetStaffPassword,
  revokeStaffSessions,
  staffLogout,
  updateStaffAccount,
  setAllStaffLocked,
  setStaffLocked,
  setRestaurantOperatingStatus,
} from "@/lib/api";
import {
  backendFieldName,
  FieldErrors,
  firstError,
  focusField,
  validatePassword,
  validateStaffAccount,
} from "@/lib/formValidation";
import { StaffAccountCreateRequest, StaffAccountResponse, StaffOperationsResponse } from "@/lib/types";
import { useOmluUi } from "@/components/OmluUiProvider";
import { useModalScrollLock } from "@/components/useModalScrollLock";
import { getActiveWebTenantScope } from "@/lib/authRuntime.mjs";

const EMPTY_FORM: StaffAccountCreateRequest = {
  name: "",
  username: "",
  email: "",
  role: "staff",
  temporary_password: "",
  pin: "",
  confirm_pin: "",
};

function fmt(value: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

function relativeTime(value: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  if (elapsedMinutes < 2) return "Just now";
  if (elapsedMinutes < 60) return `${elapsedMinutes} minutes ago`;
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return `Today, ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  }
  return date.toLocaleString([], { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function StaffManagementClient() {
  const { confirm: confirmDialog, input: inputDialog, toast: uiToast } = useOmluUi();
  const [staff, setStaff] = useState<StaffAccountResponse[]>([]);
  const [operations, setOperations] = useState<StaffOperationsResponse | null>(null);
  const [form, setForm] = useState<StaffAccountCreateRequest>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<keyof StaffAccountCreateRequest>>({});
  const [resetTarget, setResetTarget] = useState<StaffAccountResponse | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [resetPasswordError, setResetPasswordError] = useState<string | undefined>();
  const [resetSaving, setResetSaving] = useState(false);
  const [busyMemberId, setBusyMemberId] = useState<number | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [selfSessionRevoked, setSelfSessionRevoked] = useState(false);
  const pendingSessionRevocationsRef = useRef<Set<number>>(new Set());
  const createFieldOrder: (keyof StaffAccountCreateRequest)[] = ["name", "username", "role", "email", "temporary_password", "pin", "confirm_pin"];

  useModalScrollLock(Boolean(resetTarget), () => {
    if (!resetSaving) setResetTarget(null);
  });

  const loadStaff = useCallback(async () => {
    setLoading(true);
    try {
      const [accounts, operationalState] = await Promise.all([getStaffAccounts(), getStaffOperations()]);
      setStaff(accounts);
      setOperations(operationalState);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load staff.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => loadStaff(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadStaff]);

  const replaceStaff = (updated: StaffAccountResponse) => {
    setStaff((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
  };

  const changeCreateRole = (role: StaffAccountCreateRequest["role"]) => {
    setFieldErrors({});
    setError(null);
    setForm((current) => ({
      ...current,
      role,
      email: role === "admin" ? current.email || "" : "",
      temporary_password: "",
      pin: "",
      confirm_pin: "",
    }));
  };

  const submitCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const validation = validateStaffAccount(form);
    const first = firstError(validation.errors, createFieldOrder);
    if (first) {
      setFieldErrors(validation.errors);
      setError("Please correct the highlighted fields.");
      setToast(first.message);
      focusField(first.field);
      return;
    }
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      const created = await createStaffAccount(validation.normalized);
      setStaff((prev) => [...prev, created]);
      setForm(EMPTY_FORM);
    } catch (err) {
      if (err instanceof ApiError) {
        const field = backendFieldName(err.field) as keyof StaffAccountCreateRequest | undefined;
        if (field && createFieldOrder.includes(field)) {
          setFieldErrors({ [field]: err.message });
          focusField(field);
        }
        setError(err.message);
        setToast(err.message);
      } else {
        setError("Could not create staff account.");
        setToast("Could not create staff account.");
      }
    } finally {
      setSaving(false);
    }
  };

  const changeRole = async (member: StaffAccountResponse, role: string) => {
    if (!await confirmDialog({ title: `Change ${member.name}'s role?`, message: `Their role will change from ${member.role} to ${role}. Active permissions will refresh immediately.`, confirmLabel: "Change role" })) return;
    setBusyMemberId(member.id); setBusyAction("Updating role...");
    try { replaceStaff(await updateStaffAccount(member.id, { role })); }
    finally { setBusyMemberId(null); setBusyAction(null); }
  };

  const changeStatus = async (member: StaffAccountResponse, status: string) => {
    let reason: string | undefined;
    if (status === "active") { if (!await confirmDialog({ title: `Reactivate ${member.name}?`, message: "Account access will be restored immediately.", confirmLabel: "Reactivate account" })) return; }
    else { const entered = await inputDialog({ title: `Suspend ${member.name}?`, message: "This account will lose access immediately.", label: "Reason", placeholder: "Shift completed", required: false, confirmLabel: "Suspend account", tone: "destructive" }); if (entered === null) return; reason = entered || undefined; }
    setBusyMemberId(member.id); setBusyAction(status === "active" ? "Resuming..." : "Suspending...");
    try { replaceStaff(await updateStaffAccount(member.id, { status, reason })); }
    finally { setBusyMemberId(null); setBusyAction(null); }
  };

  const openResetPassword = (member: StaffAccountResponse) => {
    setResetTarget(member);
    setResetPasswordValue("");
    setResetPasswordError(undefined);
  };

  const submitResetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!resetTarget || resetSaving) return;
    const passwordError = resetTarget.role === "staff" || resetTarget.role === "kitchen"
      ? (/^\d{6}$/.test(resetPasswordValue) ? undefined : "PIN must be exactly 6 digits.")
      : validatePassword(resetPasswordValue, { personalUsername: resetTarget.username || undefined });
    if (passwordError) {
      setResetPasswordError(passwordError);
      setToast(passwordError);
      focusField("temporary_password");
      return;
    }
    setResetSaving(true);
    setResetPasswordError(undefined);
    try {
      replaceStaff(await resetStaffPassword(resetTarget.id, resetPasswordValue));
      setResetTarget(null);
      setResetPasswordValue("");
    } catch (err) {
      if (err instanceof ApiError) {
        setResetPasswordError(err.field ? err.message : undefined);
        setError(err.message);
        setToast(err.message);
      } else {
        setError("Could not reset password.");
        setToast("Could not reset password.");
      }
    } finally {
      setResetSaving(false);
    }
  };

  const signOutAll = async (member: StaffAccountResponse) => {
    if (pendingSessionRevocationsRef.current.has(member.id)) return;
    pendingSessionRevocationsRef.current.add(member.id);
    let selfRevocationSucceeded = false;
    try {
      if (!await confirmDialog({ title: `Sign out ${member.name}?`, message: "All active sessions for this account will be revoked immediately.", confirmLabel: "Sign out sessions", tone: "destructive" })) return;
      setBusyMemberId(member.id); setBusyAction("Signing out...");
      const updated = await revokeStaffSessions(member.id);
      const isCurrentAccount = getActiveWebTenantScope()?.actor_id === member.id;
      if (isCurrentAccount) {
        selfRevocationSucceeded = true;
        setSelfSessionRevoked(true);
        await staffLogout();
        return;
      }
      replaceStaff(updated);
      setError(null);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not sign out staff sessions.";
      setError(message);
      setToast(message);
    } finally {
      pendingSessionRevocationsRef.current.delete(member.id);
      if (!selfRevocationSucceeded) {
        setBusyMemberId(null);
        setBusyAction(null);
      }
    }
  };

  const removeAccess = async (member: StaffAccountResponse) => {
    if (!await confirmDialog({ title: `Remove ${member.name}'s access?`, message: "This immediately signs them out and removes their restaurant access.", confirmLabel: "Remove access", cancelLabel: "Keep access", tone: "destructive" })) return;
    setBusyMemberId(member.id); setBusyAction("Removing...");
    try {
      await removeStaffAccess(member.id);
      setStaff((prev) => prev.filter((item) => item.id !== member.id));
    } finally { setBusyMemberId(null); setBusyAction(null); }
  };

  const toggleAllStaff = async () => {
    if (!operations) return;
    const locking = !operations.locked;
    const warnings = `${operations.occupied_tables} active tables, ${operations.unserved_orders} unserved orders, ${operations.pending_requests} pending requests, and ${operations.bills_waiting_for_payment} bills waiting for payment.`;
    let reason: string | undefined;
    if (locking) { const entered = await inputDialog({ title: "Lock all Staff?", message: "Staff will immediately lose access to operational actions. Owner, Admin, and Kitchen access remain available.", details: [warnings], label: "Reason", placeholder: "Restaurant closed", confirmLabel: "Lock all Staff", tone: "destructive" }); if (entered === null) return; reason = entered || undefined; }
    else if (!await confirmDialog({ title: "Unlock all Staff?", message: "Operational access will be restored immediately for Staff accounts that are not individually locked.", confirmLabel: "Unlock Staff" })) return;
    try { setOperations(await setAllStaffLocked(locking, reason, true)); }
    catch (err) { uiToast(err instanceof ApiError ? err.message : "Could not update Staff operations.", "error"); }
  };

  const toggleMemberLock = async (member: StaffAccountResponse) => {
    const locking = !member.operations_locked;
    let reason: string | undefined;
    if (locking) { const entered = await inputDialog({ title: `Lock ${member.name}?`, message: `${member.name} will be blocked from creating orders, generating bills, sending bills to the counter, and changing restaurant operations.`, label: "Reason", placeholder: "Shift ended", confirmLabel: "Lock Staff", tone: "destructive" }); if (entered === null) return; reason = entered || undefined; }
    else if (!await confirmDialog({ title: `Unlock ${member.name}?`, message: "Operational access will be restored immediately.", confirmLabel: "Unlock Staff" })) return;
    setBusyMemberId(member.id); setBusyAction(locking ? "Locking..." : "Unlocking...");
    try { replaceStaff(await setStaffLocked(member.id, locking, reason)); }
    catch (err) { uiToast(err instanceof ApiError ? err.message : "Could not update Staff lock.", "error"); }
    finally { setBusyMemberId(null); setBusyAction(null); }
  };

  const changeRestaurantStatus = async (nextStatus: "open" | "closing" | "closed") => {
    if (!operations || nextStatus === operations.operating_status) return;
    const copy = nextStatus === "closed" ? "New QR sessions and customer orders will be blocked. Staff operational actions will also be locked. Existing records will not be deleted." : nextStatus === "closing" ? "New customer sessions will be blocked while existing operations may continue." : "Customer ordering and normal restaurant operations will resume.";
    if (!await confirmDialog({ title: `Set restaurant as ${nextStatus}?`, message: copy, confirmLabel: `Set as ${nextStatus[0].toUpperCase()}${nextStatus.slice(1)}`, tone: nextStatus === "closed" ? "destructive" : "default" })) return;
    try { setOperations(await setRestaurantOperatingStatus(nextStatus)); uiToast(`Restaurant status changed to ${nextStatus}.`, "success"); }
    catch (err) { uiToast(err instanceof ApiError ? err.message : "Could not update restaurant status.", "error"); }
  };

  if (selfSessionRevoked) {
    return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950 p-6 text-center" role="status" aria-live="polite"><p className="text-sm font-bold text-white">Signing out securely...</p></div>;
  }

  return (
    <div className="flex flex-col gap-6">
      <FormToast message={toast} onDismiss={() => setToast(null)} />
      <header className="flex flex-col items-start justify-between gap-4 sm:flex-row">
        <div>
          <h1 className="text-2xl font-black text-zinc-950">Staff Management</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Manage staff access, roles, sessions, and restaurant availability.
          </p>
        </div>
        <button
          onClick={loadStaff}
          disabled={loading}
          className="min-h-11 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-bold text-zinc-800 shadow-sm transition hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:bg-zinc-100 disabled:text-zinc-500"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </header>

      {error && (
        <div role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
          {error}
        </div>
      )}

      {operations && (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
            <div>
              <h2 className="text-lg font-black text-zinc-950">Restaurant Staff Access</h2>
              <p className={`mt-2 inline-flex rounded-full px-3 py-1 text-sm font-bold ${operations.locked ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800"}`}>
                {operations.locked ? "All staff locked" : "All staff unlocked"}
              </p>
              {operations.locked && <p className="mt-2 text-xs font-medium text-zinc-600">Locked by {operations.locked_by_name || "Admin"} · {fmt(operations.locked_at)}{operations.reason ? ` · ${operations.reason}` : ""}</p>}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="text-xs font-bold text-zinc-700">Restaurant operational status
              <select value={operations.operating_status} onChange={(e) => void changeRestaurantStatus(e.target.value as "open" | "closing" | "closed")} className="mt-1 block min-h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 focus-visible:outline-2 focus-visible:outline-orange-500">
                <option value="open">Open</option><option value="closing">Closing</option><option value="closed">Closed</option>
              </select>
              </label>
              <button onClick={toggleAllStaff} className={`min-h-11 rounded-lg border px-4 py-2 text-sm font-black transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 ${operations.locked ? "border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800" : "border-red-300 bg-white text-red-700 hover:bg-red-50"}`}>
                {operations.locked ? "Unlock all staff" : "Lock all staff"}
              </button>
            </div>
          </div>
          <dl className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[["Active tables", operations.occupied_tables], ["Unserved orders", operations.unserved_orders], ["Pending requests", operations.pending_requests], ["Bills awaiting payment", operations.bills_waiting_for_payment]].map(([label, value]) => <div key={label} className="rounded-xl bg-zinc-50 p-3"><dt className="text-xs font-bold text-zinc-600">{label}</dt><dd className="mt-1 text-xl font-black text-zinc-950">{value}</dd></div>)}
          </dl>
        </section>
      )}

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-black text-zinc-950">Add staff member</h2>
        <form onSubmit={submitCreate} className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <FieldInput name="name" label="Full name" placeholder="Full name" autoComplete="name" value={form.name} error={fieldErrors.name} disabled={saving} onChange={(value) => setForm({ ...form, name: value })} />
        <FieldInput name="username" label="Username" placeholder="e.g. nadha" autoComplete="username" value={form.username} error={fieldErrors.username} disabled={saving} onChange={(value) => setForm({ ...form, username: value.toLowerCase() })} />
        <label className="flex flex-col gap-1.5 text-sm font-bold text-zinc-800">Role<select name="role" className="min-h-11 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 focus-visible:outline-2 focus-visible:outline-orange-500" value={form.role} disabled={saving} onChange={(e) => changeCreateRole(e.target.value as StaffAccountCreateRequest["role"])}>
          <option value="staff">Staff</option>
          <option value="kitchen">Kitchen</option>
          <option value="admin">Admin</option>
        </select></label>
        {form.role === "admin" && <FieldInput name="email" label="Email" placeholder="name@example.com" type="email" autoComplete="email" value={form.email || ""} error={fieldErrors.email} disabled={saving} onChange={(value) => setForm({ ...form, email: value })} />}
        {form.role === "staff" || form.role === "kitchen" ? <>
          <FieldInput name="pin" label="6-digit PIN" hint="Enter exactly 6 digits." placeholder="6-digit PIN" type="password" autoComplete="new-password" value={form.pin || ""} error={fieldErrors.pin} disabled={saving} inputMode="numeric" maxLength={6} onChange={(value) => setForm({ ...form, pin: value.replace(/\D/g, "").slice(0, 6) })} />
          <FieldInput name="confirm_pin" label="Confirm PIN" hint="Re-enter the same 6 digits." placeholder="Confirm PIN" type="password" autoComplete="new-password" value={form.confirm_pin || ""} error={fieldErrors.confirm_pin} disabled={saving} inputMode="numeric" maxLength={6} onChange={(value) => setForm({ ...form, confirm_pin: value.replace(/\D/g, "").slice(0, 6) })} />
        </> : <>
          <PasswordInput name="temporary_password" label="Temporary password" value={form.temporary_password || ""} error={fieldErrors.temporary_password} disabled={saving} autoComplete="new-password" showChecklist onChange={(value) => setForm({ ...form, temporary_password: value })} />
        </>}
        <button disabled={saving} className="min-h-11 self-end rounded-lg bg-orange-600 px-5 py-2 text-sm font-black text-white transition hover:bg-orange-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-600">
          {saving ? "Adding staff..." : "Add Staff"}
        </button>
        </form>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between gap-4"><div><h2 className="text-lg font-black text-zinc-950">Staff accounts</h2><p className="mt-1 text-sm text-zinc-600">{staff.length} {staff.length === 1 ? "account" : "accounts"}</p></div></div>
        {loading && staff.length === 0 ? <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm font-medium text-zinc-600">Loading staff accounts...</div> : staff.length === 0 ? <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm font-medium text-zinc-600">No staff accounts yet.</div> : <>
          <div className="hidden overflow-visible rounded-2xl border border-zinc-200 bg-white shadow-sm lg:block">
            <table className="w-full table-fixed text-sm"><thead className="bg-zinc-950 text-left text-[11px] uppercase tracking-wider text-white"><tr><th className="w-[25%] p-4">Staff member</th><th className="w-[14%] p-4">Role</th><th className="w-[13%] p-4">Status</th><th className="w-[15%] p-4">Last active</th><th className="w-[13%] p-4">Sessions</th><th className="w-[20%] p-4">Actions</th></tr></thead>
            <tbody className="divide-y divide-zinc-200">{staff.map((member) => <StaffRow key={member.id} member={member} busy={busyMemberId === member.id} busyAction={busyAction} openMenu={openMenuId === member.id} setOpenMenu={(open) => setOpenMenuId(open ? member.id : null)} changeRole={changeRole} changeStatus={changeStatus} openResetPassword={openResetPassword} signOutAll={signOutAll} toggleMemberLock={toggleMemberLock} removeAccess={removeAccess} />)}</tbody></table>
          </div>
          <div className="grid gap-4 lg:hidden">{staff.map((member) => <StaffCard key={member.id} member={member} busy={busyMemberId === member.id} busyAction={busyAction} openMenu={openMenuId === member.id} setOpenMenu={(open) => setOpenMenuId(open ? member.id : null)} changeRole={changeRole} changeStatus={changeStatus} openResetPassword={openResetPassword} signOutAll={signOutAll} toggleMemberLock={toggleMemberLock} removeAccess={removeAccess} />)}</div>
        </>}
      </section>
      {resetTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto overscroll-contain bg-black/60 p-4">
          <form onSubmit={submitResetPassword} className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="reset-password-title">
            <h2 id="reset-password-title" className="break-words text-lg font-black text-white">{resetTarget.role === "staff" || resetTarget.role === "kitchen" ? "Reset PIN" : "Reset Password"}</h2>
            <p className="mt-1 text-sm text-zinc-500">{resetTarget.name}</p>
            <div className="mt-4">
              <PasswordInput
                name="temporary_password"
                label={resetTarget.role === "staff" || resetTarget.role === "kitchen" ? "New 6-digit PIN" : "Temporary password"}
                value={resetPasswordValue}
                error={resetPasswordError}
                disabled={resetSaving}
                autoComplete="new-password"
                showChecklist={resetTarget.role === "owner" || resetTarget.role === "admin"}
                dark
                onChange={(value) => {
                  setResetPasswordValue(value);
                  setResetPasswordError(undefined);
                }}
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={resetSaving} onClick={() => setResetTarget(null)} className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-bold text-zinc-200">
                Cancel
              </button>
              <button disabled={resetSaving} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-600">
                {resetSaving ? "Resetting..." : resetTarget.role === "staff" || resetTarget.role === "kitchen" ? "Reset PIN" : "Reset Password"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

type StaffPresentationProps = {
  member: StaffAccountResponse;
  busy: boolean;
  busyAction: string | null;
  openMenu: boolean;
  setOpenMenu: (open: boolean) => void;
  changeRole: (member: StaffAccountResponse, role: string) => Promise<void>;
  changeStatus: (member: StaffAccountResponse, status: string) => Promise<void>;
  openResetPassword: (member: StaffAccountResponse) => void;
  signOutAll: (member: StaffAccountResponse) => Promise<void>;
  toggleMemberLock: (member: StaffAccountResponse) => Promise<void>;
  removeAccess: (member: StaffAccountResponse) => Promise<void>;
};

function StatusBadge({ member }: { member: StaffAccountResponse }) {
  const label = member.role === "owner" ? "Owner-protected" : member.operations_locked ? "Locked" : member.status === "active" ? "Active" : member.status === "suspended" ? "Suspended" : member.status;
  const style = member.role === "owner" ? "bg-violet-100 text-violet-800" : member.operations_locked ? "bg-red-100 text-red-800" : member.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900";
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-black capitalize ${style}`}>{label}</span>;
}

function RoleControl({ member, busy, changeRole }: Pick<StaffPresentationProps, "member" | "busy" | "changeRole">) {
  return <div><select aria-label={`Role for ${member.name}`} title={member.role === "owner" ? "The restaurant owner's role cannot be changed." : undefined} disabled={member.role === "owner" || busy} value={member.role} onChange={(event) => void changeRole(member, event.target.value)} className="min-h-10 w-full rounded-lg border border-zinc-300 bg-white px-2 text-sm font-semibold text-zinc-900 focus-visible:outline-2 focus-visible:outline-orange-500 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:bg-zinc-100 disabled:text-zinc-600"><option value="owner">Owner</option><option value="admin">Admin</option><option value="staff">Staff</option><option value="kitchen">Kitchen</option></select>{member.role === "owner" && <p className="mt-1 text-xs font-medium text-zinc-600">Owner role is protected.</p>}</div>;
}

function MemberActions(props: StaffPresentationProps) {
  const { member, busy, busyAction, openMenu, setOpenMenu, changeStatus, openResetPassword, signOutAll, toggleMemberLock, removeAccess } = props;
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!openMenu) return;
    const close = (event: MouseEvent) => { if (!menuRef.current?.contains(event.target as Node)) setOpenMenu(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpenMenu(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, [openMenu, setOpenMenu]);
  const run = (action: () => void | Promise<void>) => { setOpenMenu(false); void action(); };
  const owner = member.role === "owner";
  const primary = member.role === "staff"
    ? { label: member.operations_locked ? "Unlock account" : "Lock account", action: () => toggleMemberLock(member), positive: member.operations_locked }
    : member.status !== "active"
      ? { label: "Resume", action: () => changeStatus(member, "active"), positive: true }
      : { label: "Suspend", action: () => changeStatus(member, "suspended"), positive: false };
  return <div className="flex min-w-0 flex-wrap items-center gap-2">
    {!owner && <button type="button" disabled={busy} onClick={() => void primary.action()} className={`min-h-10 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-black transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-600 ${primary.positive ? "bg-emerald-700 text-white hover:bg-emerald-800" : "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50"}`}>{busy ? busyAction : primary.label}</button>}
    <button type="button" disabled={busy || member.active_session_count === 0} onClick={() => void signOutAll(member)} className="min-h-10 whitespace-nowrap rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-bold text-zinc-800 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:bg-zinc-100 disabled:text-zinc-500">Sign out sessions</button>
    <div className="relative" ref={menuRef}><button type="button" aria-label={`More actions for ${member.name}`} aria-haspopup="menu" aria-expanded={openMenu} disabled={busy} onClick={() => setOpenMenu(!openMenu)} className="min-h-10 min-w-10 rounded-lg border border-zinc-300 bg-white px-3 text-lg font-black text-zinc-800 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500">⋮</button>
      {openMenu && <div role="menu" aria-label={`More actions for ${member.name}`} className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl">
        <MenuAction label={member.role === "staff" || member.role === "kitchen" ? "Reset PIN" : "Reset password"} onClick={() => run(() => openResetPassword(member))} />
        {member.active_session_count > 0 && <MenuAction label="Sign out active sessions" onClick={() => run(() => signOutAll(member))} />}
        {!owner && member.role === "staff" && <MenuAction label={member.status === "active" ? "Suspend account" : "Resume account"} onClick={() => run(() => changeStatus(member, member.status === "active" ? "suspended" : "active"))} />}
        {!owner && member.role === "staff" && <MenuAction label={member.operations_locked ? "Unlock account" : "Lock account"} onClick={() => run(() => toggleMemberLock(member))} />}
        {!owner && <MenuAction label="Remove staff member" destructive onClick={() => run(() => removeAccess(member))} />}
        {owner && <p className="px-3 py-2 text-xs font-medium text-zinc-600">The restaurant owner cannot be suspended or removed.</p>}
      </div>}
    </div>
  </div>;
}

function MenuAction({ label, onClick, destructive = false }: { label: string; onClick: () => void; destructive?: boolean }) {
  return <button type="button" role="menuitem" onClick={onClick} className={`min-h-10 w-full rounded-lg px-3 py-2 text-left text-sm font-bold focus-visible:outline-2 focus-visible:outline-orange-500 ${destructive ? "text-red-700 hover:bg-red-50" : "text-zinc-800 hover:bg-zinc-100"}`}>{label}</button>;
}

function StaffRow(props: StaffPresentationProps) {
  const { member, busy, changeRole } = props;
  return <tr className="bg-white align-top text-zinc-900"><td className="p-4"><div className="font-black text-zinc-950">{member.name}</div><div className="mt-1 break-words text-xs font-semibold text-zinc-700">@{member.username || "no-username"}</div>{member.email && <div className="mt-0.5 break-words text-xs text-zinc-600">{member.email}</div>}<div className="mt-2 text-xs text-zinc-600">Added by {member.added_by_staff_id || "System"} · {fmt(member.created_at)}</div></td><td className="p-4"><RoleControl member={member} busy={busy} changeRole={changeRole} /></td><td className="p-4"><StatusBadge member={member} />{member.operations_locked && member.operations_lock_reason && <p className="mt-2 text-xs text-zinc-600">{member.operations_lock_reason}</p>}</td><td className="p-4 font-medium text-zinc-700" title={fmt(member.last_active_at)}>{relativeTime(member.last_active_at)}</td><td className="p-4 whitespace-nowrap font-medium text-zinc-700">{member.active_session_count ? `${member.active_session_count} active` : "No active sessions"}</td><td className="overflow-visible p-4"><MemberActions {...props} /></td></tr>;
}

function StaffCard(props: StaffPresentationProps) {
  const { member, busy, changeRole } = props;
  return <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-black text-zinc-950">{member.name}</h3><p className="mt-1 truncate text-sm font-semibold text-zinc-700">@{member.username || "no-username"}</p>{member.email && <p className="mt-0.5 break-all text-xs text-zinc-600">{member.email}</p>}</div><StatusBadge member={member} /></div><dl className="mt-5 grid grid-cols-2 gap-4 text-sm"><div><dt className="text-xs font-bold text-zinc-600">Last active</dt><dd className="mt-1 font-semibold text-zinc-900" title={fmt(member.last_active_at)}>{relativeTime(member.last_active_at)}</dd></div><div><dt className="text-xs font-bold text-zinc-600">Sessions</dt><dd className="mt-1 font-semibold text-zinc-900">{member.active_session_count ? `${member.active_session_count} active` : "No active sessions"}</dd></div></dl><div className="mt-4"><p className="mb-1.5 text-xs font-bold text-zinc-600">Role</p><RoleControl member={member} busy={busy} changeRole={changeRole} /></div><div className="mt-5 border-t border-zinc-200 pt-4"><MemberActions {...props} /></div></article>;
}

function FieldInput({
  name,
  label,
  hint,
  placeholder,
  value,
  onChange,
  error,
  type = "text",
  disabled,
  inputMode,
  maxLength,
  autoComplete,
}: {
  name: string;
  label: string;
  hint?: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  type?: string;
  disabled?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  maxLength?: number;
  autoComplete?: string;
}) {
  const errorId = `${name}-error`;
  const hintId = `${name}-hint`;
  return (
    <label className="flex flex-col gap-1.5 text-sm font-bold text-zinc-800">
      {label}
      <input
        name={name}
        type={type}
        className={`min-h-11 rounded-lg border bg-white px-3 py-2 text-sm font-medium text-zinc-900 outline-none focus-visible:outline-2 focus-visible:outline-orange-500 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500 ${
          error ? "border-red-500" : "border-zinc-300"
        }`}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        inputMode={inputMode}
        maxLength={maxLength}
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint && !error && <span id={hintId} className="text-xs font-medium text-zinc-600">{hint}</span>}
      {error && <span id={errorId} className="text-xs font-semibold text-red-700">{error}</span>}
    </label>
  );
}
