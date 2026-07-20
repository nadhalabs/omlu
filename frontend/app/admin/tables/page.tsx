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

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function AdminTablesPage() {
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

    const actionText = table.is_active ? "deactivate" : "activate";
    const confirm = window.confirm(
      `Are you sure you want to ${actionText} Table ${table.table_number}? Inactive tables cannot be used by customers to retrieve the menu or place new orders.`
    );
    if (!confirm) return;

    setUpdatingIds((prev) => ({ ...prev, [table.id]: true }));

    try {
      await updateAdminTable(table.id, { is_active: !table.is_active });
      // Reload tables from API to refresh active status list
      const data = await getAdminTables();
      setTables(data);
    } catch (err) {
      alert(`Status update rejected: ${getErrorMessage(err, "Update failed.")}`);
    } finally {
      setUpdatingIds((prev) => ({ ...prev, [table.id]: false }));
    }
  };

  // Regenerate Table Code
  const handleRegenerateCode = async (table: AdminTableResponse) => {
    if (updatingIds[table.id]) return;

    const confirm = window.confirm(
      `⚠️ WARNING: Regenerating the table code for Table ${table.table_number} will instantly invalidate the current QR code link. Customers scanning the old QR code will receive a "Table not found" error. Are you sure you want to proceed?`
    );
    if (!confirm) return;

    setUpdatingIds((prev) => ({ ...prev, [table.id]: true }));

    try {
      await regenerateAdminTableCode(table.id);
      // Reload tables
      const data = await getAdminTables();
      setTables(data);
      alert(`Success! Table ${table.table_number} code has been regenerated.`);
    } catch (err) {
      alert(`Regeneration failed: ${getErrorMessage(err, "Regeneration failed.")}`);
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
            <h1 className="text-3xl font-black tracking-tight text-white">
              Tables Management
            </h1>
            <p className="text-zinc-500 text-xs mt-1.5 font-bold">
              Register table mapping numbers, print QR codes, and configure active session codes
            </p>
          </div>

          <button
            onClick={handlePrint}
            disabled={activeTables.length === 0}
            className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:bg-zinc-800 disabled:text-zinc-500 text-sm font-bold text-white rounded-xl transition cursor-pointer flex items-center gap-2 select-none"
          >
            🖨️ Print All QRs ({activeTables.length})
          </button>
        </div>

        {/* Form and List Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {/* Add Table Column Form */}
          <div className="lg:col-span-1 bg-zinc-950/40 border border-zinc-850 rounded-3xl p-5 flex flex-col gap-4">
            <h2 className="text-sm font-black text-amber-500 uppercase tracking-wider border-b border-zinc-850 pb-3">
              Add New Table
            </h2>

            {formError && (
              <div className="bg-red-950/40 border border-red-900/50 text-red-400 text-xs font-semibold p-3 rounded-xl">
                ⚠️ {formError}
              </div>
            )}

            <form onSubmit={handleCreateTable} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">
                  Table Number / Identifier *
                </label>
                <input
                  type="text"
                  value={tableNumber}
                  onChange={(e) => setTableNumber(e.target.value)}
                  placeholder="e.g. 6 or T6"
                  className="w-full px-4 py-2.5 bg-zinc-905 border border-zinc-800 focus:border-amber-600 rounded-xl text-sm outline-none transition text-white placeholder-zinc-700"
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition cursor-pointer disabled:opacity-50"
              >
                {saving ? "Creating..." : "Create Table Mapping"}
              </button>
            </form>
          </div>

          {/* Tables Mappings List */}
          <div className="lg:col-span-2 bg-zinc-950/40 border border-zinc-850 rounded-3xl p-5 flex flex-col gap-4">
            <h2 className="text-sm font-black text-amber-500 uppercase tracking-wider border-b border-zinc-850 pb-3">
              Registered Tables Mapping ({tables.length})
            </h2>

            {loading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-amber-500 border-t-transparent"></div>
              </div>
            ) : error ? (
              <p className="text-xs text-red-400 py-6 font-semibold">{error}</p>
            ) : tables.length === 0 ? (
              <div className="text-center py-12 text-zinc-500">
                <span className="text-3xl block mb-2">📋</span>
                <p className="text-xs font-bold">No tables registered yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {tables.map((t) => (
                  <div
                    key={t.id}
                    className="bg-zinc-900 border border-zinc-800 hover:border-zinc-750 transition rounded-2xl p-4 flex flex-col gap-4 shadow-sm"
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2 border-b border-zinc-850 pb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-extrabold text-sm text-white">
                            Table {t.table_number}
                          </h3>
                          {!t.is_active && (
                            <span className="text-[8px] bg-red-950/40 border border-red-900/50 text-red-400 font-bold px-1.5 py-0.5 rounded uppercase">
                              Inactive
                            </span>
                          )}
                        </div>
                        <span className="text-zinc-500 text-[10px] font-mono mt-0.5 block">
                          Code: {t.table_code}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => startEditing(t)}
                          className="p-1 bg-zinc-800 hover:bg-zinc-750 rounded text-[10px] font-bold text-zinc-300 cursor-pointer"
                          title="Rename Table"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleToggleActive(t)}
                          className={`px-2 py-1 rounded text-[10px] font-bold transition cursor-pointer select-none ${
                            t.is_active
                              ? "bg-green-950/40 border border-green-900/40 text-green-400"
                              : "bg-zinc-800 hover:bg-zinc-700 text-zinc-400"
                          }`}
                        >
                          {t.is_active ? "Active" : "Inactive"}
                        </button>
                      </div>
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
                          className="text-[10px] text-amber-500 hover:text-amber-400 font-bold underline select-none"
                        >
                          Download QR PNG
                        </a>
                      </div>

                      {/* Code Actions Panel */}
                      <div className="flex flex-col gap-2 w-full sm:w-auto items-stretch sm:items-end">
                        <a
                          href={t.public_menu_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="py-1.5 px-3 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 font-bold rounded-xl text-center text-[10px] transition cursor-pointer select-none"
                        >
                          🔗 Open Public Menu
                        </a>

                        <button
                          onClick={() => handleRegenerateCode(t)}
                          disabled={updatingIds[t.id]}
                          className="py-1.5 px-3 bg-red-650/20 hover:bg-red-650/30 border border-red-900/40 text-red-400 font-bold rounded-xl text-[10px] transition cursor-pointer disabled:opacity-50 select-none"
                        >
                          🔄 Regenerate Code
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* EDIT TABLE MODAL */}
      {editingTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl max-w-sm w-full flex flex-col gap-4 shadow-2xl relative">
            <h3 className="text-lg font-black text-white">Rename Table</h3>

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
                  className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 focus:border-amber-600 rounded-xl text-sm outline-none transition text-white"
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
                  className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl cursor-pointer text-xs disabled:opacity-50"
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
