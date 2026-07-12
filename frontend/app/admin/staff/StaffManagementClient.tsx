"use client";

import type React from "react";
import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  createStaffAccount,
  getStaffAccounts,
  removeStaffAccess,
  resetStaffPassword,
  revokeStaffSessions,
  updateStaffAccount,
} from "@/lib/api";
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
    setSaving(true);
    setError(null);
    try {
      const created = await createStaffAccount(form);
      setStaff((prev) => [...prev, created]);
      setForm(EMPTY_FORM);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create staff account.");
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

  const resetPassword = async (member: StaffAccountResponse) => {
    const temporaryPassword = window.prompt(`Temporary password for ${member.name}:`);
    if (!temporaryPassword) return;
    replaceStaff(await resetStaffPassword(member.id, temporaryPassword));
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
        <input className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm" placeholder="username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })} />
        <input className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm" placeholder="email or phone" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <select className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as StaffAccountCreateRequest["role"] })}>
          <option value="staff">Staff</option>
          <option value="kitchen">Kitchen</option>
          <option value="admin">Admin</option>
        </select>
        <input className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm" placeholder="Temporary password" type="password" value={form.temporary_password} onChange={(e) => setForm({ ...form, temporary_password: e.target.value })} />
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
                      <button onClick={() => resetPassword(member)} className="px-2 py-1 rounded bg-zinc-800 text-zinc-200 text-xs font-bold">Reset Password</button>
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
    </div>
  );
}
