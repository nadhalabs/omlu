"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

type ScanStatus = "idle" | "scanning" | "success" | "error";

const confidenceThreshold = 0.75;
const MAX_FILES = 5;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const normalizeCategoryName = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase();

const SCAN_MESSAGES = [
  "Preparing your photos…",
  "Reading visible menu text…",
  "Looking for categories and item rows…",
  "Checking prices and configurable choices…",
  "Structuring the menu draft…",
  "Finalising the review-ready draft…",
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function MenuImportFlow({ categories, onClose, onImported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);

  const [result, setResult] = useState<MenuImportResponse | null>(null);
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const [bulkCategory, setBulkCategory] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  // Derive object URLs synchronously using useMemo
  const objectUrls = useMemo(() => {
    return files.map((file) => {
      try {
        return URL.createObjectURL(file);
      } catch {
        return "";
      }
    });
  }, [files]);

  // Clean up object URLs when files change or component unmounts
  useEffect(() => {
    return () => {
      objectUrls.forEach((url) => {
        if (url) {
          try {
            URL.revokeObjectURL(url);
          } catch {
            // Ignore revoke errors in unit tests / environments without full URL.revokeObjectURL
          }
        }
      });
    };
  }, [objectUrls]);

  // Handle scanning status timers
  useEffect(() => {
    if (status !== "scanning") return;

    const messageTimers = [
      setTimeout(() => setCurrentMessageIndex(1), 2000),
      setTimeout(() => setCurrentMessageIndex(2), 8000),
      setTimeout(() => setCurrentMessageIndex(3), 15000),
      setTimeout(() => setCurrentMessageIndex(4), 25000),
      setTimeout(() => setCurrentMessageIndex(5), 40000),
    ];

    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => {
      messageTimers.forEach(clearTimeout);
      clearInterval(interval);
    };
  }, [status]);

  // Rotate preview photos during scanning if multiple photos selected
  useEffect(() => {
    if (status !== "scanning" || files.length <= 1) return;
    const interval = setInterval(() => {
      setActivePhotoIndex((prev) => (prev + 1) % files.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [status, files.length]);

  const validateAndAddFiles = useCallback((newFiles: File[]) => {
    setFileError(null);
    setError(null);

    const combined = [...files, ...newFiles];
    if (combined.length > MAX_FILES) {
      setFileError(`Maximum ${MAX_FILES} menu photos allowed.`);
      setFiles(combined.slice(0, MAX_FILES));
      return;
    }

    const invalidType = newFiles.find(
      (f) => !["image/jpeg", "image/png", "image/webp"].includes(f.type)
    );
    if (invalidType) {
      setFileError(`"${invalidType.name}" is not a supported format. Use JPG, PNG or WebP.`);
      return;
    }

    const oversize = newFiles.find((f) => f.size > MAX_FILE_SIZE_BYTES);
    if (oversize) {
      setFileError(`"${oversize.name}" exceeds the 10 MB limit (${formatFileSize(oversize.size)}).`);
      return;
    }

    setFiles(combined);
  }, [files]);

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, idx) => idx !== index));
    setFileError(null);
    if (activePhotoIndex >= files.length - 1) {
      setActivePhotoIndex(Math.max(0, files.length - 2));
    }
  };

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

  const categoryPatch = (value: string): Partial<MenuImportDraftItem> => {
    if (!value) {
      return { category_name: null, category_id: null, category_source: "unresolved", category_confidence: 0 };
    }
    if (value.startsWith("existing:")) {
      const category = categories.find((candidate) => candidate.id === Number(value.slice(9)));
      return category
        ? { category_name: category.name_en, category_id: category.id, category_source: "existing", category_confidence: 1 }
        : { category_name: null, category_id: null, category_source: "unresolved", category_confidence: 0 };
    }
    const name = value.slice(4).trim().replace(/\s+/g, " ");
    const existing = categories.find(
      (category) => normalizeCategoryName(category.name_en) === normalizeCategoryName(name)
    );
    return existing
      ? { category_name: existing.name_en, category_id: existing.id, category_source: "existing", category_confidence: 1 }
      : { category_name: name, category_id: null, category_source: "new", category_confidence: 1 };
  };

  const scan = async () => {
    if (!files.length) {
      setError("Select at least one menu photo.");
      return;
    }

    setCurrentMessageIndex(0);
    setElapsedSeconds(0);
    setActivePhotoIndex(0);
    setStatus("scanning");
    setBusy(true);
    setError(null);

    try {
      const res = await scanAdminMenu(files);
      setResult(res);
      setStatus("success");
    } catch (err) {
      setStatus("error");
      const msg = err instanceof Error ? err.message : "Menu scan failed.";
      if (msg.toLowerCase().includes("timeout") || msg.toLowerCase().includes("network")) {
        setError("We couldn’t reach the server. Please check your connection and try again.");
      } else if (msg.toLowerCase().includes("invalid") || msg.toLowerCase().includes("format")) {
        setError("We couldn’t read this menu. Try a clearer photo with good lighting and full menu visible.");
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const resetSelection = () => {
    setFiles([]);
    setResult(null);
    setStatus("idle");
    setError(null);
    setFileError(null);
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

  const newCategoryDrafts = Array.from(
    new Map(
      (result?.items || [])
        .filter((item) => item.category_source === "new" && item.category_name?.trim())
        .map((item) => [normalizeCategoryName(item.category_name!), item.category_name!.trim()])
    ).values()
  );

  const addNewCategoryDraft = () => {
    const name = newCategoryName.trim().replace(/\s+/g, " ");
    if (!name) return;
    setBulkCategory(`new:${name}`);
    setNewCategoryName("");
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-3 sm:p-4 backdrop-blur-xs flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Menu photo import"
    >
      <div className="mx-auto my-auto w-full max-w-5xl rounded-3xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-4 sm:p-6 shadow-2xl transition-all">
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg sm:text-xl font-black text-[var(--omlu-text-primary)]">
              {status === "scanning"
                ? "Reading your menu"
                : status === "error"
                ? "We couldn’t read this menu"
                : result
                ? "Menu Scan Review"
                : "Upload menu photos"}
            </h3>
            <p className="mt-1 text-xs font-medium text-[var(--omlu-text-secondary)]">
              {status === "scanning"
                ? "OMLU is turning your photos into a review-ready menu draft."
                : status === "error"
                ? "Try a clearer photo with the full menu visible, good lighting and minimal glare."
                : result
                ? "Review names, categories, base prices and option choices before publishing."
                : "Up to 5 photos · JPG, PNG or WebP · Maximum 10 MB each"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={status === "scanning" || busy}
            className="rounded-xl bg-[var(--omlu-muted-surface)] px-3 py-2 text-xs font-bold text-[var(--omlu-text-secondary)] hover:text-[var(--omlu-text-primary)] transition disabled:opacity-40"
          >
            Close
          </button>
        </div>

        {/* Global Error Banner */}
        {error && status !== "error" && (
          <div className="mt-4 rounded-xl border border-red-900 bg-red-950/40 p-3 text-xs font-semibold text-red-300 flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* File Selection Error Banner */}
        {fileError && (
          <div className="mt-4 rounded-xl border border-amber-900 bg-amber-950/40 p-3 text-xs font-semibold text-amber-300 flex items-center gap-2">
            <span>⚠️</span>
            <span>{fileError}</span>
          </div>
        )}

        {/* ---------------------------------------------------- */}
        {/* DEDICATED SCANNING VIEW                              */}
        {/* ---------------------------------------------------- */}
        {status === "scanning" ? (
          <div className="mt-6 flex flex-col gap-6">
            {/* Image Preview Container with Scanning Line */}
            <div className="relative h-64 sm:h-80 w-full overflow-hidden rounded-2xl border border-[var(--omlu-border)] bg-black/80 flex items-center justify-center">
              {objectUrls[activePhotoIndex] ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={objectUrls[activePhotoIndex]}
                  alt={files[activePhotoIndex]?.name || "Selected menu preview"}
                  className="h-full w-full object-contain p-2"
                />
              ) : (
                <div className="flex flex-col items-center justify-center p-6 text-center text-white/70">
                  <span className="text-3xl">📄</span>
                  <span className="mt-2 text-xs font-bold">{files[activePhotoIndex]?.name}</span>
                </div>
              )}

              {/* Animated Scan Line & Glow */}
              <div className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-orange-500 to-transparent shadow-[0_0_20px_#f97316] omlu-scan-line pointer-events-none" />
              <div className="absolute inset-0 bg-gradient-to-b from-orange-500/10 via-transparent to-transparent pointer-events-none" />

              {/* Photo Indicator Badge */}
              {files.length > 1 && (
                <div className="absolute top-3 right-3 flex items-center gap-2 rounded-full bg-black/70 backdrop-blur-md px-3 py-1 text-xs font-bold text-white border border-white/20">
                  <span>Photo {activePhotoIndex + 1} of {files.length}</span>
                </div>
              )}

              {/* Filename Pill */}
              <div className="absolute bottom-3 left-3 max-w-[75%] truncate rounded-xl bg-black/75 backdrop-blur-md px-3 py-1.5 text-xs font-semibold text-white/90 border border-white/10">
                {files[activePhotoIndex]?.name}
              </div>
            </div>

            {/* Honest Presentational Progress Section */}
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-muted-surface)] p-6 text-center shadow-xs">
              <div className="flex items-center gap-3">
                <svg
                  className="h-5 w-5 animate-spin text-orange-500"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <p className="text-sm font-black text-[var(--omlu-text-primary)]" aria-live="polite">
                  {SCAN_MESSAGES[currentMessageIndex]}
                </p>
              </div>

              {elapsedSeconds > 50 && (
                <p className="text-xs font-medium text-amber-400">
                  Detailed menus can take a little longer. OMLU is still working… ({elapsedSeconds}s elapsed)
                </p>
              )}

              <p className="text-xs font-semibold text-[var(--omlu-text-secondary)] border-t border-[var(--omlu-border)] pt-3 mt-1 max-w-lg">
                🔒 Nothing will be published automatically. You’ll review the extracted menu before publishing.
              </p>
            </div>
          </div>
        ) : status === "error" ? (
          /* ---------------------------------------------------- */
          /* RECOVERABLE ERROR STATE                              */
          /* ---------------------------------------------------- */
          <div className="mt-6 flex flex-col gap-6">
            <div className="rounded-2xl border border-red-900/50 bg-red-950/20 p-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-900/30 text-2xl text-red-400 mb-3">
                ⚠️
              </div>
              <h4 className="text-base font-black text-[var(--omlu-text-primary)]">
                We couldn’t read this menu
              </h4>
              <p className="mt-1 text-xs text-[var(--omlu-text-secondary)] max-w-md mx-auto">
                {error || "Try a clearer photo with the full menu visible, good lighting and minimal glare."}
              </p>

              {/* Retained Files Preview List */}
              {files.length > 0 && (
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {files.map((file, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] px-3 py-1.5 text-xs text-[var(--omlu-text-primary)]"
                    >
                      <span className="font-bold truncate max-w-[120px]">{file.name}</span>
                      <span className="text-[10px] text-[var(--omlu-text-secondary)]">({formatFileSize(file.size)})</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={scan}
                  className="rounded-xl bg-orange-600 px-5 py-2.5 text-xs font-black text-white hover:bg-orange-700 transition"
                >
                  Try again
                </button>
                <button
                  type="button"
                  onClick={resetSelection}
                  className="rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-muted-surface)] px-5 py-2.5 text-xs font-bold text-[var(--omlu-text-primary)] hover:bg-[var(--omlu-hover-background)] transition"
                >
                  Choose different photos
                </button>
              </div>
            </div>
          </div>
        ) : !result ? (
          /* ---------------------------------------------------- */
          /* UPLOAD & SELECTION STATE                             */
          /* ---------------------------------------------------- */
          <div className="mt-6 flex flex-col gap-6">
            <input
              ref={inputRef}
              hidden
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => {
                const selected = Array.from(event.target.files || []);
                validateAndAddFiles(selected);
              }}
            />

            {files.length === 0 ? (
              /* Empty Dropzone */
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-10 sm:p-14 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--omlu-muted-surface)] text-2xl mb-3">
                  📸
                </div>
                <h4 className="text-sm font-black text-[var(--omlu-text-primary)]">
                  Select menu photos to scan
                </h4>
                <p className="mt-1 text-xs text-[var(--omlu-text-secondary)] max-w-sm">
                  Upload clear, well-lit photos of your food & beverage menu. You will review and edit everything before publishing.
                </p>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="mt-5 rounded-xl bg-[var(--omlu-muted-surface)] px-6 py-3 text-xs font-black text-[var(--omlu-text-primary)] border border-[var(--omlu-border)] hover:bg-[var(--omlu-hover-background)] transition"
                >
                  Select photos
                </button>
              </div>
            ) : (
              /* Selected Files Grid */
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                  {files.map((file, idx) => (
                    <div
                      key={idx}
                      className="group relative flex flex-col rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-2 shadow-xs transition hover:border-[var(--omlu-focus-ring)]"
                    >
                      <div className="relative h-32 w-full overflow-hidden rounded-xl bg-black/60 flex items-center justify-center">
                        {objectUrls[idx] ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={objectUrls[idx]}
                            alt={file.name}
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <span className="text-2xl">📄</span>
                        )}
                        <button
                          type="button"
                          onClick={() => removeFile(idx)}
                          className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-xs font-bold text-white hover:bg-red-600 transition"
                          title="Remove photo"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="mt-2 flex flex-col px-1">
                        <span className="text-xs font-bold text-[var(--omlu-text-primary)] truncate" title={file.name}>
                          {file.name}
                        </span>
                        <span className="text-[10px] text-[var(--omlu-text-secondary)] font-medium">
                          {formatFileSize(file.size)}
                        </span>
                      </div>
                    </div>
                  ))}

                  {files.length < MAX_FILES && (
                    <button
                      type="button"
                      onClick={() => inputRef.current?.click()}
                      className="flex h-full min-h-[140px] flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--omlu-border)] bg-[var(--omlu-muted-surface)] p-4 text-center hover:bg-[var(--omlu-hover-background)] transition"
                    >
                      <span className="text-xl font-bold text-[var(--omlu-text-secondary)]">+</span>
                      <span className="mt-1 text-xs font-bold text-[var(--omlu-text-primary)]">Add photo</span>
                      <span className="text-[10px] text-[var(--omlu-text-secondary)]">({MAX_FILES - files.length} remaining)</span>
                    </button>
                  )}
                </div>

                <div className="flex flex-col items-center gap-3 border-t border-[var(--omlu-border)] pt-4 mt-2">
                  <button
                    type="button"
                    onClick={scan}
                    disabled={busy || !files.length || Boolean(fileError)}
                    className="w-full sm:w-auto rounded-xl bg-orange-600 px-8 py-3.5 text-sm font-black text-white hover:bg-orange-700 transition disabled:opacity-40 shadow-md"
                  >
                    Scan {files.length} {files.length === 1 ? "photo" : "photos"}
                  </button>
                  <p className="text-xs font-medium text-[var(--omlu-text-secondary)] text-center">
                    🔒 You’ll review the extracted menu before publishing.
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ---------------------------------------------------- */
          /* REVIEW & EDIT DRAFT STATE                            */
          /* ---------------------------------------------------- */
          <>
            {/* Success Banner */}
            <div className="mt-4 rounded-2xl border border-emerald-800/60 bg-emerald-950/30 p-3.5 text-xs font-semibold text-emerald-300 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-base">✨</span>
                <div>
                  <strong className="block text-white">Menu draft ready</strong>
                  <span>We found menu content in your photos. Review names, prices and choices before importing.</span>
                </div>
              </div>
              <button
                type="button"
                onClick={resetSelection}
                className="text-[11px] font-bold underline text-emerald-400 hover:text-emerald-200"
              >
                Scan again
              </button>
            </div>

            {/* Summary Statistics */}
            <div className="mt-4 grid grid-cols-3 gap-3">
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
                  <option key={category.id} value={`existing:${category.id}`}>
                    {category.name_en} — Existing
                  </option>
                ))}
                {newCategoryDrafts.map((name) => (
                  <option key={normalizeCategoryName(name)} value={`new:${name}`}>
                    {name} — New
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
                        ? { ...item, ...categoryPatch(bulkCategory) }
                        : item
                    ),
                  });
                }}
                className="rounded-xl bg-[var(--omlu-muted-surface)] px-3 py-2 text-xs font-bold text-[var(--omlu-text-primary)] hover:bg-[var(--omlu-hover-background)]"
              >
                Assign to selected
              </button>
              <input
                value={newCategoryName}
                onChange={(event) => setNewCategoryName(event.target.value)}
                placeholder="New category name"
                className="rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] px-3 py-2 text-xs text-[var(--omlu-text-primary)] outline-none"
              />
              <button
                type="button"
                onClick={addNewCategoryDraft}
                disabled={!newCategoryName.trim()}
                className="rounded-xl bg-[var(--omlu-muted-surface)] px-3 py-2 text-xs font-bold text-[var(--omlu-text-primary)] disabled:opacity-50"
              >
                + Create new category
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
                            <select
                              value={
                                item.category_source === "existing" && item.category_id
                                  ? `existing:${item.category_id}`
                                  : item.category_source === "new" && item.category_name
                                  ? `new:${item.category_name}`
                                  : ""
                              }
                              onChange={(event) => update(item.id, categoryPatch(event.target.value))}
                              className="w-36 rounded-lg border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-2 text-[var(--omlu-text-primary)] outline-none"
                            >
                              <option value="">Choose category</option>
                              {categories.map((category) => (
                                <option key={category.id} value={`existing:${category.id}`}>
                                  {category.name_en}
                                </option>
                              ))}
                              {newCategoryDrafts.map((name) => (
                                <option key={normalizeCategoryName(name)} value={`new:${name}`}>
                                  {name} (New)
                                </option>
                              ))}
                              {item.category_source === "unresolved" && item.extracted_category_name && (
                                <option value={`new:${item.extracted_category_name}`}>
                                  Create “{item.extracted_category_name}”
                                </option>
                              )}
                            </select>
                            <span className={`mt-1 block text-[10px] font-bold ${
                              item.category_source === "unresolved" ? "text-amber-400" : "text-[var(--omlu-text-secondary)]"
                            }`}>
                              {item.category_source === "existing"
                                ? "Existing category"
                                : item.category_source === "new"
                                ? "New category"
                                : "Needs selection"}
                            </span>
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
