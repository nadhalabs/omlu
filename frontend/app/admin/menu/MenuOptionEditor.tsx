"use client";

import { useCallback, useEffect, useState } from "react";
import { MenuOptionGroup } from "@/lib/types";

type Props = { itemId: number; itemName: string };
type DraftOption = { name: string; kitchen_display_name: string; amount: string; available: boolean; display_order: number };

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.detail || "Could not save specifications.");
  return body as T;
}

export default function MenuOptionEditor({ itemId, itemName }: Props) {
  const [groups, setGroups] = useState<MenuOptionGroup[]>([]);
  const [name, setName] = useState("");
  const [type, setType] = useState<"variant" | "addon">("variant");
  const [required, setRequired] = useState(true);
  const [minimum, setMinimum] = useState(1);
  const [maximum, setMaximum] = useState(1);
  const [displayOrder, setDisplayOrder] = useState(0);
  const [options, setOptions] = useState<DraftOption[]>([
    { name: "", kitchen_display_name: "", amount: "", available: true, display_order: 0 },
  ]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await jsonRequest<{ items: { id: number; option_groups: MenuOptionGroup[] }[] }>(
      `/api/staff/availability?search=${encodeURIComponent(itemName)}`,
    );
    setGroups(response.items.find((item) => item.id === itemId)?.option_groups || []);
  }, [itemId, itemName]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load().catch((error) => setMessage(error.message)), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const createGroup = async () => {
    if (!name.trim() || options.some((option) => !option.name.trim() || Number(option.amount) < 0)) {
      setMessage("Complete the group name, option labels, and non-negative amounts.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const group = await jsonRequest<MenuOptionGroup>("/api/admin/menu/option-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(), type, required,
          minimum_selections: required ? Math.max(1, minimum) : minimum,
          maximum_selections: type === "variant" ? 1 : maximum,
          display_order: displayOrder, active: true,
        }),
      });
      for (const option of options) {
        await jsonRequest("/api/admin/menu/options", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            group_id: group.id, name: option.name.trim(),
            kitchen_display_name: option.kitchen_display_name.trim() || null,
            price_delta: Number(option.amount), available: option.available,
            display_order: option.display_order,
          }),
        });
      }
      await jsonRequest(`/api/admin/menu/items/${itemId}/option-groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ option_group_id: group.id, display_order: displayOrder, active: true }),
      });
      setName("");
      setOptions([{ name: "", kitchen_display_name: "", amount: "", available: true, display_order: 0 }]);
      setMessage("Specification group saved.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save specifications.");
    } finally {
      setSaving(false);
    }
  };

  const updateGroup = (groupId: number, patch: Partial<MenuOptionGroup>) =>
    setGroups((current) => current.map((group) => group.id === groupId ? { ...group, ...patch } : group));

  const saveExisting = async (group: MenuOptionGroup) => {
    setSaving(true);
    setMessage(null);
    try {
      await jsonRequest(`/api/admin/menu/option-groups/${group.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: group.name, type: group.type, required: group.required,
          minimum_selections: group.required ? Math.max(1, group.minimum_selections) : group.minimum_selections,
          maximum_selections: group.type === "variant" ? 1 : group.maximum_selections,
          display_order: group.display_order, active: group.active,
        }),
      });
      for (const option of group.options) {
        await jsonRequest(`/api/admin/menu/options/${option.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: option.name, kitchen_display_name: option.kitchen_display_name?.trim() || null,
            price_delta: Number(option.price_delta),
            available: option.available, display_order: option.display_order,
          }),
        });
      }
      setMessage("Specifications updated.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update specifications.");
    } finally {
      setSaving(false);
    }
  };

  return <section className="rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-4">
    <h4 className="font-black text-[var(--omlu-text-primary)]">Options & specifications</h4>
    <p className="mt-1 text-xs text-[var(--omlu-text-secondary)]">Variants use a final customer price. Add-ons use an amount added to the base price.</p>
    {message && <p className="mt-2 text-xs font-bold text-amber-300">{message}</p>}
    <div className="mt-3 space-y-3">
      {groups.map((group) => <div key={group.id} className="rounded-xl border border-[var(--omlu-border)] p-3">
        <div className="grid gap-2 sm:grid-cols-4">
          <input aria-label="Option-group name" value={group.name} onChange={(event) => updateGroup(group.id, { name: event.target.value })} className="rounded border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-2 text-[var(--omlu-text-primary)]" />
          <select value={group.type} onChange={(event) => updateGroup(group.id, { type: event.target.value as "variant" | "addon", maximum_selections: event.target.value === "variant" ? 1 : group.maximum_selections })} className="rounded border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-2 text-[var(--omlu-text-primary)]"><option value="variant">Single-select / final price</option><option value="addon">Multi-select / price adjustment</option></select>
          <label className="text-xs text-[var(--omlu-text-secondary)]"><input type="checkbox" checked={group.required} onChange={(event) => updateGroup(group.id, { required: event.target.checked })} /> Required</label>
          <label className="text-xs text-[var(--omlu-text-secondary)]">Sort <input type="number" min="0" value={group.display_order} onChange={(event) => updateGroup(group.id, { display_order: Number(event.target.value) })} className="w-16 rounded bg-[var(--omlu-primary-surface)] p-1" /></label>
          <label className="text-xs text-[var(--omlu-text-secondary)]">Min <input type="number" min="0" value={group.minimum_selections} onChange={(event) => updateGroup(group.id, { minimum_selections: Number(event.target.value) })} className="w-16 rounded bg-[var(--omlu-primary-surface)] p-1" /></label>
          <label className="text-xs text-[var(--omlu-text-secondary)]">Max <input type="number" min="0" disabled={group.type === "variant"} value={group.type === "variant" ? 1 : group.maximum_selections} onChange={(event) => updateGroup(group.id, { maximum_selections: Number(event.target.value) })} className="w-16 rounded bg-[var(--omlu-primary-surface)] p-1 disabled:bg-[var(--omlu-muted-surface)] disabled:text-[var(--omlu-text-secondary)]" /></label>
        </div>
        <div className="mt-2 space-y-2">{group.options.map((option, optionIndex) => <div key={option.id} className="flex flex-wrap items-center gap-2">
          <input aria-label="Option label" value={option.name} onChange={(event) => updateGroup(group.id, { options: group.options.map((entry, index) => index === optionIndex ? { ...entry, name: event.target.value } : entry) })} className="rounded border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-2 text-[var(--omlu-text-primary)]" />
          <input aria-label="Kitchen display label" placeholder="Short kitchen label (optional)" value={option.kitchen_display_name || ""} onChange={(event) => updateGroup(group.id, { options: group.options.map((entry, index) => index === optionIndex ? { ...entry, kitchen_display_name: event.target.value } : entry) })} className="min-w-52 rounded border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-2 text-[var(--omlu-text-primary)]" />
          <label className="text-xs text-[var(--omlu-text-secondary)]">{group.type === "variant" ? "Final price ₹" : "Adds ₹"}<input type="number" min="0" step="0.01" value={option.price_delta} onChange={(event) => updateGroup(group.id, { options: group.options.map((entry, index) => index === optionIndex ? { ...entry, price_delta: event.target.value } : entry) })} className="ml-1 w-24 rounded bg-[var(--omlu-primary-surface)] p-2 text-[var(--omlu-text-primary)]" /></label>
          <label className="text-xs text-[var(--omlu-text-secondary)]"><input type="checkbox" checked={option.available} onChange={(event) => updateGroup(group.id, { options: group.options.map((entry, index) => index === optionIndex ? { ...entry, available: event.target.checked } : entry) })} /> Available</label>
        </div>)}</div>
        <button type="button" disabled={saving} onClick={() => void saveExisting(group)} className="mt-3 rounded-lg bg-[var(--omlu-muted-surface)] px-3 py-2 text-xs font-black text-[var(--omlu-text-primary)] disabled:bg-[var(--omlu-muted-surface)] disabled:text-[var(--omlu-text-secondary)]">Save group</button>
      </div>)}
    </div>
    <div className="mt-4 rounded-xl border border-dashed border-[var(--omlu-border)] p-3">
      <h5 className="text-xs font-black uppercase text-orange-400">Add option group</h5>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <input placeholder="Group name" value={name} onChange={(event) => setName(event.target.value)} className="rounded border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-2 text-[var(--omlu-text-primary)]" />
        <select value={type} onChange={(event) => { const next = event.target.value as "variant" | "addon"; setType(next); if (next === "variant") setMaximum(1); }} className="rounded border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-2 text-[var(--omlu-text-primary)]"><option value="variant">Single-select / final price</option><option value="addon">Multi-select / adjustment</option></select>
        <label className="text-xs text-[var(--omlu-text-secondary)]"><input type="checkbox" checked={required} onChange={(event) => setRequired(event.target.checked)} /> Required</label>
        <label className="text-xs text-[var(--omlu-text-secondary)]">Min <input type="number" min="0" value={minimum} onChange={(event) => setMinimum(Number(event.target.value))} className="w-16 rounded bg-[var(--omlu-primary-surface)] p-1" /></label>
        <label className="text-xs text-[var(--omlu-text-secondary)]">Max <input type="number" min="0" disabled={type === "variant"} value={maximum} onChange={(event) => setMaximum(Number(event.target.value))} className="w-16 rounded bg-[var(--omlu-primary-surface)] p-1 disabled:bg-[var(--omlu-muted-surface)] disabled:text-[var(--omlu-text-secondary)]" /></label>
        <label className="text-xs text-[var(--omlu-text-secondary)]">Sort <input type="number" min="0" value={displayOrder} onChange={(event) => setDisplayOrder(Number(event.target.value))} className="w-16 rounded bg-[var(--omlu-primary-surface)] p-1" /></label>
      </div>
      <div className="mt-2 space-y-2">{options.map((option, index) => <div key={index} className="flex flex-wrap gap-2">
        <input placeholder="Option label" value={option.name} onChange={(event) => setOptions((current) => current.map((entry, position) => position === index ? { ...entry, name: event.target.value } : entry))} className="rounded border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-2 text-[var(--omlu-text-primary)]" />
        <input placeholder="Short kitchen label (optional)" value={option.kitchen_display_name} onChange={(event) => setOptions((current) => current.map((entry, position) => position === index ? { ...entry, kitchen_display_name: event.target.value } : entry))} className="min-w-52 rounded border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-2 text-[var(--omlu-text-primary)]" />
        <label className="text-xs text-[var(--omlu-text-secondary)]">{type === "variant" ? "Final price ₹" : "Adds ₹"}<input type="number" min="0" step="0.01" value={option.amount} onChange={(event) => setOptions((current) => current.map((entry, position) => position === index ? { ...entry, amount: event.target.value } : entry))} className="ml-1 w-24 rounded bg-[var(--omlu-primary-surface)] p-2 text-[var(--omlu-text-primary)]" /></label>
      </div>)}</div>
      <div className="mt-2 flex gap-2"><button type="button" onClick={() => setOptions((current) => [...current, { name: "", kitchen_display_name: "", amount: "", available: true, display_order: current.length }])} className="rounded bg-[var(--omlu-muted-surface)] px-3 py-2 text-xs font-bold text-[var(--omlu-text-primary)]">+ Option</button><button type="button" disabled={saving} onClick={() => void createGroup()} className="rounded bg-orange-600 px-3 py-2 text-xs font-black text-[var(--omlu-primary-action-text)] disabled:bg-[var(--omlu-muted-surface)] disabled:text-[var(--omlu-text-secondary)]">{saving ? "Saving…" : "Save new group"}</button></div>
    </div>
  </section>;
}
