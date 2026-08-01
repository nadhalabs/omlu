"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import {
  getAdminTables,
  createAdminTable,
  updateAdminTable,
  regenerateAdminTableCode,
  getStaffMe,
} from "@/lib/api";
import { AdminTableResponse } from "@/lib/types";
import { useOmluUi } from "@/components/OmluUiProvider";
import { useModalScrollLock } from "@/components/useModalScrollLock";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function AdminTablesPage() {
  const { confirm: confirmDialog, toast } = useOmluUi();
  const [tables, setTables] = useState<AdminTableResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Restaurant details for headers & printing
  const [restaurantName, setRestaurantName] = useState<string>("OMLU");

  // Form inputs
  const [tableNumber, setTableNumber] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Edit Table states
  const [editingTable, setEditingTable] = useState<AdminTableResponse | null>(null);
  const [editTableNumber, setEditTableNumber] = useState("");
  const [editFormError, setEditFormError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  // Simple loading flags for actions (ID -> bool)
  const [updatingIds, setUpdatingIds] = useState<Record<number, boolean>>({});

  useModalScrollLock(Boolean(editingTable), () => {
    if (!editSaving) setEditingTable(null);
  });

  // Initial load
  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getAdminTables();
      setTables(data);
      setError(null);
    } catch (e) {
      setError(getErrorMessage(e, "Failed to load tables list."));
    } finally {
      setLoading(false);
    }

    try {
      const staff = await getStaffMe();
      setRestaurantName(staff.restaurant_name);
    } catch {
      // Fail silently, fallback already set
    }
  };

  useEffect(() => {
    const timeout = window.setTimeout(() => loadData(), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  // Handle Create Table
  const handleCreateTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    if (!tableNumber.trim()) {
      setFormError("Table number is required.");
      return;
    }
    if (tableNumber.length > 50) {
      setFormError("Table number cannot exceed 50 characters.");
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      await createAdminTable({ table_number: tableNumber.trim() });
      setTableNumber("");
      // Reload from server to get new code and URL
      const data = await getAdminTables();
      setTables(data);
    } catch (err) {
      setFormError(getErrorMessage(err, "Failed to create table."));
    } finally {
      setSaving(false);
    }
  };

  // Handle Edit Table Submission
  const handleEditTableSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editSaving || !editingTable) return;

    if (!editTableNumber.trim()) {
      setEditFormError("Table number is required.");
      return;
    }

    setEditSaving(true);
    setEditFormError(null);

    try {
      await updateAdminTable(editingTable.id, {
        table_number: editTableNumber.trim(),
      });
      setEditingTable(null);
      // Reload tables
      const data = await getAdminTables();
      setTables(data);
    } catch (err) {
      setEditFormError(getErrorMessage(err, "Failed to edit table number."));
    } finally {
      setEditSaving(false);
    }
  };

  // Toggle Table Active Status (Deactivate / Inactivate)
  const handleToggleActive = async (table: AdminTableResponse) => {
    if (updatingIds[table.id]) return;

    if (!await confirmDialog({ title: `${table.is_active ? "Deactivate" : "Activate"} Table ${table.table_number}?`, message: table.is_active ? "Customers will no longer be able to open the menu or place new orders from this table." : "Customer menu and ordering access will be restored for this table.", confirmLabel: table.is_active ? "Deactivate table" : "Activate table", tone: table.is_active ? "destructive" : "default" })) return;

    setUpdatingIds((prev) => ({ ...prev, [table.id]: true }));

    try {
      await updateAdminTable(table.id, { is_active: !table.is_active });
      // Reload tables from API to refresh active status list
      const data = await getAdminTables();
      setTables(data);
    } catch (err) {
      toast(`Status update rejected: ${getErrorMessage(err, "Update failed.")}`, "error");
    } finally {
      setUpdatingIds((prev) => ({ ...prev, [table.id]: false }));
    }
  };

  // Regenerate Table Code
  const handleRegenerateCode = async (table: AdminTableResponse) => {
    if (updatingIds[table.id]) return;

    if (!await confirmDialog({ title: `Regenerate Table ${table.table_number} QR code?`, message: "The current QR link will stop working immediately. Customers scanning the old code will not be able to open this table.", confirmLabel: "Regenerate code", tone: "destructive" })) return;

    setUpdatingIds((prev) => ({ ...prev, [table.id]: true }));

    try {
      await regenerateAdminTableCode(table.id);
      // Reload tables
      const data = await getAdminTables();
      setTables(data);
      toast(`Table ${table.table_number} code regenerated.`, "success");
    } catch (err) {
      toast(`Regeneration failed: ${getErrorMessage(err, "Regeneration failed.")}`, "error");
    } finally {
      setUpdatingIds((prev) => ({ ...prev, [table.id]: false }));
    }
  };

  // Trigger Print Browser Flow
  const handlePrint = () => {
    window.print();
  };

  // Open Edit Dialog
  const startEditing = (table: AdminTableResponse) => {
    setEditingTable(table);
    setEditTableNumber(table.table_number);
    setEditFormError(null);
  };

  const activeTables = tables.filter((t) => t.is_active);

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Print Cards Layout (Hidden on Screen, Shown during Print) */}
      <div className="hidden print:grid print:grid-cols-2 print:gap-10 print:bg-white print:text-black">
        {activeTables.map((t) => (
          <div
            key={t.id}
            className="border-4 border-double border-zinc-400 rounded-3xl p-8 flex flex-col items-center justify-between gap-4 text-center bg-white page-break-inside-avoid min-h-[360px]"
          >
            <div>
              <h2 className="text-xl font-black uppercase tracking-widest text-zinc-500">
                {restaurantName}
              </h2>
              <h1 className="text-4xl font-extrabold tracking-tight mt-1 text-black">
                TABLE {t.table_number}
              </h1>
            </div>

            {/* Render dynamically via proxy PNG URL */}
            <div className="relative w-48 h-48 border border-zinc-200 p-2 rounded-xl flex items-center justify-center bg-white">
              <Image
                src={`/api/admin/tables/${t.id}/qr`}
                alt={`Table ${t.table_number} QR Code`}
                fill
                sizes="192px"
                unoptimized
                className="object-contain p-2"
              />
            </div>

            <div>
              <p className="text-sm font-bold text-zinc-800">
                Scan to view menu & order
              </p>
              <p className="text-[10px] text-zinc-400 font-bold mt-1 uppercase">
                OMLU QR Menu
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* 2. Screen Standard Layout (Hidden during Print) */}
      <div className="flex flex-col gap-6 print:hidden">
        {/* Header Title Block */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-zinc-950">
              Tables Management
            </h1>
            <p className="mt-1.5 text-sm font-medium text-zinc-600">
              Create tables, manage public access, and print QR codes.
            </p>
          </div>

          <button
            onClick={handlePrint}
            disabled={activeTables.length === 0}
            className="flex min-h-11 items-center gap-2 rounded-xl border border-zinc-300 bg-white px-5 py-2.5 text-sm font-bold text-zinc-800 transition hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
          >
            <span aria-hidden="true">⎙</span> Print all QR codes ({activeTables.length})
          </button>
        </div>

        {/* Form and List Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {/* Add Table Column Form */}
          <section className="flex flex-col gap-4 rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm lg:col-span-1">
            <h2 className="border-b border-zinc-200 pb-3 text-lg font-black text-zinc-950">
              Add new table
            </h2>

            {formError && (
              <div className="bg-red-950/40 border border-red-900/50 text-red-400 text-xs font-semibold p-3 rounded-xl">
                ⚠️ {formError}
              </div>
            )}

            <form onSubmit={handleCreateTable} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="new-table-number" className="text-sm font-bold text-zinc-800">
                  Table number or identifier
                </label>
                <input
                  id="new-table-number"
                  type="text"
                  value={tableNumber}
                  onChange={(e) => setTableNumber(e.target.value)}
                  placeholder="e.g. 6 or T6"
                  aria-describedby="new-table-help" className="min-h-11 w-full rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 outline-none focus-visible:outline-2 focus-visible:outline-orange-500"
                />
                <p id="new-table-help" className="text-xs font-medium text-zinc-600">Use the label guests and staff recognize, such as 6 or T6.</p>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="min-h-11 self-start rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-black text-white transition hover:bg-orange-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-600 sm:w-auto"
              >
                {saving ? "Creating..." : "Create Table"}
              </button>
            </form>
          </section>

          {/* Tables Mappings List */}
          <section className="flex flex-col gap-4 rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm lg:col-span-2">
            <h2 className="border-b border-zinc-200 pb-3 text-lg font-black text-zinc-950">
              Registered tables <span className="text-sm font-bold text-zinc-600">({tables.length})</span>
            </h2>

            {loading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-orange-500 border-t-transparent"></div>
              </div>
            ) : error ? (
              <p className="text-xs text-red-400 py-6 font-semibold">{error}</p>
            ) : tables.length === 0 ? (
              <div className="text-center py-12 text-zinc-500">
                <span className="text-3xl block mb-2">📋</span>
                <p className="text-xs font-bold">No tables registered yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {tables.map((t) => (
                  <div
                    key={t.id}
                    className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 shadow-sm transition hover:border-zinc-300"
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2 border-b border-zinc-200 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-extrabold text-zinc-950">
                            Table {t.table_number}
                          </h3>
                          {!t.is_active && (
                            <span className="whitespace-nowrap rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase text-amber-900">
                              Inactive
                            </span>
                          )}
                        </div>
                        <span className="mt-1 block break-all font-mono text-xs font-semibold text-zinc-600" title={t.table_code}>
                          Public code: {t.table_code}
                        </span>
                      </div>

                      <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-black ${t.is_active ? "border border-green-300 bg-green-100 text-green-800" : "border border-zinc-300 bg-zinc-200 text-zinc-700"}`}>{t.is_active ? "Active" : "Inactive"}</span>
                    </div>

                    {/* QR Code and Actions */}
                    <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start justify-between">
                      {/* Interactive Preview & Download */}
                      <div className="flex flex-col items-center gap-2">
                        <div className="relative w-32 h-32 border border-zinc-800 p-1.5 rounded-xl bg-white flex items-center justify-center">
                          <Image
                            src={`/api/admin/tables/${t.id}/qr`}
                            alt={`Table ${t.table_number} QR Preview`}
                            fill
                            sizes="128px"
                            unoptimized
                            className="object-contain p-1.5"
                          />
                        </div>
                        {/* Download link through binary proxy route */}
                        <a
                          href={`/api/admin/tables/${t.id}/qr`}
                          download className="min-h-11 rounded-xl border border-zinc-300 bg-white px-4 py-3 text-center text-xs font-bold text-zinc-800 transition hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-orange-500"
                        >
                          Download QR
                        </a>
                      </div>

                      {/* Code Actions Panel */}
                      <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
                        <a
                          href={t.public_menu_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-h-11 rounded-xl bg-orange-600 px-4 py-3 text-center text-xs font-black text-white transition hover:bg-orange-700 focus-visible:outline-2 focus-visible:outline-orange-500"
                        >
                          Open public menu
                        </a>
                        <details className="relative"><summary aria-label={`More actions for Table ${t.table_number}`} className="flex min-h-11 cursor-pointer list-none items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 text-xs font-bold text-zinc-800 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-orange-500">More actions</summary><div className="absolute right-0 z-20 mt-2 w-52 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl"><button onClick={() => startEditing(t)} className="min-h-10 w-full rounded-lg px-3 text-left text-sm font-bold text-zinc-800 hover:bg-zinc-100">Edit table</button><button onClick={() => handleToggleActive(t)} disabled={updatingIds[t.id]} className="min-h-10 w-full rounded-lg px-3 text-left text-sm font-bold text-zinc-800 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500">{t.is_active ? "Deactivate table" : "Activate table"}</button><button onClick={() => handleRegenerateCode(t)} disabled={updatingIds[t.id]} className="min-h-10 w-full rounded-lg px-3 text-left text-sm font-bold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500">Regenerate code</button></div></details>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* EDIT TABLE MODAL */}
      {editingTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overscroll-contain bg-black/75 p-4 backdrop-blur-xs">
          <div className="relative flex max-h-[calc(100dvh-2rem)] w-full max-w-sm flex-col gap-4 overflow-y-auto rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="rename-table-title">
            <h3 id="rename-table-title" className="text-lg font-black text-white">Rename Table</h3>

            {editFormError && (
              <div className="bg-red-950/40 border border-red-900/50 text-red-400 text-xs font-semibold p-3 rounded-xl">
                ⚠️ {editFormError}
              </div>
            )}

            <form onSubmit={handleEditTableSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">
                  Table Number / Identifier *
                </label>
                <input
                  type="text"
                  value={editTableNumber}
                  onChange={(e) => setEditTableNumber(e.target.value)}
                  className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 focus:border-orange-600 rounded-xl text-sm outline-none transition text-white"
                />
              </div>

              <div className="flex items-center gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => setEditingTable(null)}
                  className="flex-1 py-2.5 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 font-bold rounded-xl cursor-pointer text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSaving}
                  className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl cursor-pointer text-xs disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-600"
                >
                  {editSaving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
