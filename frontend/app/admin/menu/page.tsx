"use client";

import React, { useEffect, useState } from "react";
import { useOmluUi } from "@/components/OmluUiProvider";
import Image from "next/image";
import {
  getAdminCategories,
  createAdminCategory,
  updateAdminCategory,
  deleteAdminCategory,
  getAdminMenuItems,
  createAdminMenuItem,
  updateAdminMenuItem,
  deleteAdminMenuItem,
  updateAdminMenuItemAvailability,
} from "@/lib/api";
import { AdminCategoryResponse, AdminMenuItemResponse } from "@/lib/types";
import { invalidateQueries, queryKeys } from "@/lib/queryCache";
import { useModalScrollLock } from "@/components/useModalScrollLock";
import MenuImportFlow from "./MenuImportFlow";
import MenuOptionEditor from "./MenuOptionEditor";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function AdminMenuPage() {
  const { confirm: confirmDialog, toast } = useOmluUi();
  // Categories States
  const [categories, setCategories] = useState<AdminCategoryResponse[]>([]);
  const [catLoading, setCatLoading] = useState<boolean>(true);
  const [catError, setCatError] = useState<string | null>(null);

  // Menu Items States
  const [items, setItems] = useState<AdminMenuItemResponse[]>([]);
  const [itemsLoading, setItemsLoading] = useState<boolean>(true);
  const [itemsError, setItemsError] = useState<string | null>(null);

  // Filter & Search States
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Modals & Forms States
  const [categoryModal, setCategoryModal] = useState<{
    open: boolean;
    mode: "create" | "edit";
    category?: AdminCategoryResponse;
  }>({ open: false, mode: "create" });

  const [itemModal, setItemModal] = useState<{
    open: boolean;
    mode: "create" | "edit";
    item?: AdminMenuItemResponse;
  }>({ open: false, mode: "create" });

  // Category Form Inputs
  const [catNameEn, setCatNameEn] = useState("");
  const [catNameMl, setCatNameMl] = useState("");
  const [catDisplayOrder, setCatDisplayOrder] = useState(0);
  const [catIsActive, setCatIsActive] = useState(true);
  const [catFormError, setCatFormError] = useState<string | null>(null);
  const [catSaving, setCatSaving] = useState(false);

  // Item Form Inputs
  const [itemNameEn, setItemNameEn] = useState("");
  const [itemNameMl, setItemNameMl] = useState("");
  const [itemCategoryId, setItemCategoryId] = useState("");
  const [itemDescriptionEn, setItemDescriptionEn] = useState("");
  const [itemDescriptionMl, setItemDescriptionMl] = useState("");
  const [itemPrice, setItemPrice] = useState("");
  const [itemImageUrl, setItemImageUrl] = useState("");
  const [itemIsAvailable, setItemIsAvailable] = useState(true);
  const [itemDisplayOrder, setItemDisplayOrder] = useState(0);
  const [itemFormError, setItemFormError] = useState<string | null>(null);
  const [itemSaving, setItemSaving] = useState(false);

  // Action status loading for simple buttons
  const [updatingAvail, setUpdatingAvail] = useState<Record<number, boolean>>({});
  const [importMenuOpen, setImportMenuOpen] = useState(false);

  useModalScrollLock(categoryModal.open || itemModal.open || importMenuOpen, () => {
    if (catSaving || itemSaving) return;
    setCategoryModal({ open: false, mode: "create" });
    setItemModal({ open: false, mode: "create" });
    setImportMenuOpen(false);
  });

  // Initial load
  const loadData = async () => {
    setCatLoading(true);
    setItemsLoading(true);
    try {
      const catsData = await getAdminCategories();
      setCategories(catsData);
      setCatError(null);

      // Default the form category selector if category exists
      if (catsData.length > 0) {
        setItemCategoryId(String(catsData[0].id));
      }
    } catch (e) {
      setCatError(getErrorMessage(e, "Failed to load categories."));
    } finally {
      setCatLoading(false);
    }

    try {
      const itemsData = await getAdminMenuItems();
      setItems(itemsData);
      setItemsError(null);
    } catch (e) {
      setItemsError(getErrorMessage(e, "Failed to load menu items."));
    } finally {
      setItemsLoading(false);
    }
  };

  useEffect(() => {
    const timeout = window.setTimeout(() => loadData(), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  // Filter items based on Category Selection & Search Query
  const filteredItems = items.filter((item) => {
    const matchesCategory =
      selectedCategoryId === "all" ||
      item.category_id === Number(selectedCategoryId);

    const matchesSearch =
      !searchQuery.trim() ||
      item.name_en.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.name_ml &&
        item.name_ml.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesCategory && matchesSearch;
  });

  // Handle Category Submit
  const handleCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (catSaving) return;

    if (!catNameEn.trim()) {
      setCatFormError("English name is required.");
      return;
    }
    if (catNameEn.length > 120) {
      setCatFormError("English name cannot exceed 120 characters.");
      return;
    }
    if (catNameMl && catNameMl.length > 120) {
      setCatFormError("Malayalam name cannot exceed 120 characters.");
      return;
    }
    if (catDisplayOrder < 0) {
      setCatFormError("Display order must be zero or positive.");
      return;
    }

    setCatSaving(true);
    setCatFormError(null);

    try {
      if (categoryModal.mode === "create") {
        await createAdminCategory({
          name_en: catNameEn.trim(),
          name_ml: catNameMl.trim() || undefined,
          display_order: catDisplayOrder,
          is_active: catIsActive,
        });
      } else {
        const catId = categoryModal.category!.id;
        await updateAdminCategory(catId, {
          name_en: catNameEn.trim(),
          name_ml: catNameMl.trim() || "",
          display_order: catDisplayOrder,
          is_active: catIsActive,
        });
      }

      // Close modal and refresh categories list
      setCategoryModal({ open: false, mode: "create" });
      // Reload from server to ensure accurate counts/ordering
      const catsData = await getAdminCategories();
      setCategories(catsData);
      const itemsData = await getAdminMenuItems();
      setItems(itemsData);
    } catch (err) {
      setCatFormError(getErrorMessage(err, "Failed to save category."));
    } finally {
      setCatSaving(false);
    }
  };

  // Open Category Modal
  const openCategoryModal = (mode: "create" | "edit", category?: AdminCategoryResponse) => {
    setCategoryModal({ open: true, mode, category });
    setCatFormError(null);
    if (mode === "edit" && category) {
      setCatNameEn(category.name_en);
      setCatNameMl(category.name_ml || "");
      setCatDisplayOrder(category.display_order);
      setCatIsActive(category.is_active);
    } else {
      setCatNameEn("");
      setCatNameMl("");
      setCatDisplayOrder(0);
      setCatIsActive(true);
    }
  };

  // Delete Category
  const handleDeleteCategory = async (categoryId: number) => {
    if (!await confirmDialog({ title: "Delete category?", message: "This category will be permanently deleted. This action cannot be undone.", confirmLabel: "Delete category", cancelLabel: "Keep category", tone: "destructive" })) return;

    try {
      await deleteAdminCategory(categoryId);
      // Reload categories list
      const catsData = await getAdminCategories();
      setCategories(catsData);
    } catch (err) {
      toast(`Delete rejected: ${getErrorMessage(err, "Delete failed.")}`, "error");
    }
  };

  // Handle Item Submit
  const handleItemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (itemSaving) return;

    if (!itemNameEn.trim()) {
      setItemFormError("English name is required.");
      return;
    }
    if (itemNameEn.length > 120) {
      setItemFormError("English name cannot exceed 120 characters.");
      return;
    }
    if (itemNameMl && itemNameMl.length > 120) {
      setItemFormError("Malayalam name cannot exceed 120 characters.");
      return;
    }
    if (!itemCategoryId) {
      setItemFormError("Please select a category.");
      return;
    }

    const priceNum = Number(itemPrice);
    if (isNaN(priceNum) || priceNum < 0) {
      setItemFormError("Price must be a valid number greater than or equal to 0.");
      return;
    }

    if (itemImageUrl.trim() !== "") {
      const cleanUrl = itemImageUrl.trim();
      if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
        setItemFormError("Image URL must start with http:// or https://");
        return;
      }
    }

    if (itemDisplayOrder < 0) {
      setItemFormError("Display order must be zero or positive.");
      return;
    }

    setItemSaving(true);
    setItemFormError(null);

    const payload = {
      category_id: Number(itemCategoryId),
      name_en: itemNameEn.trim(),
      name_ml: itemNameMl.trim() || undefined,
      description_en: itemDescriptionEn.trim() || undefined,
      description_ml: itemDescriptionMl.trim() || undefined,
      price: priceNum,
      image_url: itemImageUrl.trim() || undefined,
      is_available: itemIsAvailable,
      display_order: itemDisplayOrder,
    };

    try {
      if (itemModal.mode === "create") {
        await createAdminMenuItem(payload);
      } else {
        const itemId = itemModal.item!.id;
        // If image URL is cleared, send empty string to proxy to remove it in the backend
        const imgUrlPayload = itemImageUrl.trim() === "" ? "" : itemImageUrl.trim();
        await updateAdminMenuItem(itemId, {
          ...payload,
          image_url: imgUrlPayload,
        });
      }

      setItemModal({ open: false, mode: "create" });
      // Reload items & categories list from server to get accurate count/relationships
      const itemsData = await getAdminMenuItems();
      setItems(itemsData);
      const catsData = await getAdminCategories();
      setCategories(catsData);
    } catch (err) {
      setItemFormError(getErrorMessage(err, "Failed to save menu item."));
    } finally {
      setItemSaving(false);
    }
  };

  // Open Item Modal
  const openItemModal = (mode: "create" | "edit", item?: AdminMenuItemResponse) => {
    setItemModal({ open: true, mode, item });
    setItemFormError(null);

    if (mode === "edit" && item) {
      setItemNameEn(item.name_en);
      setItemNameMl(item.name_ml || "");
      setItemCategoryId(String(item.category_id));
      setItemDescriptionEn(item.description_en || "");
      setItemDescriptionMl(item.description_ml || "");
      setItemPrice(item.price);
      setItemImageUrl(item.image_url || "");
      setItemIsAvailable(item.is_available);
      setItemDisplayOrder(item.display_order);
    } else {
      setItemNameEn("");
      setItemNameMl("");
      // Default to first category if present
      if (categories.length > 0) {
        setItemCategoryId(String(categories[0].id));
      } else {
        setItemCategoryId("");
      }
      setItemDescriptionEn("");
      setItemDescriptionMl("");
      setItemPrice("");
      setItemImageUrl("");
      setItemIsAvailable(true);
      setItemDisplayOrder(0);
    }
  };

  // Toggle MenuItem Availability Shortcut
  const handleToggleAvailability = async (item: AdminMenuItemResponse) => {
    if (updatingAvail[item.id]) return;
    setUpdatingAvail((prev) => ({ ...prev, [item.id]: true }));

    const nextAvail = !item.is_available;
    const previousItems = items;
    setItems((current) =>
      current.map((currentItem) =>
        currentItem.id === item.id
          ? { ...currentItem, is_available: nextAvail }
          : currentItem,
      ),
    );

    try {
      await updateAdminMenuItemAvailability(item.id, nextAvail);
      invalidateQueries(queryKeys.menu());
    } catch (err) {
      setItems(previousItems);
      toast(`Availability restored. ${getErrorMessage(err, "Update failed.")} Tap to retry.`, "error");
    } finally {
      setUpdatingAvail((prev) => ({ ...prev, [item.id]: false }));
    }
  };

  // Delete MenuItem
  const handleDeleteItem = async (itemId: number) => {
    if (!await confirmDialog({ title: "Delete menu item?", message: "This menu item will be permanently deleted and cannot be restored.", confirmLabel: "Delete menu item", cancelLabel: "Keep item", tone: "destructive" })) return;

    try {
      await deleteAdminMenuItem(itemId);
      // Reload items and categories from backend
      const itemsData = await getAdminMenuItems();
      setItems(itemsData);
      const catsData = await getAdminCategories();
      setCategories(catsData);
    } catch (err) {
      toast(`Delete rejected: ${getErrorMessage(err, "Delete failed.")}`, "error");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div><h1 className="text-3xl font-black tracking-tight text-zinc-950">Menu Management</h1><p className="mt-1.5 text-sm font-medium text-zinc-600">Organize categories and configure dishes served to customers.</p></div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <button onClick={() => openItemModal("create")} disabled={categories.length === 0} className="min-h-11 rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-black text-white transition hover:bg-orange-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-600">Add item</button>
          <button onClick={() => setImportMenuOpen(true)} className="min-h-11 rounded-xl border border-zinc-300 bg-white px-5 py-2.5 text-sm font-bold text-zinc-800 transition hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500">Import menu</button>
        </div>
      </header>

      {/* Grid Layout for Categories and Menu Items */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* LEFT COLUMN: Categories list */}
        <section className="flex flex-col gap-4 rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm lg:col-span-1">
          <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
            <div><h2 className="text-lg font-black text-zinc-950">Categories</h2><p className="text-xs font-medium text-zinc-600">{categories.length} {categories.length === 1 ? "category" : "categories"}</p></div>
            <button
              onClick={() => openCategoryModal("create")}
              className="min-h-11 rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-bold text-zinc-800 transition hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-orange-500"
            >
              Add category
            </button>
          </div>

          {catLoading ? (
            <div className="flex justify-center py-6">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-orange-500 border-t-transparent"></div>
            </div>
          ) : catError ? (
            <p className="text-xs text-red-400 py-4 font-semibold">{catError}</p>
          ) : categories.length === 0 ? (
            <p className="text-xs text-zinc-600 text-center py-6 font-semibold">
              No categories defined.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4"
                >
                  <div className="truncate">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-extrabold text-zinc-950">
                        {cat.name_en}
                      </span>
                      {!cat.is_active && (
                        <span className="whitespace-nowrap rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase text-amber-900">
                          Inactive
                        </span>
                      )}
                    </div>
                    {cat.name_ml && (
                      <span className="mt-0.5 block text-xs font-medium text-zinc-600">
                        {cat.name_ml}
                      </span>
                    )}
                    <span className="mt-1 block text-xs font-bold text-zinc-600">
                      {cat.item_count} {cat.item_count === 1 ? "menu item" : "menu items"} · Sort order {cat.display_order}
                    </span>
                  </div>

                  <details className="relative shrink-0"><summary aria-label={`More actions for ${cat.name_en}`} className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-xl border border-zinc-300 bg-white text-xl font-black text-zinc-800 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-orange-500">⋮</summary><div className="absolute right-0 z-20 mt-2 w-48 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl"><button onClick={() => openCategoryModal("edit", cat)} className="min-h-10 w-full rounded-lg px-3 text-left text-sm font-bold text-zinc-800 hover:bg-zinc-100">Edit category</button><button onClick={() => handleDeleteCategory(cat.id)} className="min-h-10 w-full rounded-lg px-3 text-left text-sm font-bold text-red-700 hover:bg-red-50">Delete category</button></div></details>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* RIGHT COLUMN: Menu items list with Search/Filters */}
        <section className="flex flex-col gap-4 rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm lg:col-span-2">
          {/* Header */}
          <div className="border-b border-zinc-200 pb-3"><h2 className="text-lg font-black text-zinc-950">Menu items</h2><p className="text-xs font-medium text-zinc-600">Showing {filteredItems.length} of {items.length} items</p></div>

          {/* Filters Panel */}
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Category Filter */}
            <div className="flex-1">
              <select
                value={selectedCategoryId}
                onChange={(e) => setSelectedCategoryId(e.target.value)}
                aria-label="Filter by category" className="min-h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus-visible:outline-2 focus-visible:outline-orange-500"
              >
                <option value="all">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name_en}
                  </option>
                ))}
              </select>
            </div>

            {/* Name Search */}
            <div className="flex-[2]">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search dish by English or Malayalam name..."
                aria-label="Search menu items" className="min-h-11 w-full rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 outline-none focus-visible:outline-2 focus-visible:outline-orange-500"
              />
            </div>
          </div>

          {/* Dishes List */}
          {itemsLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-orange-500 border-t-transparent"></div>
            </div>
          ) : itemsError ? (
            <p className="text-xs text-red-400 py-6 font-semibold">{itemsError}</p>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-12 text-zinc-500">
              <span className="text-3xl block mb-2">🍽️</span>
              <p className="text-xs font-bold">No dishes found matching search parameters.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  className="flex min-h-48 flex-col justify-between gap-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 transition hover:border-zinc-300"
                >
                  <div className="flex gap-3">
                    {/* Item Image Preview or Placeholder */}
                    <div className="w-16 h-16 rounded-xl bg-zinc-955 border border-zinc-800 shrink-0 overflow-hidden flex items-center justify-center text-lg text-zinc-500 font-bold relative">
                      {item.image_url ? (
                        <Image
                          src={item.image_url}
                          alt={item.name_en}
                          fill
                          sizes="64px"
                          unoptimized
                          className="object-cover"
                        />
                      ) : (
                        "🍲"
                      )}
                    </div>

                    <div className="truncate flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="truncate text-sm font-extrabold text-zinc-950">
                          {item.name_en}
                        </span>
                        {!item.is_available && (
                          <span className="text-[8px] border border-red-300 bg-red-100 text-red-700 font-black px-1.5 py-0.5 rounded uppercase">
                            Unavailable
                          </span>
                        )}
                      </div>
                      {item.name_ml && (
                        <span className="mt-0.5 block text-xs font-medium text-zinc-600">
                          {item.name_ml}
                        </span>
                      )}
                      <span className="text-[9px] font-black text-orange-500 uppercase tracking-wider block mt-1.5">
                        {item.category_name}
                      </span>
                    </div>
                  </div>

                  {/* Pricing and Details */}
                  <div className="flex flex-col justify-between gap-3 border-t border-zinc-200 pt-3 sm:flex-row sm:items-center">
                    <div>
                      <span className="text-[10px] text-zinc-500 font-semibold block uppercase">
                        Price
                      </span>
                      <span className="text-sm font-black text-zinc-950">
                        ₹{Number(item.price).toFixed(2)}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {/* Availability Quick Toggle */}
                      <button
                        onClick={() => handleToggleAvailability(item)}
                        disabled={updatingAvail[item.id]}
                        className={`min-h-11 rounded-lg px-3 py-2 text-xs font-bold transition focus-visible:outline-2 focus-visible:outline-orange-500 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-600 ${
                          item.is_available
                            ? "border border-green-300 bg-green-100 text-green-700"
                            : "border border-red-300 bg-red-100 text-red-700"
                        }`}
                      >
                        {item.is_available ? "Available" : "Unavailable"}
                      </button>

                      {/* Edit */}
                      <button
                        onClick={() => openItemModal("edit", item)}
                        className="min-h-11 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-xs font-bold text-zinc-800 transition hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-orange-500"
                      >
                        Edit
                      </button>
                      <details className="relative"><summary aria-label={`More actions for ${item.name_en}`} className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-lg border border-zinc-300 bg-white text-xl font-black text-zinc-800 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-orange-500">⋮</summary><div className="absolute right-0 z-20 mt-2 w-48 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl"><button onClick={() => handleDeleteItem(item.id)} className="min-h-10 w-full rounded-lg px-3 text-left text-sm font-bold text-red-700 hover:bg-red-50">Delete menu item</button></div></details>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {importMenuOpen && (
        <MenuImportFlow
          categories={categories}
          onClose={() => setImportMenuOpen(false)}
          onImported={async (summary) => {
            const [itemsData, catsData] = await Promise.all([
              getAdminMenuItems(),
              getAdminCategories(),
            ]);
            setItems(itemsData);
            setCategories(catsData);
            toast(
              `Imported ${summary.imported} items${summary.skipped ? `; skipped ${summary.skipped}` : ""}.`,
              "success",
            );
          }}
        />
      )}

      {/* CATEGORY FORM MODAL */}
      {categoryModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overscroll-contain bg-black/75 p-4 backdrop-blur-xs">
          <div className="relative flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="category-modal-title">
            <h3 id="category-modal-title" className="text-lg font-black text-white">
              {categoryModal.mode === "create" ? "Add Category" : "Edit Category"}
            </h3>

            {catFormError && (
              <div className="bg-red-950/40 border border-red-900/50 text-red-400 text-xs font-semibold p-3 rounded-xl">
                ⚠️ {catFormError}
              </div>
            )}

            <form onSubmit={handleCategorySubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">
                  English Name *
                </label>
                <input
                  type="text"
                  value={catNameEn}
                  onChange={(e) => setCatNameEn(e.target.value)}
                  placeholder="e.g. Starters"
                  className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 focus:border-orange-600 rounded-xl text-sm outline-none transition text-white placeholder-zinc-700"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">
                  Malayalam Name (Optional)
                </label>
                <input
                  type="text"
                  value={catNameMl}
                  onChange={(e) => setCatNameMl(e.target.value)}
                  placeholder="e.g. സ്റ്റാർട്ടേഴ്സ്"
                  className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 focus:border-orange-600 rounded-xl text-sm outline-none transition text-white placeholder-zinc-700"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">
                  Display Order
                </label>
                <input
                  type="number"
                  value={catDisplayOrder}
                  onChange={(e) => setCatDisplayOrder(Number(e.target.value))}
                  placeholder="0"
                  min="0"
                  className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 focus:border-orange-600 rounded-xl text-sm outline-none transition text-white placeholder-zinc-700"
                />
              </div>

              <div className="flex items-center gap-2 py-1">
                <input
                  type="checkbox"
                  id="catIsActive"
                  checked={catIsActive}
                  onChange={(e) => setCatIsActive(e.target.checked)}
                  className="rounded border-zinc-800 text-orange-600 focus:ring-0 focus:ring-offset-0 bg-zinc-950 w-4 h-4 cursor-pointer"
                />
                <label htmlFor="catIsActive" className="text-xs font-bold text-zinc-300 cursor-pointer select-none">
                  Category is Active
                </label>
              </div>

              <div className="flex items-center gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => setCategoryModal({ open: false, mode: "create" })}
                  className="flex-1 py-2.5 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 font-bold rounded-xl cursor-pointer text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={catSaving}
                  className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl cursor-pointer text-xs disabled:opacity-50"
                >
                  {catSaving ? "Saving..." : "Save Category"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DISH FORM MODAL */}
      {itemModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overscroll-contain bg-black/75 p-4 backdrop-blur-xs">
          <div className="relative flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="item-modal-title">
            <h3 id="item-modal-title" className="text-lg font-black text-white">
              {itemModal.mode === "create" ? "Add Menu Item" : "Edit Menu Item"}
            </h3>

            {itemFormError && (
              <div className="bg-red-950/40 border border-red-900/50 text-red-400 text-xs font-semibold p-3 rounded-xl">
                ⚠️ {itemFormError}
              </div>
            )}

            <form onSubmit={handleItemSubmit} className="flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">
                    English Name *
                  </label>
                  <input
                    type="text"
                    value={itemNameEn}
                    onChange={(e) => setItemNameEn(e.target.value)}
                    placeholder="e.g. Chicken Biriyani"
                    className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 focus:border-orange-600 rounded-xl text-xs outline-none transition text-white placeholder-zinc-700"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">
                    Malayalam Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={itemNameMl}
                    onChange={(e) => setItemNameMl(e.target.value)}
                    placeholder="e.g. ചിക്കൻ ബിരിയാണി"
                    className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 focus:border-orange-600 rounded-xl text-xs outline-none transition text-white placeholder-zinc-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">
                    Category *
                  </label>
                  <select
                    value={itemCategoryId}
                    onChange={(e) => setItemCategoryId(e.target.value)}
                    className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 focus:border-orange-600 rounded-xl text-xs outline-none transition text-white"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name_en}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">
                    Price (INR) *
                  </label>
                  <input
                    type="text"
                    value={itemPrice}
                    onChange={(e) => setItemPrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 focus:border-orange-600 rounded-xl text-xs outline-none transition text-white placeholder-zinc-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">
                    Description (EN)
                  </label>
                  <textarea
                    value={itemDescriptionEn}
                    onChange={(e) => setItemDescriptionEn(e.target.value)}
                    placeholder="Brief description in English..."
                    rows={2}
                    className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 focus:border-orange-600 rounded-xl text-xs outline-none transition text-white placeholder-zinc-700 resize-none"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">
                    Description (ML)
                  </label>
                  <textarea
                    value={itemDescriptionMl}
                    onChange={(e) => setItemDescriptionMl(e.target.value)}
                    placeholder="വിവരണം മലയാളത്തിൽ..."
                    rows={2}
                    className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 focus:border-orange-600 rounded-xl text-xs outline-none transition text-white placeholder-zinc-700 resize-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">
                    Image URL (Optional)
                  </label>
                  <input
                    type="text"
                    value={itemImageUrl}
                    onChange={(e) => setItemImageUrl(e.target.value)}
                    placeholder="e.g. http://images.com/dish.jpg"
                    className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 focus:border-orange-600 rounded-xl text-xs outline-none transition text-white placeholder-zinc-700"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">
                    Display Order
                  </label>
                  <input
                    type="number"
                    value={itemDisplayOrder}
                    onChange={(e) => setItemDisplayOrder(Number(e.target.value))}
                    placeholder="0"
                    min="0"
                    className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 focus:border-orange-600 rounded-xl text-xs outline-none transition text-white placeholder-zinc-700"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 py-1">
                <input
                  type="checkbox"
                  id="itemIsAvailable"
                  checked={itemIsAvailable}
                  onChange={(e) => setItemIsAvailable(e.target.checked)}
                  className="rounded border-zinc-800 text-orange-600 focus:ring-0 focus:ring-offset-0 bg-zinc-950 w-4 h-4 cursor-pointer"
                />
                <label htmlFor="itemIsAvailable" className="text-xs font-bold text-zinc-300 cursor-pointer select-none">
                  Item is Available in Stock
                </label>
              </div>

              <div className="flex items-center gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => setItemModal({ open: false, mode: "create" })}
                  className="flex-1 py-2.5 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 font-bold rounded-xl cursor-pointer text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={itemSaving}
                  className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl cursor-pointer text-xs disabled:opacity-50"
                >
                  {itemSaving ? "Saving..." : "Save Menu Item"}
                </button>
              </div>
            </form>
            {itemModal.mode === "edit" && itemModal.item && (
              <MenuOptionEditor
                itemId={itemModal.item.id}
                itemName={itemModal.item.name_en}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
