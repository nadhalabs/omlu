"use client";

import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { FormToast } from "@/components/FormToast";
import { PasswordInput } from "@/components/PasswordInput";
import {
  ApiError,
  createStaffAccount,
  getStaffAccounts,
  removeStaffAccess,
  resetStaffPassword,
  revokeStaffSessions,
  updateStaffAccount,
} from "@/lib/api";
import {
  backendFieldName,
  FieldErrors,
  firstError,
  focusField,
  validatePassword,
  validateStaffAccount,
} from "@/lib/formValidation";
import { StaffAccountCreateRequest, StaffAccountResponse } from "@/lib/types";

const EMPTY_FORM: StaffAccountCreateRequest = {
  name: "",
  username: "",
  email: "",
  role: "staff",
  temporary_password: "",
};

function fmt(value: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

export default function StaffManagementClient() {
  const [staff, setStaff] = useState<StaffAccountResponse[]>([]);
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
  const createFieldOrder: (keyof StaffAccountCreateRequest)[] = ["name", "username", "email", "role", "temporary_password"];

  const loadStaff = useCallback(async () => {
    setLoading(true);
    try {
      setStaff(await getStaffAccounts());
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
    if (!window.confirm(`Change ${member.name}'s role to ${role}?`)) return;
    replaceStaff(await updateStaffAccount(member.id, { role }));
  };

  const changeStatus = async (member: StaffAccountResponse, status: string) => {
    const reason = status === "active" ? undefined : window.prompt(`Reason for ${status}:`) || undefined;
    if (!window.confirm(`${status === "active" ? "Reactivate" : "Change access for"} ${member.name}?`)) return;
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
    const passwordError = validatePassword(resetPasswordValue, { personalUsername: resetTarget.username || undefined });
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
    if (!window.confirm(`Sign out all active sessions for ${member.name}?`)) return;
    replaceStaff(await revokeStaffSessions(member.id));
  };

  const removeAccess = async (member: StaffAccountResponse) => {
    if (!window.confirm(`Remove access for ${member.name}? This immediately signs them out.`)) return;
    await removeStaffAccess(member.id);
    setStaff((prev) => prev.filter((item) => item.id !== member.id));
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

      <form onSubmit={submitCreate} className="grid grid-cols-1 lg:grid-cols-6 gap-3 bg-zinc-950 border border-zinc-800 rounded-xl p-4">
        <FieldInput name="name" placeholder="Name" value={form.name} error={fieldErrors.name} disabled={saving} onChange={(value) => setForm({ ...form, name: value })} />
        <FieldInput name="username" placeholder="username" value={form.username} error={fieldErrors.username} disabled={saving} onChange={(value) => setForm({ ...form, username: value.toLowerCase() })} />
        <FieldInput name="email" placeholder="email" type="email" value={form.email} error={fieldErrors.email} disabled={saving} onChange={(value) => setForm({ ...form, email: value })} />
        <select name="role" className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm" value={form.role} disabled={saving} onChange={(e) => setForm({ ...form, role: e.target.value as StaffAccountCreateRequest["role"] })}>
          <option value="staff">Staff</option>
          <option value="kitchen">Kitchen</option>
          <option value="admin">Admin</option>
        </select>
        <PasswordInput name="temporary_password" label="Temporary password" value={form.temporary_password} error={fieldErrors.temporary_password} disabled={saving} autoComplete="new-password" showChecklist dark onChange={(value) => setForm({ ...form, temporary_password: value })} />
        <button disabled={saving} className="rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-zinc-800 px-4 py-2 text-sm font-black text-white">
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
                    <div className="text-xs text-zinc-500">{member.username || "-"} · {member.email}</div>
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
                    <span className={`px-2 py-1 rounded-md text-xs font-bold ${member.status === "active" ? "bg-emerald-950/40 text-emerald-300" : "bg-zinc-800 text-zinc-300"}`}>
                      {member.status}
                    </span>
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
                      <button onClick={() => openResetPassword(member)} className="px-2 py-1 rounded bg-zinc-800 text-zinc-200 text-xs font-bold">Reset Password</button>
                      <button onClick={() => signOutAll(member)} className="px-2 py-1 rounded bg-zinc-800 text-zinc-200 text-xs font-bold">Sign Out</button>
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
            <h2 className="text-lg font-black text-white">Reset Password</h2>
            <p className="mt-1 text-sm text-zinc-500">{resetTarget.name}</p>
            <div className="mt-4">
              <PasswordInput
                name="temporary_password"
                label="Temporary password"
                value={resetPasswordValue}
                error={resetPasswordError}
                disabled={resetSaving}
                autoComplete="new-password"
                showChecklist
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
              <button disabled={resetSaving} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-black text-white disabled:bg-zinc-800">
                {resetSaving ? "Resetting..." : "Reset Password"}
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
}: {
  name: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <input
        name={name}
        type={type}
        className={`bg-zinc-900 border rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-600 ${
          error ? "border-red-500" : "border-zinc-800"
        }`}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        onChange={(event) => onChange(event.target.value)}
      />
      {error && <span className="text-xs font-semibold text-red-300">{error}</span>}
    </label>
  );
}
