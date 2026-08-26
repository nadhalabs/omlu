"use client";

import { useCallback, useEffect, useState } from "react";
import { MenuOptionGroup } from "@/lib/types";

type Props = { itemId: number; itemName: string };
type PricingBehavior = "different" | "extra" | "none";
type DraftOption = { name: string; kitchen_display_name: string; amount: string; available: boolean; display_order: number };

const inputClass = "min-h-11 w-full min-w-0 rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] px-3 py-2.5 text-sm text-[var(--omlu-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500";

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(friendlyError(body?.detail));
  return body as T;
}

function friendlyError(detail: unknown) {
  const message = typeof detail === "string" ? detail : "";
  if (/maximum_selections.*minimum_selections|min.*max/i.test(message)) return "The minimum number of choices cannot be greater than the maximum.";
  if (/price_delta|amount.*non-negative|greater than or equal to 0/i.test(message)) return "Enter ₹0 or a higher amount.";
  if (/required.*minimum|min.*1/i.test(message)) return "A required choice must ask the customer to select at least one option.";
  return message || "Could not save specifications.";
}

function pricingFor(group: MenuOptionGroup): PricingBehavior {
  if (group.type === "variant") return "different";
  return group.options.every((option) => Number(option.price_delta) === 0) ? "none" : "extra";
}

function choosesOne(group: MenuOptionGroup) {
  return group.type === "variant" || group.maximum_selections === 1;
}

function move<T>(items: T[], from: number, to: number) {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [entry] = next.splice(from, 1);
  next.splice(to, 0, entry);
  return next;
}

function displayAmount(behavior: PricingBehavior, amount: string) {
  if (behavior === "none" || Number(amount) === 0) return "Included in item price";
  return behavior === "different" ? `₹${Number(amount).toFixed(2)}` : `+₹${Number(amount).toFixed(2)}`;
}

function GuidedChoices({
  name,
  selection,
  required,
  pricing,
  onSelection,
  onRequired,
  onPricing,
}: {
  name: string;
  selection: "one" | "multiple";
  required: boolean;
  pricing: PricingBehavior;
  onSelection: (value: "one" | "multiple") => void;
  onRequired: (value: boolean) => void;
  onPricing: (value: PricingBehavior) => void;
}) {
  return <div className="mt-4 grid gap-4">
    <fieldset>
      <legend className="text-sm font-semibold text-[var(--omlu-text-primary)]">Selection</legend>
      <div className="mt-2 grid grid-cols-2 rounded-xl bg-[var(--omlu-muted-surface)] p-1">
        {(["one", "multiple"] as const).map((value) => <label key={value} className={`flex min-h-11 cursor-pointer items-center justify-center rounded-lg px-3 text-center text-sm font-semibold transition ${selection === value ? "bg-[var(--omlu-primary-surface)] text-orange-700 shadow-sm dark:text-orange-400" : "text-[var(--omlu-text-secondary)]"}`}>
          <input type="radio" name={`${name}-selection`} value={value} checked={selection === value} onChange={() => onSelection(value)} className="sr-only" />
          {value === "one" ? "Single choice" : "Multiple choices"}
        </label>)}
      </div>
    </fieldset>

    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl border border-[var(--omlu-border)] px-3 py-2 text-sm font-semibold text-[var(--omlu-text-primary)]">
      <span><span className="block">Required</span><span className="block text-xs font-normal text-[var(--omlu-text-secondary)]">Customers must make a selection</span></span>
      <input type="checkbox" checked={required} onChange={(event) => onRequired(event.target.checked)} className="h-5 w-5 shrink-0 accent-orange-600" />
    </label>

    <label className="text-sm font-semibold text-[var(--omlu-text-primary)]">Pricing
      <select value={pricing} onChange={(event) => onPricing(event.target.value as PricingBehavior)} className={`${inputClass} mt-2`}>
        <option value="different" disabled={selection === "multiple"}>Set choice prices</option>
        <option value="extra">Add to item price</option>
        <option value="none">No price change</option>
      </select>
    </label>
    {selection === "multiple" && pricing !== "none" && <p className="-mt-2 text-xs leading-5 text-[var(--omlu-text-secondary)]">Multiple choices can add an extra amount. Choice-specific final prices are available for single-choice options.</p>}
  </div>;
}

function CustomerPreview({ name, selection, required, pricing, options }: { name: string; selection: "one" | "multiple"; required: boolean; pricing: PricingBehavior; options: Array<{ name: string; amount: string; available: boolean }> }) {
  return <details className="mt-4 rounded-xl bg-[var(--omlu-muted-surface)] px-4 py-3" aria-label="Customer preview">
    <summary className="min-h-6 cursor-pointer text-sm font-semibold text-[var(--omlu-text-primary)]">Preview</summary>
    <div className="mt-3 flex items-start justify-between gap-3"><h6 className="font-semibold text-[var(--omlu-text-primary)]">{name.trim() || "Option name"}</h6><span className="rounded-full bg-[var(--omlu-primary-surface)] px-2 py-1 text-xs font-medium text-[var(--omlu-text-secondary)]">{required ? "Required" : "Optional"}</span></div>
    <div className="mt-3 space-y-2">{options.filter((option) => option.available && option.name.trim()).map((option, index) => <div key={`${option.name}-${index}`} className="flex items-center justify-between gap-3 text-sm text-[var(--omlu-text-primary)]"><span><span aria-hidden="true" className="mr-2">{selection === "one" ? "○" : "□"}</span>{option.name}</span><span className="shrink-0 text-xs font-bold text-[var(--omlu-text-secondary)]">{displayAmount(pricing, option.amount)}</span></div>)}</div>
    {!options.some((option) => option.name.trim()) && <p className="mt-3 text-xs text-[var(--omlu-text-secondary)]">Add choices to see how this will look.</p>}
  </details>;
}

function DraftChoiceRows({ options, pricing, setOptions }: { options: DraftOption[]; pricing: PricingBehavior; setOptions: (options: DraftOption[]) => void }) {
  return <div className="space-y-2">{options.map((option, index) => <div key={index} className="rounded-xl bg-[var(--omlu-muted-surface)] p-3">
    <div className={`grid min-w-0 gap-3 ${pricing === "none" ? "" : "min-[460px]:grid-cols-[minmax(0,1fr)_140px]"}`}>
      <label className="text-xs font-bold text-[var(--omlu-text-secondary)]">Choice name<input value={option.name} onChange={(event) => setOptions(options.map((entry, position) => position === index ? { ...entry, name: event.target.value } : entry))} className={`${inputClass} mt-1`} placeholder="With Sugar" /></label>
      {pricing !== "none" && <label className="text-xs font-bold text-[var(--omlu-text-secondary)]">{pricing === "different" ? "Item price ₹" : "Extra price ₹"}<input type="number" min="0" step="0.01" value={option.amount} onChange={(event) => setOptions(options.map((entry, position) => position === index ? { ...entry, amount: event.target.value } : entry))} className={`${inputClass} mt-1`} /></label>}
    </div>
    {pricing === "none" && <p className="mt-2 text-xs text-[var(--omlu-text-secondary)]">No price change</p>}
    <details className="mt-2 px-1 py-1"><summary className="cursor-pointer text-xs font-semibold text-[var(--omlu-text-secondary)]">Advanced settings</summary><label className="mt-2 block text-xs font-bold text-[var(--omlu-text-secondary)]">Kitchen label <span className="font-normal">(optional)</span><input value={option.kitchen_display_name} onChange={(event) => setOptions(options.map((entry, position) => position === index ? { ...entry, kitchen_display_name: event.target.value } : entry))} className={`${inputClass} mt-1`} placeholder="Short kitchen label" /><span className="mt-1 block font-normal">Short text shown to kitchen staff.</span></label></details>
    <div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={index === 0} onClick={() => setOptions(move(options, index, index - 1))} className="min-h-11 rounded-lg bg-[var(--omlu-primary-surface)] px-3 py-2 text-xs font-semibold disabled:opacity-40">Move up</button><button type="button" disabled={index === options.length - 1} onClick={() => setOptions(move(options, index, index + 1))} className="min-h-11 rounded-lg bg-[var(--omlu-primary-surface)] px-3 py-2 text-xs font-semibold disabled:opacity-40">Move down</button><button type="button" disabled={options.length === 1} onClick={() => setOptions(options.filter((_, position) => position !== index))} className="min-h-11 rounded-lg px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-40 dark:text-red-300">Remove</button></div>
  </div>)}</div>;
}

export default function MenuOptionEditor({ itemId, itemName }: Props) {
  const [groups, setGroups] = useState<MenuOptionGroup[]>([]);
  const [pricing, setPricing] = useState<Record<number, PricingBehavior>>({});
  const [removed, setRemoved] = useState<Record<number, number[]>>({});
  const [name, setName] = useState("");
  const [selection, setSelection] = useState<"one" | "multiple">("one");
  const [newPricing, setNewPricing] = useState<PricingBehavior>("none");
  const [required, setRequired] = useState(true);
  const [minimum, setMinimum] = useState(1);
  const [maximum, setMaximum] = useState(1);
  const [options, setOptionsState] = useState<DraftOption[]>([{ name: "", kitchen_display_name: "", amount: "0", available: true, display_order: 0 }]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await jsonRequest<{ items: { id: number; option_groups: MenuOptionGroup[] }[] }>(`/api/staff/availability?search=${encodeURIComponent(itemName)}`);
    const loaded = response.items.find((item) => item.id === itemId)?.option_groups || [];
    setGroups(loaded);
    setPricing(Object.fromEntries(loaded.map((group) => [group.id, pricingFor(group)])));
    setRemoved({});
  }, [itemId, itemName]);

  useEffect(() => { const timeout = window.setTimeout(() => void load().catch((error) => setMessage(error.message)), 0); return () => window.clearTimeout(timeout); }, [load]);

  const setOptions = (next: DraftOption[]) => {
    if (selection === "multiple" && maximum >= options.length) setMaximum(Math.max(next.length, 1));
    setOptionsState(next.map((option, index) => ({ ...option, display_order: index })));
  };
  const updateGroup = (groupId: number, patch: Partial<MenuOptionGroup>) => setGroups((current) => current.map((group) => group.id === groupId ? { ...group, ...patch } : group));
  const optionCount = options.length;
  const normalizedNewMaximum = selection === "one" ? 1 : Math.max(maximum, required ? 1 : 0);

  const validate = (groupName: string, choices: Array<{ name: string; amount: string }>, min: number, max: number, isRequired: boolean) => {
    if (!groupName.trim()) return "Enter the question shown to the customer.";
    if (choices.some((option) => !option.name.trim())) return "Enter a name for every choice.";
    if (choices.some((option) => !Number.isFinite(Number(option.amount)) || Number(option.amount) < 0)) return "Enter ₹0 or a higher amount.";
    if (min > max) return "The minimum number of choices cannot be greater than the maximum.";
    if (isRequired && min < 1) return "A required choice must ask the customer to select at least one option.";
    return null;
  };

  const createGroup = async () => {
    const error = validate(name, options, required ? Math.max(1, minimum) : 0, normalizedNewMaximum, required);
    if (error) return setMessage(error);
    setSaving(true); setMessage(null);
    try {
      const group = await jsonRequest<MenuOptionGroup>("/api/admin/menu/option-groups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), type: newPricing === "different" ? "variant" : "addon", required, minimum_selections: selection === "one" ? (required ? 1 : 0) : (required ? Math.max(1, minimum) : 0), maximum_selections: normalizedNewMaximum, display_order: groups.length, active: true }) });
      for (const [index, option] of options.entries()) await jsonRequest("/api/admin/menu/options", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ group_id: group.id, name: option.name.trim(), kitchen_display_name: option.kitchen_display_name.trim() || null, price_delta: newPricing === "none" ? 0 : Number(option.amount), available: option.available, display_order: index }) });
      await jsonRequest(`/api/admin/menu/items/${itemId}/option-groups`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ option_group_id: group.id, display_order: groups.length, active: true }) });
      setName(""); setSelection("one"); setNewPricing("none"); setRequired(true); setMinimum(1); setMaximum(1); setOptions([{ name: "", kitchen_display_name: "", amount: "0", available: true, display_order: 0 }]);
      setMessage("Specification group saved."); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save specifications."); } finally { setSaving(false); }
  };

  const saveExisting = async (group: MenuOptionGroup) => {
    const behavior = pricing[group.id] || pricingFor(group);
    const one = choosesOne(group);
    const min = one ? (group.required ? 1 : 0) : group.minimum_selections;
    const max = one ? 1 : group.maximum_selections;
    const error = validate(group.name, group.options.map((option) => ({ name: option.name, amount: behavior === "none" ? "0" : option.price_delta })), min, max, group.required);
    if (error) return setMessage(error);
    setSaving(true); setMessage(null);
    try {
      await jsonRequest(`/api/admin/menu/option-groups/${group.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: group.name.trim(), type: behavior === "different" ? "variant" : "addon", required: group.required, minimum_selections: min, maximum_selections: max, display_order: group.display_order, active: group.active }) });
      for (const [index, option] of group.options.entries()) {
        const payload = { name: option.name.trim(), kitchen_display_name: option.kitchen_display_name?.trim() || null, price_delta: behavior === "none" ? 0 : Number(option.price_delta), available: option.available, display_order: index };
        if (option.id < 0) await jsonRequest("/api/admin/menu/options", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, group_id: group.id }) });
        else await jsonRequest(`/api/admin/menu/options/${option.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      }
      for (const optionId of removed[group.id] || []) await jsonRequest(`/api/admin/menu/options/${optionId}`, { method: "DELETE" });
      setMessage("Specifications updated."); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not update specifications."); } finally { setSaving(false); }
  };

  const changeExistingSelection = (group: MenuOptionGroup, next: "one" | "multiple") => {
    if (next === "one") updateGroup(group.id, { maximum_selections: 1, minimum_selections: group.required ? 1 : 0 });
    else { updateGroup(group.id, { type: "addon", required: false, minimum_selections: 0, maximum_selections: Math.max(group.options.length, 1) }); if ((pricing[group.id] || pricingFor(group)) === "different") setPricing((current) => ({ ...current, [group.id]: "none" })); }
  };

  return <section className="rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-4 sm:p-5">
    <h4 className="text-lg font-bold text-[var(--omlu-text-primary)]">Options</h4>
    <p className="mt-1 text-sm text-[var(--omlu-text-secondary)]">Let customers choose variations, preferences or extras.</p>
    {message && <p role="status" className="mt-3 rounded-xl bg-amber-500/10 px-3 py-2 text-sm font-bold text-amber-800 dark:text-amber-200">{message}</p>}

    <div className="mt-5 space-y-5">{groups.map((group) => {
      const behavior = pricing[group.id] || pricingFor(group);
      const groupSelection = choosesOne(group) ? "one" : "multiple";
      const groupOptions = group.options.map((option) => ({ name: option.name, amount: behavior === "none" ? "0" : option.price_delta, available: option.available }));
      return <article key={group.id} className="rounded-2xl border border-[var(--omlu-border)] p-4">
        <label className="text-sm font-semibold text-[var(--omlu-text-primary)]">Option name<input value={group.name} onChange={(event) => updateGroup(group.id, { name: event.target.value })} className={`${inputClass} mt-2`} placeholder="Choose size, preparation, extras…" /></label>
        <GuidedChoices name={`group-${group.id}`} selection={groupSelection} required={group.required} pricing={behavior} onSelection={(value) => changeExistingSelection(group, value)} onRequired={(value) => updateGroup(group.id, { required: value, minimum_selections: value ? Math.max(1, group.minimum_selections) : 0 })} onPricing={(value) => { setPricing((current) => ({ ...current, [group.id]: value })); updateGroup(group.id, { type: value === "different" ? "variant" : "addon", maximum_selections: value === "different" ? 1 : group.maximum_selections }); }} />
        <div className="mt-5"><h5 className="text-sm font-semibold text-[var(--omlu-text-primary)]">Choices</h5><div className="mt-2 space-y-2">{group.options.map((option, index) => <div key={option.id} className="rounded-xl bg-[var(--omlu-muted-surface)] p-3"><div className={`grid min-w-0 gap-3 ${behavior === "none" ? "" : "min-[460px]:grid-cols-[minmax(0,1fr)_140px]"}`}><label className="text-xs font-bold text-[var(--omlu-text-secondary)]">Choice name<input value={option.name} onChange={(event) => updateGroup(group.id, { options: group.options.map((entry, position) => position === index ? { ...entry, name: event.target.value } : entry) })} className={`${inputClass} mt-1`} /></label>{behavior !== "none" && <label className="text-xs font-bold text-[var(--omlu-text-secondary)]">{behavior === "different" ? "Item price ₹" : "Extra price ₹"}<input type="number" min="0" step="0.01" value={option.price_delta} onChange={(event) => updateGroup(group.id, { options: group.options.map((entry, position) => position === index ? { ...entry, price_delta: event.target.value } : entry) })} className={`${inputClass} mt-1`} /></label>}</div>{behavior === "none" && <p className="mt-2 text-xs text-[var(--omlu-text-secondary)]">No price change</p>}<details className="mt-2 px-1 py-1"><summary className="cursor-pointer text-xs font-semibold text-[var(--omlu-text-secondary)]">Advanced settings</summary><label className="mt-2 block text-xs font-bold text-[var(--omlu-text-secondary)]">Kitchen label <span className="font-normal">(optional)</span><input value={option.kitchen_display_name || ""} onChange={(event) => updateGroup(group.id, { options: group.options.map((entry, position) => position === index ? { ...entry, kitchen_display_name: event.target.value } : entry) })} className={`${inputClass} mt-1`} /><span className="mt-1 block font-normal">Short text shown to kitchen staff.</span></label></details><div className="mt-2 flex flex-wrap items-center gap-2"><button type="button" disabled={index === 0} onClick={() => updateGroup(group.id, { options: move(group.options, index, index - 1) })} className="min-h-11 rounded-lg bg-[var(--omlu-primary-surface)] px-3 py-2 text-xs font-semibold disabled:opacity-40">Move up</button><button type="button" disabled={index === group.options.length - 1} onClick={() => updateGroup(group.id, { options: move(group.options, index, index + 1) })} className="min-h-11 rounded-lg bg-[var(--omlu-primary-surface)] px-3 py-2 text-xs font-semibold disabled:opacity-40">Move down</button><button type="button" disabled={group.options.length === 1} onClick={() => { if (option.id > 0) setRemoved((current) => ({ ...current, [group.id]: [...(current[group.id] || []), option.id] })); updateGroup(group.id, { options: group.options.filter((_, position) => position !== index) }); }} className="min-h-11 rounded-lg px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-40 dark:text-red-300">Remove</button><label className="ml-auto flex min-h-11 items-center text-xs font-semibold text-[var(--omlu-text-secondary)]"><input type="checkbox" checked={option.available} onChange={(event) => updateGroup(group.id, { options: group.options.map((entry, position) => position === index ? { ...entry, available: event.target.checked } : entry) })} className="mr-2 h-4 w-4 accent-orange-600" />Available</label></div></div>)}</div><button type="button" onClick={() => updateGroup(group.id, { options: [...group.options, { id: -Date.now(), group_id: group.id, name: "", kitchen_display_name: null, price_delta: "0.00", available: true, display_order: group.options.length }] })} className="mt-3 min-h-11 rounded-xl bg-[var(--omlu-muted-surface)] px-4 py-2.5 text-sm font-semibold text-[var(--omlu-text-primary)]">+ Add choice</button></div><CustomerPreview name={group.name} selection={groupSelection} required={group.required} pricing={behavior} options={groupOptions} />
        <details className="mt-4 rounded-xl bg-[var(--omlu-muted-surface)] p-3"><summary className="cursor-pointer text-sm font-black text-[var(--omlu-text-primary)]">Advanced settings</summary><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-[var(--omlu-text-secondary)]">Minimum choices<input type="number" min="0" value={groupSelection === "one" ? (group.required ? 1 : 0) : group.minimum_selections} disabled={groupSelection === "one"} onChange={(event) => updateGroup(group.id, { minimum_selections: Number(event.target.value) })} className={`${inputClass} mt-1 disabled:opacity-60`} /></label><label className="text-xs font-bold text-[var(--omlu-text-secondary)]">Maximum choices<input type="number" min="1" value={groupSelection === "one" ? 1 : group.maximum_selections} disabled={groupSelection === "one"} onChange={(event) => updateGroup(group.id, { maximum_selections: Number(event.target.value) })} className={`${inputClass} mt-1 disabled:opacity-60`} /></label></div></details>
        <button type="button" disabled={saving} onClick={() => void saveExisting(group)} className="mt-4 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-black text-[var(--omlu-primary-action-text)] disabled:opacity-50">{saving ? "Saving…" : "Save changes"}</button>
      </article>;
    })}</div>

    <article className="mt-6 rounded-2xl border border-[var(--omlu-border)] p-4">
      <h5 className="text-base font-semibold text-[var(--omlu-text-primary)]">Add option</h5>
      <label className="mt-4 block text-sm font-semibold text-[var(--omlu-text-primary)]">Option name<input value={name} onChange={(event) => setName(event.target.value)} className={`${inputClass} mt-2`} placeholder="Choose size, preparation, extras…" /></label>
      <GuidedChoices name="new-group" selection={selection} required={required} pricing={newPricing} onSelection={(value) => { setSelection(value); if (value === "one") { setRequired(true); setMinimum(1); setMaximum(1); } else { setRequired(false); setMinimum(0); setMaximum(Math.max(optionCount, 1)); if (newPricing === "different") setNewPricing("none"); } }} onRequired={(value) => { setRequired(value); setMinimum(value ? Math.max(1, minimum) : 0); }} onPricing={(value) => { setNewPricing(value); if (value === "different") { setSelection("one"); setMaximum(1); } if (value === "none") setOptions(options.map((option) => ({ ...option, amount: "0" }))); }} />
      <div className="mt-5"><h6 className="text-sm font-semibold text-[var(--omlu-text-primary)]">Choices</h6><div className="mt-2"><DraftChoiceRows options={options} pricing={newPricing} setOptions={setOptions} /></div><button type="button" onClick={() => setOptions([...options, { name: "", kitchen_display_name: "", amount: "0", available: true, display_order: options.length }])} className="mt-3 min-h-11 rounded-xl bg-[var(--omlu-muted-surface)] px-4 py-2.5 text-sm font-semibold text-[var(--omlu-text-primary)]">+ Add choice</button></div><CustomerPreview name={name} selection={selection} required={required} pricing={newPricing} options={options} />
      <details className="mt-4 rounded-xl bg-[var(--omlu-muted-surface)] p-3"><summary className="cursor-pointer text-sm font-black text-[var(--omlu-text-primary)]">Advanced settings</summary><p className="mt-2 text-xs text-[var(--omlu-text-secondary)]">Choice order is maintained automatically from the order shown above.</p>{selection === "multiple" && <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-[var(--omlu-text-secondary)]">Minimum choices<input type="number" min={required ? 1 : 0} value={minimum} onChange={(event) => setMinimum(Number(event.target.value))} className={`${inputClass} mt-1`} /></label><label className="text-xs font-bold text-[var(--omlu-text-secondary)]">Maximum choices<input type="number" min="1" value={maximum} onChange={(event) => setMaximum(Number(event.target.value))} className={`${inputClass} mt-1`} /></label></div>}</details>
      <button type="button" disabled={saving} onClick={() => void createGroup()} className="mt-4 min-h-11 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-bold text-[var(--omlu-primary-action-text)] disabled:opacity-50">{saving ? "Saving…" : "Create option"}</button>
    </article>
  </section>;
}
