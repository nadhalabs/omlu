"use client";

import React, { useRef, useState } from "react";
import { confirmAdminMenuImport, scanAdminMenu } from "@/lib/api";
import {
  AdminCategoryResponse,
  MenuImportDraftItem,
  MenuImportResponse,
  MenuOptionDraft,
  MenuOptionGroupDraft,
} from "@/lib/types";

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
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  const update = (id: string, patch: Partial<MenuImportDraftItem>) => {
    setResult((current) =>
      current
        ? {
            ...current,
            items: current.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
          }
        : current
    );
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

    // Validate selected items
    for (const item of result.items) {
      if (!item.selected) continue;
      if (!item.item_name.trim()) return setError(`Enter a name for all imported items.`);
      if (!item.category_name?.trim()) return setError(`Select a category for “${item.item_name}”.`);

      const hasVariantGroup = (item.option_groups || []).some((og) => og.type === "variant");
      if (item.price === null && !hasVariantGroup) {
        return setError(`Specify a price for “${item.item_name}”.`);
      }

      // Validate option groups
      for (const group of item.option_groups || []) {
        if (!group.name.trim()) return setError(`Name option group in “${item.item_name}”.`);
        if (!group.options.length) return setError(`Add at least one choice to “${group.name}” in “${item.item_name}”.`);

        for (const opt of group.options) {
          if (!opt.name.trim()) return setError(`Name all choices in “${group.name}” of “${item.item_name}”.`);
          if (group.type === "variant" && (opt.final_price === undefined || opt.final_price === null || opt.final_price < 0)) {
            return setError(`Specify a non-negative final price for choice “${opt.name}” in “${item.item_name}”.`);
          }
          if (group.type === "addon" && (opt.price_delta === undefined || opt.price_delta === null || opt.price_delta < 0)) {
            return setError(`Specify a non-negative added price for choice “${opt.name}” in “${item.item_name}”.`);
          }
        }
      }
    }

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

  // Option Group helper actions
  const addOptionGroup = (itemId: string) => {
    const item = result?.items.find((i) => i.id === itemId);
    if (!item) return;

    const newGroup: MenuOptionGroupDraft = {
      name: "Choice Group",
      type: "addon",
      required: false,
      minimum_selections: 0,
      maximum_selections: 1,
      options: [{ name: "Choice 1", price_delta: 0, final_price: null }],
    };

    update(itemId, {
      option_groups: [...(item.option_groups || []), newGroup],
    });
  };

  const updateOptionGroup = (
    itemId: string,
    groupIndex: number,
    patch: Partial<MenuOptionGroupDraft>
  ) => {
    const item = result?.items.find((i) => i.id === itemId);
    if (!item) return;

    const updatedGroups = (item.option_groups || []).map((og, idx) => {
      if (idx !== groupIndex) return og;

      const merged = { ...og, ...patch };

      // Handle type switch validation / transformation
      if (patch.type === "variant" && og.type !== "variant") {
        merged.required = true;
        merged.minimum_selections = 1;
        merged.maximum_selections = 1;
        merged.options = merged.options.map((opt) => ({
          ...opt,
          final_price: opt.price_delta ?? item.price ?? 0,
          price_delta: null,
        }));
      } else if (patch.type === "addon" && og.type !== "addon") {
        merged.options = merged.options.map((opt) => ({
          ...opt,
          price_delta: opt.final_price ?? 0,
          final_price: null,
        }));
      }

      return merged;
    });

    update(itemId, { option_groups: updatedGroups });
  };

  const removeOptionGroup = (itemId: string, groupIndex: number) => {
    const item = result?.items.find((i) => i.id === itemId);
    if (!item) return;

    update(itemId, {
      option_groups: (item.option_groups || []).filter((_, idx) => idx !== groupIndex),
    });
  };

  const addOptionToGroup = (itemId: string, groupIndex: number) => {
    const item = result?.items.find((i) => i.id === itemId);
    if (!item) return;

    const updatedGroups = (item.option_groups || []).map((og, idx) => {
      if (idx !== groupIndex) return og;

      const newOpt: MenuOptionDraft =
        og.type === "variant"
          ? { name: `Choice ${og.options.length + 1}`, final_price: item.price || 0, price_delta: null }
          : { name: `Choice ${og.options.length + 1}`, price_delta: 0, final_price: null };

      return {
        ...og,
        maximum_selections: Math.max(og.maximum_selections, og.options.length + 1),
        options: [...og.options, newOpt],
      };
    });

    update(itemId, { option_groups: updatedGroups });
  };

  const updateOptionInGroup = (
    itemId: string,
    groupIndex: number,
    optionIndex: number,
    patch: Partial<MenuOptionDraft>
  ) => {
    const item = result?.items.find((i) => i.id === itemId);
    if (!item) return;

    const updatedGroups = (item.option_groups || []).map((og, idx) => {
      if (idx !== groupIndex) return og;

      const updatedOptions = og.options.map((opt, oIdx) =>
        oIdx === optionIndex ? { ...opt, ...patch } : opt
      );

      return { ...og, options: updatedOptions };
    });

    update(itemId, { option_groups: updatedGroups });
  };

  const removeOptionFromGroup = (itemId: string, groupIndex: number, optionIndex: number) => {
    const item = result?.items.find((i) => i.id === itemId);
    if (!item) return;

    const updatedGroups = (item.option_groups || []).map((og, idx) => {
      if (idx !== groupIndex) return og;

      const updatedOptions = og.options.filter((_, oIdx) => oIdx !== optionIndex);
      return {
        ...og,
        maximum_selections: Math.min(og.maximum_selections, Math.max(1, updatedOptions.length)),
        options: updatedOptions,
      };
    });

    update(itemId, { option_groups: updatedGroups });
  };

  const moveGroup = (itemId: string, groupIndex: number, direction: "up" | "down") => {
    const item = result?.items.find((i) => i.id === itemId);
    if (!item || !item.option_groups) return;

    const groups = [...item.option_groups];
    const targetIndex = direction === "up" ? groupIndex - 1 : groupIndex + 1;
    if (targetIndex < 0 || targetIndex >= groups.length) return;

    const temp = groups[groupIndex];
    groups[groupIndex] = groups[targetIndex];
    groups[targetIndex] = temp;

    update(itemId, { option_groups: groups });
  };

  const reviewCount =
    result?.items.filter(
      (item) =>
        (item.price === null && !(item.option_groups || []).some((og) => og.type === "variant")) ||
        !item.category_name ||
        item.item_confidence < confidenceThreshold ||
        item.category_confidence < confidenceThreshold ||
        item.warnings.length > 0 ||
        item.duplicate
    ).length || 0;

  const categoryCount = new Set(
    result?.items.map((item) => item.category_name).filter(Boolean)
  ).size;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-4 backdrop-blur-xs">
      <div className="mx-auto my-4 w-full max-w-6xl rounded-3xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-black text-[var(--omlu-text-primary)]">
              {result ? "Menu Scan Review" : "Upload menu photos"}
            </h3>
            {!result && (
              <p className="mt-1 text-xs font-semibold text-[var(--omlu-text-secondary)]">
                Maximum 5 images · JPG, PNG or WebP · 10 MB each
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-lg bg-[var(--omlu-muted-surface)] px-3 py-2 text-xs font-bold text-[var(--omlu-text-secondary)] hover:text-[var(--omlu-text-primary)] transition"
          >
            Close
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-900 bg-red-950/40 p-3 text-xs font-semibold text-red-300">
            ⚠️ {error}
          </div>
        )}

        {!result ? (
          <div className="mt-6 flex flex-col items-center rounded-2xl border border-dashed border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-10">
            <input
              ref={inputRef}
              hidden
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => {
                const selected = Array.from(event.target.files || []).slice(0, 5);
                setFiles(selected);
                setError(
                  event.target.files && event.target.files.length > 5
                    ? "Only the first 5 photos were selected."
                    : null
                );
              }}
            />
            <button
              onClick={() => inputRef.current?.click()}
              className="rounded-xl bg-[var(--omlu-muted-surface)] px-5 py-3 text-sm font-black text-[var(--omlu-text-primary)] hover:bg-[var(--omlu-hover-background)]"
            >
              Select photos
            </button>
            <p className="mt-3 text-xs text-[var(--omlu-text-secondary)]">
              {files.length ? files.map((file) => file.name).join(", ") : "No photos selected"}
            </p>
            <button
              onClick={scan}
              disabled={busy || !files.length}
              className="mt-6 rounded-xl bg-orange-600 px-6 py-3 text-sm font-black text-white hover:bg-orange-700 disabled:opacity-40"
            >
              {busy ? "Scanning menu…" : "Scan Menu"}
            </button>
          </div>
        ) : (
          <>
            {/* Summary Statistics */}
            <div className="mt-5 grid grid-cols-3 gap-3">
              {[
                [result.items.length, "items"],
                [categoryCount, "categories"],
                [reviewCount, "need review"],
              ].map(([value, label]) => (
                <div
                  key={String(label)}
                  className="rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-4"
                >
                  <strong className="block text-2xl text-[var(--omlu-text-primary)]">
                    {value}
                  </strong>
                  <span className="text-xs font-bold text-[var(--omlu-text-secondary)]">
                    {label}
                  </span>
                </div>
              ))}
            </div>

            {result.general_warnings.length > 0 && (
              <div className="mt-4 rounded-xl border border-amber-800/60 bg-amber-950/30 p-3 text-xs text-amber-300">
                {result.general_warnings.join(" · ")}
              </div>
            )}

            {/* Bulk Category Assignment */}
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <select
                value={bulkCategory}
                onChange={(e) => setBulkCategory(e.target.value)}
                className="rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] px-3 py-2 text-xs text-[var(--omlu-text-primary)] outline-none"
              >
                <option value="">Bulk category…</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.name_en}>
                    {category.name_en}
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  if (!bulkCategory) return;
                  setResult({
                    ...result,
                    items: result.items.map((item) =>
                      item.selected
                        ? { ...item, category_name: bulkCategory, category_confidence: 1 }
                        : item
                    ),
                  });
                }}
                className="rounded-xl bg-[var(--omlu-muted-surface)] px-3 py-2 text-xs font-bold text-[var(--omlu-text-primary)] hover:bg-[var(--omlu-hover-background)]"
              >
                Assign to selected
              </button>
            </div>

            {/* Review Items Table */}
            <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--omlu-border)]">
              <table className="w-full min-w-[1000px] text-left text-xs">
                <thead className="bg-[var(--omlu-primary-surface)] text-[var(--omlu-text-secondary)]">
                  <tr>
                    {[
                      "Import",
                      "Category",
                      "Item & Description",
                      "Base Price",
                      "Food Type",
                      "Option Groups",
                      "Warning",
                      "",
                    ].map((h) => (
                      <th key={h} className="p-3 font-black uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((item) => {
                    const low =
                      item.item_confidence < confidenceThreshold ||
                      item.category_confidence < confidenceThreshold;
                    const hasVariantGroup = (item.option_groups || []).some(
                      (og) => og.type === "variant"
                    );
                    const missingPrice = item.price === null && !hasVariantGroup;
                    const warning = missingPrice
                      ? "Missing price"
                      : item.duplicate
                      ? "Duplicate item"
                      : !item.category_name
                      ? "Category unclear"
                      : item.warnings.join("; ");

                    const isExpanded = expandedItemId === item.id;

                    return (
                      <React.Fragment key={item.id}>
                        <tr
                          className={`border-t border-[var(--omlu-border)] ${
                            missingPrice
                              ? "bg-red-950/20"
                              : low
                              ? "bg-amber-950/20"
                              : ""
                          }`}
                        >
                          <td className="p-3">
                            <input
                              type="checkbox"
                              checked={item.selected}
                              onChange={(e) => update(item.id, { selected: e.target.checked })}
                              className="w-4 h-4 rounded cursor-pointer"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              list="menu-import-categories"
                              value={item.category_name || ""}
                              onChange={(e) => update(item.id, { category_name: e.target.value })}
                              placeholder="Select category"
                              className="w-36 rounded-lg border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-2 text-[var(--omlu-text-primary)] outline-none"
                            />
                          </td>
                          <td className="p-2">
                            <div className="flex flex-col gap-1.5 min-w-[200px]">
                              <input
                                value={item.item_name}
                                onChange={(e) => update(item.id, { item_name: e.target.value })}
                                placeholder="Item name"
                                className="w-full font-bold rounded-lg border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-2 text-[var(--omlu-text-primary)] outline-none"
                              />
                              <textarea
                                value={item.description || ""}
                                onChange={(e) => update(item.id, { description: e.target.value })}
                                placeholder="Optional description…"
                                rows={1}
                                className="w-full text-[11px] rounded-lg border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-1.5 text-[var(--omlu-text-secondary)] outline-none"
                              />
                            </div>
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.price ?? ""}
                              onChange={(e) =>
                                update(item.id, {
                                  price: e.target.value === "" ? null : Number(e.target.value),
                                })
                              }
                              placeholder={hasVariantGroup ? "N/A (Variant)" : "₹0.00"}
                              className="w-24 rounded-lg border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-2 text-[var(--omlu-text-primary)] outline-none"
                            />
                          </td>
                          <td className="p-2">
                            <select
                              value={item.food_type}
                              onChange={(e) =>
                                update(item.id, {
                                  food_type: e.target.value as MenuImportDraftItem["food_type"],
                                })
                              }
                              className="rounded-lg border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-2 text-[var(--omlu-text-primary)] outline-none"
                            >
                              <option value="veg">Veg</option>
                              <option value="non_veg">Non-veg</option>
                              <option value="egg">Egg</option>
                              <option value="unknown">Unknown</option>
                            </select>
                          </td>
                          <td className="p-2">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setExpandedItemId(isExpanded ? null : item.id)}
                                className="px-3 py-1.5 rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-muted-surface)] text-[11px] font-bold text-[var(--omlu-text-primary)] hover:bg-[var(--omlu-hover-background)] transition flex items-center gap-1"
                              >
                                <span>{(item.option_groups || []).length} choice group(s)</span>
                                <span>{isExpanded ? "▲" : "▼"}</span>
                              </button>
                            </div>
                          </td>
                          <td
                            className={`p-3 font-semibold ${
                              missingPrice
                                ? "text-red-400"
                                : warning
                                ? "text-amber-300"
                                : "text-[var(--omlu-text-secondary)]"
                            }`}
                          >
                            {warning || "—"}
                            {item.duplicate && (
                              <select
                                value={item.duplicate_action || "skip"}
                                onChange={(e) =>
                                  update(item.id, {
                                    duplicate_action: e.target.value as MenuImportDraftItem["duplicate_action"],
                                  })
                                }
                                className="mt-2 block rounded border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-1 text-[var(--omlu-text-primary)] text-[10px]"
                              >
                                <option value="skip">Skip imported item</option>
                                <option value="replace">Replace existing item</option>
                                <option value="keep_both">Keep both</option>
                              </select>
                            )}
                          </td>
                          <td className="p-2">
                            <button
                              onClick={() =>
                                setResult({
                                  ...result,
                                  items: result.items.filter((row) => row.id !== item.id),
                                })
                              }
                              className="text-red-400 hover:text-red-300 font-bold"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>

                        {/* Expanded Option Group Editor Panel */}
                        {isExpanded && (
                          <tr className="bg-[var(--omlu-elevated-surface)] border-b border-[var(--omlu-border)]">
                            <td colSpan={8} className="p-4 md:p-6">
                              <div className="flex flex-col gap-4">
                                <div className="flex items-center justify-between border-b border-[var(--omlu-border)] pb-3">
                                  <h4 className="text-sm font-black text-[var(--omlu-text-primary)]">
                                    Option Groups for “{item.item_name}”
                                  </h4>
                                  <button
                                    type="button"
                                    onClick={() => addOptionGroup(item.id)}
                                    className="px-3.5 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs transition"
                                  >
                                    + Add choice group
                                  </button>
                                </div>

                                {(item.option_groups || []).length === 0 ? (
                                  <p className="text-xs font-medium text-[var(--omlu-text-secondary)] italic py-2">
                                    No option groups defined. Click “+ Add choice group” to add customization choices (e.g., Size, Sugar Preference, Crust, Extras).
                                  </p>
                                ) : (
                                  <div className="flex flex-col gap-5">
                                    {(item.option_groups || []).map((group, groupIdx) => (
                                      <div
                                        key={groupIdx}
                                        className="rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-4 flex flex-col gap-4 shadow-xs"
                                      >
                                        {/* Group Header Controls */}
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center border-b border-[var(--omlu-border)] pb-3">
                                          <div>
                                            <label className="text-[10px] font-black uppercase text-[var(--omlu-text-secondary)] block mb-1">
                                              Group Name
                                            </label>
                                            <input
                                              value={group.name}
                                              onChange={(e) =>
                                                updateOptionGroup(item.id, groupIdx, { name: e.target.value })
                                              }
                                              placeholder="e.g. Sugar Preference or Size"
                                              className="w-full font-bold rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] px-3 py-2 text-xs text-[var(--omlu-text-primary)] outline-none"
                                            />
                                          </div>

                                          <div>
                                            <label className="text-[10px] font-black uppercase text-[var(--omlu-text-secondary)] block mb-1">
                                              Pricing method
                                            </label>
                                            <select
                                              value={group.type}
                                              onChange={(e) =>
                                                updateOptionGroup(item.id, groupIdx, {
                                                  type: e.target.value as "variant" | "addon",
                                                })
                                              }
                                              className="w-full rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] px-3 py-2 text-xs text-[var(--omlu-text-primary)] outline-none"
                                            >
                                              <option value="addon">Added to base price (+₹)</option>
                                              <option value="variant">Final customer price (Replaces base price)</option>
                                            </select>
                                          </div>

                                          <div className="flex items-center justify-between md:justify-end gap-2">
                                            <div className="flex items-center gap-1">
                                              <button
                                                type="button"
                                                disabled={groupIdx === 0}
                                                onClick={() => moveGroup(item.id, groupIdx, "up")}
                                                className="px-2 py-1 rounded bg-[var(--omlu-muted-surface)] text-[10px] font-bold disabled:opacity-30"
                                              >
                                                ▲
                                              </button>
                                              <button
                                                type="button"
                                                disabled={groupIdx === (item.option_groups || []).length - 1}
                                                onClick={() => moveGroup(item.id, groupIdx, "down")}
                                                className="px-2 py-1 rounded bg-[var(--omlu-muted-surface)] text-[10px] font-bold disabled:opacity-30"
                                              >
                                                ▼
                                              </button>
                                            </div>
                                            <button
                                              type="button"
                                              onClick={() => removeOptionGroup(item.id, groupIdx)}
                                              className="px-3 py-1.5 rounded-xl bg-red-950/40 border border-red-900/40 text-red-400 hover:bg-red-900/50 font-bold text-xs transition"
                                            >
                                              Delete group
                                            </button>
                                          </div>
                                        </div>

                                        {/* Selection Rules */}
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-[var(--omlu-muted-surface)] p-3 rounded-xl">
                                          <div>
                                            <label className="text-[10px] font-black uppercase text-[var(--omlu-text-secondary)] block mb-1">
                                              Requirement
                                            </label>
                                            <select
                                              disabled={group.type === "variant"}
                                              value={group.required ? "true" : "false"}
                                              onChange={(e) => {
                                                const req = e.target.value === "true";
                                                updateOptionGroup(item.id, groupIdx, {
                                                  required: req,
                                                  minimum_selections: req ? 1 : 0,
                                                });
                                              }}
                                              className="w-full rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] px-3 py-1.5 text-xs text-[var(--omlu-text-primary)] outline-none disabled:opacity-60"
                                            >
                                              <option value="true">Customer must choose (Required)</option>
                                              <option value="false">Optional selection</option>
                                            </select>
                                          </div>

                                          <div>
                                            <label className="text-[10px] font-black uppercase text-[var(--omlu-text-secondary)] block mb-1">
                                              Minimum choices
                                            </label>
                                            <input
                                              type="number"
                                              min="0"
                                              disabled={group.type === "variant"}
                                              value={group.minimum_selections}
                                              onChange={(e) =>
                                                updateOptionGroup(item.id, groupIdx, {
                                                  minimum_selections: Math.max(0, Number(e.target.value)),
                                                  required: Number(e.target.value) > 0,
                                                })
                                              }
                                              className="w-full rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] px-3 py-1.5 text-xs text-[var(--omlu-text-primary)] outline-none disabled:opacity-60"
                                            />
                                          </div>

                                          <div>
                                            <label className="text-[10px] font-black uppercase text-[var(--omlu-text-secondary)] block mb-1">
                                              Maximum choices
                                            </label>
                                            <input
                                              type="number"
                                              min="1"
                                              disabled={group.type === "variant"}
                                              value={group.maximum_selections}
                                              onChange={(e) =>
                                                updateOptionGroup(item.id, groupIdx, {
                                                  maximum_selections: Math.max(1, Number(e.target.value)),
                                                })
                                              }
                                              className="w-full rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] px-3 py-1.5 text-xs text-[var(--omlu-text-primary)] outline-none disabled:opacity-60"
                                            />
                                          </div>
                                        </div>

                                        {/* Group Options List */}
                                        <div className="flex flex-col gap-2.5">
                                          <div className="flex items-center justify-between text-[11px] font-bold text-[var(--omlu-text-secondary)]">
                                            <span>Choices in group ({group.options.length})</span>
                                            <button
                                              type="button"
                                              onClick={() => addOptionToGroup(item.id, groupIdx)}
                                              className="text-orange-400 hover:text-orange-300 font-black text-xs"
                                            >
                                              + Add choice
                                            </button>
                                          </div>

                                          {group.options.map((opt, optIdx) => (
                                            <div
                                              key={optIdx}
                                              className="flex flex-wrap items-center gap-2 bg-[var(--omlu-primary-surface)] p-2.5 rounded-xl border border-[var(--omlu-border)]"
                                            >
                                              <input
                                                value={opt.name}
                                                onChange={(e) =>
                                                  updateOptionInGroup(item.id, groupIdx, optIdx, {
                                                    name: e.target.value,
                                                  })
                                                }
                                                placeholder="Choice label (e.g. Regular)"
                                                className="flex-1 min-w-[140px] font-bold rounded-lg border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] px-3 py-1.5 text-xs text-[var(--omlu-text-primary)] outline-none"
                                              />

                                              <input
                                                value={opt.kitchen_display_name || ""}
                                                onChange={(e) =>
                                                  updateOptionInGroup(item.id, groupIdx, optIdx, {
                                                    kitchen_display_name: e.target.value || null,
                                                  })
                                                }
                                                placeholder="Kitchen label (optional)"
                                                className="w-36 rounded-lg border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] px-3 py-1.5 text-xs text-[var(--omlu-text-secondary)] outline-none"
                                              />

                                              {group.type === "variant" ? (
                                                <label className="flex items-center gap-1 text-xs font-bold text-[var(--omlu-text-secondary)]">
                                                  Final ₹
                                                  <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={opt.final_price ?? ""}
                                                    onChange={(e) =>
                                                      updateOptionInGroup(item.id, groupIdx, optIdx, {
                                                        final_price:
                                                          e.target.value === "" ? 0 : Number(e.target.value),
                                                        price_delta: null,
                                                      })
                                                    }
                                                    className="w-24 rounded-lg border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] px-3 py-1.5 text-xs text-[var(--omlu-text-primary)] outline-none"
                                                  />
                                                </label>
                                              ) : (
                                                <label className="flex items-center gap-1 text-xs font-bold text-[var(--omlu-text-secondary)]">
                                                  Added +₹
                                                  <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={opt.price_delta ?? 0}
                                                    onChange={(e) =>
                                                      updateOptionInGroup(item.id, groupIdx, optIdx, {
                                                        price_delta:
                                                          e.target.value === "" ? 0 : Number(e.target.value),
                                                        final_price: null,
                                                      })
                                                    }
                                                    className="w-24 rounded-lg border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] px-3 py-1.5 text-xs text-[var(--omlu-text-primary)] outline-none"
                                                  />
                                                </label>
                                              )}

                                              <button
                                                type="button"
                                                onClick={() => removeOptionFromGroup(item.id, groupIdx, optIdx)}
                                                className="text-red-400 hover:text-red-300 font-bold px-2 py-1"
                                              >
                                                ✕
                                              </button>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* Customer Facing Preview */}
                                <div className="mt-2 rounded-2xl border border-dashed border-[var(--omlu-border)] bg-[var(--omlu-muted-surface)] p-4">
                                  <span className="text-[10px] font-black uppercase text-[var(--omlu-text-secondary)] tracking-wider block mb-2">
                                    Customer Preview
                                  </span>
                                  <div className="flex flex-col gap-2">
                                    <div className="flex items-center justify-between">
                                      <span className="text-sm font-black text-[var(--omlu-text-primary)]">
                                        {item.item_name || "Dish Name"}
                                      </span>
                                      <span className="text-sm font-black text-[var(--omlu-text-primary)]">
                                        {item.price !== null ? `₹${item.price.toFixed(2)}` : "Price by size"}
                                      </span>
                                    </div>
                                    {item.description && (
                                      <p className="text-xs text-[var(--omlu-text-secondary)]">{item.description}</p>
                                    )}

                                    {(item.option_groups || []).map((g, gIdx) => (
                                      <div key={gIdx} className="mt-2 text-xs border-t border-[var(--omlu-border)] pt-2">
                                        <div className="flex items-center justify-between font-bold text-[var(--omlu-text-primary)] mb-1">
                                          <span>{g.name}</span>
                                          <span className="text-[10px] font-semibold text-orange-400">
                                            {g.required ? "Required" : "Optional"}
                                          </span>
                                        </div>
                                        <div className="flex flex-col gap-1 pl-2">
                                          {g.options.map((o, oIdx) => (
                                            <div key={oIdx} className="flex justify-between text-[11px] text-[var(--omlu-text-secondary)]">
                                              <span>
                                                {g.maximum_selections === 1 ? "○ " : "□ "}
                                                {o.name}
                                              </span>
                                              <span>
                                                {g.type === "variant"
                                                  ? `₹${(o.final_price || 0).toFixed(2)}`
                                                  : (o.price_delta || 0) > 0
                                                  ? `+₹${(o.price_delta || 0).toFixed(2)}`
                                                  : "Included"}
                                              </span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
              <datalist id="menu-import-categories">
                {categories.map((category) => (
                  <option key={category.id} value={category.name_en} />
                ))}
              </datalist>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                onClick={confirm}
                disabled={busy}
                className="rounded-xl bg-orange-600 px-6 py-3 text-sm font-black text-white hover:bg-orange-700 disabled:opacity-50"
              >
                {busy ? "Importing…" : "Confirm Import"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
