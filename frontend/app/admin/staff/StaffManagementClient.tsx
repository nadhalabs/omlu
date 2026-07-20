"use client";

import type React from "react";
import { useCallback, useEffect, useState } from "react";
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
  const createFieldOrder: (keyof StaffAccountCreateRequest)[] = ["name", "username", "role", "email", "temporary_password", "pin", "confirm_pin"];

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
    replaceStaff(await updateStaffAccount(member.id, { role }));
  };

  const changeStatus = async (member: StaffAccountResponse, status: string) => {
    let reason: string | undefined;
    if (status === "active") { if (!await confirmDialog({ title: `Reactivate ${member.name}?`, message: "Account access will be restored immediately.", confirmLabel: "Reactivate account" })) return; }
    else { const entered = await inputDialog({ title: `Suspend ${member.name}?`, message: "This account will lose access immediately.", label: "Reason", placeholder: "Shift completed", required: false, confirmLabel: "Suspend account", tone: "destructive" }); if (entered === null) return; reason = entered || undefined; }
    replaceStaff(await updateStaffAccount(member.id, { status, reason }));
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
    if (!await confirmDialog({ title: `Sign out ${member.name}?`, message: "All active sessions for this account will be revoked immediately.", confirmLabel: "Sign out sessions" })) return;
    replaceStaff(await revokeStaffSessions(member.id));
  };

  const removeAccess = async (member: StaffAccountResponse) => {
    if (!await confirmDialog({ title: `Remove ${member.name}'s access?`, message: "This immediately signs them out and removes their restaurant access.", confirmLabel: "Remove access", cancelLabel: "Keep access", tone: "destructive" })) return;
    await removeStaffAccess(member.id);
    setStaff((prev) => prev.filter((item) => item.id !== member.id));
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
    try { replaceStaff(await setStaffLocked(member.id, locking, reason)); }
    catch (err) { uiToast(err instanceof ApiError ? err.message : "Could not update Staff lock.", "error"); }
  };

  const changeRestaurantStatus = async (nextStatus: "open" | "closing" | "closed") => {
    if (!operations || nextStatus === operations.operating_status) return;
    const copy = nextStatus === "closed" ? "New QR sessions and customer orders will be blocked. Staff operational actions will also be locked. Existing records will not be deleted." : nextStatus === "closing" ? "New customer sessions will be blocked while existing operations may continue." : "Customer ordering and normal restaurant operations will resume.";
    if (!await confirmDialog({ title: `Set restaurant as ${nextStatus}?`, message: copy, confirmLabel: `Set as ${nextStatus[0].toUpperCase()}${nextStatus.slice(1)}`, tone: nextStatus === "closed" ? "destructive" : "default" })) return;
    try { setOperations(await setRestaurantOperatingStatus(nextStatus)); uiToast(`Restaurant status changed to ${nextStatus}.`, "success"); }
    catch (err) { uiToast(err instanceof ApiError ? err.message : "Could not update restaurant status.", "error"); }
  };

  return (
    <div className="flex flex-col gap-6">
      <FormToast message={toast} onDismiss={() => setToast(null)} dark />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-white">Staff Management</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Restaurant-scoped accounts. No shared staff passcodes.
          </p>
        </div>
        <button
          onClick={loadStaff}
          className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm font-bold text-zinc-200"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-800/40 bg-red-950/20 px-4 py-3 text-sm font-semibold text-red-300">
          {error}
        </div>
      )}

      {operations && (
        <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-black text-white">Restaurant Staff Access</h2>
              <p className={`mt-1 text-sm font-bold ${operations.locked ? "text-red-300" : "text-emerald-300"}`}>
                All Staff: {operations.locked ? "Locked" : "Unlocked"}
              </p>
              {operations.locked && <p className="mt-1 text-xs text-zinc-400">Locked by {operations.locked_by_name || "Admin"} · {fmt(operations.locked_at)}{operations.reason ? ` · ${operations.reason}` : ""}</p>}
            </div>
            <button onClick={toggleAllStaff} className={`rounded-lg px-4 py-2 text-sm font-black text-white ${operations.locked ? "bg-emerald-700" : "bg-red-700"}`}>
              {operations.locked ? "Unlock Staff" : "Lock All Staff"}
            </button>
            <label className="text-xs font-bold text-zinc-400">Restaurant
              <select value={operations.operating_status} onChange={(e) => void changeRestaurantStatus(e.target.value as "open" | "closing" | "closed")} className="ml-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-white">
                <option value="open">Open</option><option value="closing">Closing</option><option value="closed">Closed</option>
              </select>
            </label>
          </div>
          <p className="mt-3 text-xs text-zinc-500">{operations.occupied_tables} active tables · {operations.unserved_orders} unserved orders · {operations.pending_requests} pending requests · {operations.bills_waiting_for_payment} bills awaiting payment</p>
        </section>
      )}

      <form onSubmit={submitCreate} className="grid grid-cols-1 lg:grid-cols-7 gap-3 bg-zinc-950 border border-zinc-800 rounded-xl p-4">
        <FieldInput name="name" placeholder="Name" value={form.name} error={fieldErrors.name} disabled={saving} onChange={(value) => setForm({ ...form, name: value })} />
        <FieldInput name="username" placeholder="e.g. nadha" value={form.username} error={fieldErrors.username} disabled={saving} onChange={(value) => setForm({ ...form, username: value.toLowerCase() })} />
        <select name="role" className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm" value={form.role} disabled={saving} onChange={(e) => changeCreateRole(e.target.value as StaffAccountCreateRequest["role"])}>
          <option value="staff">Staff</option>
          <option value="kitchen">Kitchen</option>
          <option value="admin">Admin</option>
        </select>
        {form.role === "admin" && <FieldInput name="email" placeholder="Email" type="email" value={form.email || ""} error={fieldErrors.email} disabled={saving} onChange={(value) => setForm({ ...form, email: value })} />}
        {form.role === "staff" || form.role === "kitchen" ? <>
          <FieldInput name="pin" placeholder="6-digit PIN" type="password" value={form.pin || ""} error={fieldErrors.pin} disabled={saving} inputMode="numeric" maxLength={6} onChange={(value) => setForm({ ...form, pin: value.replace(/\D/g, "").slice(0, 6) })} />
          <FieldInput name="confirm_pin" placeholder="Confirm PIN" type="password" value={form.confirm_pin || ""} error={fieldErrors.confirm_pin} disabled={saving} inputMode="numeric" maxLength={6} onChange={(value) => setForm({ ...form, confirm_pin: value.replace(/\D/g, "").slice(0, 6) })} />
        </> : <>
          <PasswordInput name="temporary_password" label="Temporary password" value={form.temporary_password || ""} error={fieldErrors.temporary_password} disabled={saving} autoComplete="new-password" showChecklist dark onChange={(value) => setForm({ ...form, temporary_password: value })} />
          <div />
        </>}
        <button disabled={saving} className="rounded-lg bg-orange-600 hover:bg-orange-700 disabled:bg-zinc-800 px-4 py-2 text-sm font-black text-white">
          {saving ? "Adding..." : "Add Staff"}
        </button>
      </form>

      {loading ? (
        <div className="text-zinc-500 text-sm">Loading staff accounts...</div>
      ) : (
        <div className="overflow-x-auto border border-zinc-800 rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-zinc-950 text-zinc-400 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="text-left p-3">Staff</th>
                <th className="text-left p-3">Role</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Last active</th>
                <th className="text-left p-3">Created</th>
                <th className="text-left p-3">Sessions</th>
                <th className="text-left p-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {staff.map((member) => (
                <tr key={member.id} className="bg-zinc-900/70">
                  <td className="p-3">
                    <div className="font-bold text-white">{member.name}</div>
                    <div className="text-xs text-zinc-500">{member.username || "-"}{member.email ? ` · ${member.email}` : ""}</div>
                    <div className="text-[10px] text-zinc-600">Added by: {member.added_by_staff_id || "System"}</div>
                  </td>
                  <td className="p-3">
                    <select disabled={member.role === "owner"} value={member.role} onChange={(e) => changeRole(member, e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1">
                      <option value="owner">Owner</option>
                      <option value="admin">Admin</option>
                      <option value="staff">Staff</option>
                      <option value="kitchen">Kitchen</option>
                    </select>
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded-md text-xs font-bold ${member.operations_locked ? "bg-red-950/60 text-red-300" : member.status === "active" ? "bg-emerald-950/40 text-emerald-300" : "bg-zinc-800 text-zinc-300"}`}>
                      {member.operations_locked ? "Locked" : member.status}
                    </span>
                    {member.operations_locked && <div className="mt-2 text-[10px] text-zinc-500">By {member.operations_locked_by_name || "Admin"}{member.operations_lock_reason ? ` · ${member.operations_lock_reason}` : ""}</div>}
                  </td>
                  <td className="p-3 text-zinc-400">{fmt(member.last_active_at)}</td>
                  <td className="p-3 text-zinc-400">{fmt(member.created_at)}</td>
                  <td className="p-3 text-zinc-400">{member.active_session_count} active</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2">
                      {member.status !== "active" ? (
                        <button onClick={() => changeStatus(member, "active")} className="px-2 py-1 rounded bg-emerald-700 text-white text-xs font-bold">Reactivate</button>
                      ) : (
                        <button disabled={member.role === "owner"} onClick={() => changeStatus(member, "suspended")} className="px-2 py-1 rounded bg-zinc-800 text-zinc-200 text-xs font-bold disabled:opacity-40">Suspend</button>
                      )}
                      <button onClick={() => openResetPassword(member)} className="px-2 py-1 rounded bg-zinc-800 text-zinc-200 text-xs font-bold">{member.role === "staff" || member.role === "kitchen" ? "Reset PIN" : "Reset Password"}</button>
                      <button onClick={() => signOutAll(member)} className="px-2 py-1 rounded bg-zinc-800 text-zinc-200 text-xs font-bold">Sign Out</button>
                      {member.role === "staff" && <button onClick={() => toggleMemberLock(member)} className={`px-2 py-1 rounded text-white text-xs font-bold ${member.operations_locked ? "bg-emerald-700" : "bg-red-800"}`}>{member.operations_locked ? "Unlock Account" : "Lock Account"}</button>}
                      <button disabled={member.role === "owner"} onClick={() => removeAccess(member)} className="px-2 py-1 rounded bg-red-950/70 text-red-200 text-xs font-bold disabled:opacity-40">Remove</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {resetTarget && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4">
          <form onSubmit={submitResetPassword} className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl">
            <h2 className="text-lg font-black text-white">{resetTarget.role === "staff" || resetTarget.role === "kitchen" ? "Reset PIN" : "Reset Password"}</h2>
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
              <button disabled={resetSaving} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-black text-white disabled:bg-zinc-800">
                {resetSaving ? "Resetting..." : resetTarget.role === "staff" || resetTarget.role === "kitchen" ? "Reset PIN" : "Reset Password"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function FieldInput({
  name,
  placeholder,
  value,
  onChange,
  error,
  type = "text",
  disabled,
  inputMode,
  maxLength,
}: {
  name: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  type?: string;
  disabled?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  maxLength?: number;
}) {
  return (
    <label className="flex flex-col gap-1">
      <input
        name={name}
        type={type}
        className={`bg-zinc-900 border rounded-lg px-3 py-2 text-sm outline-none focus:border-orange-600 ${
          error ? "border-red-500" : "border-zinc-800"
        }`}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        inputMode={inputMode}
        maxLength={maxLength}
        aria-invalid={Boolean(error)}
        onChange={(event) => onChange(event.target.value)}
      />
      {error && <span className="text-xs font-semibold text-red-300">{error}</span>}
    </label>
  );
}
