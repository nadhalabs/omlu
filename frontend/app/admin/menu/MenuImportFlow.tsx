"use client";

import { useRef, useState } from "react";
import { confirmAdminMenuImport, scanAdminMenu } from "@/lib/api";
import { AdminCategoryResponse, MenuImportDraftItem, MenuImportResponse } from "@/lib/types";

type Props = {
  categories: AdminCategoryResponse[];
  onClose: () => void;
  onImported: (summary: { imported: number; skipped: number }) => Promise<void>;
};

const confidenceThreshold = 0.75;

export default function MenuImportFlow({ categories, onClose, onImported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [result, setResult] = useState<MenuImportResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bulkCategory, setBulkCategory] = useState("");

  const update = (id: string, patch: Partial<MenuImportDraftItem>) => {
    setResult((current) => current ? {
      ...current,
      items: current.items.map((item) => item.id === id ? { ...item, ...patch } : item),
    } : current);
  };

  const scan = async () => {
    if (!files.length) return setError("Select at least one menu photo.");
    setBusy(true);
    setError(null);
    try {
      setResult(await scanAdminMenu(files));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Menu scan failed.");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!result) return;
    const invalid = result.items.find((item) =>
      item.selected && (!item.item_name.trim() || !item.category_name?.trim() || item.price === null)
    );
    if (invalid) return setError(`Complete the category and price for “${invalid.item_name}”.`);
    setBusy(true);
    setError(null);
    try {
      const summary = await confirmAdminMenuImport(result.id, result.items);
      await onImported(summary);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Menu import failed.");
    } finally {
      setBusy(false);
    }
  };

  const reviewCount = result?.items.filter((item) =>
    item.price === null || !item.category_name || item.item_confidence < confidenceThreshold ||
    item.category_confidence < confidenceThreshold || item.warnings.length > 0 || item.duplicate
  ).length || 0;
  const categoryCount = new Set(result?.items.map((item) => item.category_name).filter(Boolean)).size;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-4 backdrop-blur-sm">
      <div className="mx-auto my-4 w-full max-w-6xl rounded-3xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-black text-[var(--omlu-text-primary)]">{result ? "Menu scan completed" : "Upload menu photos"}</h3>
            {!result && <p className="mt-1 text-xs font-semibold text-[var(--omlu-text-secondary)]">Maximum 5 images · JPG, PNG or WebP · 10 MB each</p>}
          </div>
          <button onClick={onClose} disabled={busy} className="rounded-lg bg-[var(--omlu-muted-surface)] px-3 py-2 text-xs font-bold text-[var(--omlu-text-secondary)]">Close</button>
        </div>

        {error && <div className="mt-4 rounded-xl border border-red-900 bg-red-950/40 p-3 text-xs font-semibold text-red-300">{error}</div>}

        {!result ? (
          <div className="mt-6 flex flex-col items-center rounded-2xl border border-dashed border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-10">
            <input ref={inputRef} hidden type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(event) => {
              const selected = Array.from(event.target.files || []).slice(0, 5);
              setFiles(selected);
              setError(event.target.files && event.target.files.length > 5 ? "Only the first 5 photos were selected." : null);
            }} />
            <button onClick={() => inputRef.current?.click()} className="rounded-xl bg-[var(--omlu-muted-surface)] px-5 py-3 text-sm font-black text-[var(--omlu-text-primary)] hover:bg-[var(--omlu-muted-surface)]">Select photos</button>
            <p className="mt-3 text-xs text-[var(--omlu-text-secondary)]">{files.length ? files.map((file) => file.name).join(", ") : "No photos selected"}</p>
            <button onClick={scan} disabled={busy || !files.length} className="mt-6 rounded-xl bg-orange-600 px-6 py-3 text-sm font-black text-[var(--omlu-text-primary)] disabled:opacity-40">
              {busy ? "Scanning menu…" : "Scan Menu"}
            </button>
          </div>
        ) : (
          <>
            <div className="mt-5 grid grid-cols-3 gap-3">
              {[[result.items.length, "items"], [categoryCount, "categories"], [reviewCount, "need review"]].map(([value, label]) => (
                <div key={String(label)} className="rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-4"><strong className="block text-2xl text-[var(--omlu-text-primary)]">{value}</strong><span className="text-xs font-bold text-[var(--omlu-text-secondary)]">{label}</span></div>
              ))}
            </div>
            {result.general_warnings.length > 0 && <div className="mt-4 rounded-xl border border-yellow-800/60 bg-yellow-950/30 p-3 text-xs text-yellow-300">{result.general_warnings.join(" · ")}</div>}
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <select value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)} className="rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] px-3 py-2 text-xs text-[var(--omlu-text-primary)]">
                <option value="">Bulk category…</option>
                {categories.map((category) => <option key={category.id} value={category.name_en}>{category.name_en}</option>)}
              </select>
              <button onClick={() => {
                if (!bulkCategory) return;
                setResult({ ...result, items: result.items.map((item) => item.selected ? { ...item, category_name: bulkCategory, category_confidence: 1 } : item) });
              }} className="rounded-xl bg-[var(--omlu-muted-surface)] px-3 py-2 text-xs font-bold text-[var(--omlu-text-primary)]">Assign to selected</button>
            </div>
            <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--omlu-border)]">
              <table className="w-full min-w-[900px] text-left text-xs">
                <thead className="bg-[var(--omlu-primary-surface)] text-[var(--omlu-text-secondary)]"><tr>{["Import", "Category", "Item", "Price", "Type", "Warning", ""].map((h) => <th key={h} className="p-3 font-black uppercase">{h}</th>)}</tr></thead>
                <tbody>
                  {result.items.map((item) => {
                    const low = item.item_confidence < confidenceThreshold || item.category_confidence < confidenceThreshold;
                    const warning = item.price === null ? "Missing price" : item.duplicate ? "Duplicate item" : !item.category_name ? "Category unclear" : item.warnings.join("; ");
                    return <tr key={item.id} className={`border-t border-[var(--omlu-border)] ${item.price === null ? "bg-red-950/20" : low ? "bg-yellow-950/20" : ""}`}>
                      <td className="p-3"><input type="checkbox" checked={item.selected} onChange={(e) => update(item.id, { selected: e.target.checked })} /></td>
                      <td className="p-2"><input list="menu-import-categories" value={item.category_name || ""} onChange={(e) => update(item.id, { category_name: e.target.value })} placeholder="Select category" className="w-40 rounded-lg border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-2 text-[var(--omlu-text-primary)]" /></td>
                      <td className="p-2">
                        <input value={item.item_name} onChange={(e) => update(item.id, { item_name: e.target.value })} className="w-44 rounded-lg border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-2 text-[var(--omlu-text-primary)]" />
                        {item.variants.length > 0 && <div className="mt-2 space-y-1 rounded-lg border border-amber-800/60 bg-amber-950/20 p-2">
                          <div className="font-black text-amber-300">Confirm final option prices</div>
                          {item.variants.map((variant, index) => <div key={`${item.id}-${index}`} className="flex gap-1">
                            <input aria-label={`Variant ${index + 1} name`} value={variant.name} onChange={(event) => update(item.id, { variants: item.variants.map((entry, position) => position === index ? { ...entry, name: event.target.value } : entry) })} className="w-24 rounded border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-1 text-[var(--omlu-text-primary)]" />
                            <label className="flex items-center gap-1 text-[var(--omlu-text-secondary)]">Final ₹<input aria-label={`${variant.name} final price`} type="number" min="0" step="0.01" value={variant.price} onChange={(event) => update(item.id, { variants: item.variants.map((entry, position) => position === index ? { ...entry, price: Number(event.target.value) } : entry) })} className="w-20 rounded border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-1 text-[var(--omlu-text-primary)]" /></label>
                          </div>)}
                          <p className="text-[10px] text-amber-200">These are final customer prices, not amounts added to the base price.</p>
                        </div>}
                      </td>
                      <td className="p-2"><input type="number" min="0" step="0.01" value={item.price ?? ""} onChange={(e) => update(item.id, { price: e.target.value === "" ? null : Number(e.target.value) })} className="w-24 rounded-lg border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-2 text-[var(--omlu-text-primary)]" /></td>
                      <td className="p-2"><select value={item.food_type} onChange={(e) => update(item.id, { food_type: e.target.value as MenuImportDraftItem["food_type"] })} className="rounded-lg border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-2 text-[var(--omlu-text-primary)]"><option value="veg">Veg</option><option value="non_veg">Non-veg</option><option value="egg">Egg</option><option value="unknown">Unknown</option></select></td>
                      <td className={`p-3 font-semibold ${item.price === null ? "text-red-400" : warning ? "text-yellow-300" : "text-[var(--omlu-text-secondary)]"}`}>
                        {warning || "—"}
                        {item.duplicate && <select value={item.duplicate_action || "skip"} onChange={(e) => update(item.id, { duplicate_action: e.target.value as MenuImportDraftItem["duplicate_action"] })} className="mt-2 block rounded border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-1 text-[var(--omlu-text-primary)]"><option value="skip">Skip imported item</option><option value="replace">Replace existing item</option><option value="keep_both">Keep both</option></select>}
                      </td>
                      <td className="p-2"><button onClick={() => setResult({ ...result, items: result.items.filter((row) => row.id !== item.id) })} className="text-red-400">Delete</button></td>
                    </tr>;
                  })}
                </tbody>
              </table>
              <datalist id="menu-import-categories">{categories.map((category) => <option key={category.id} value={category.name_en} />)}</datalist>
            </div>
            <div className="mt-5 flex justify-end"><button onClick={confirm} disabled={busy} className="rounded-xl bg-orange-600 px-6 py-3 text-sm font-black text-[var(--omlu-text-primary)] disabled:opacity-50">{busy ? "Importing…" : "Confirm Import"}</button></div>
          </>
        )}
      </div>
    </div>
  );
}
