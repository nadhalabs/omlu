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

    try {
      await updateAdminMenuItemAvailability(item.id, nextAvail);
      // Update local state directly for speed, but reloading is also safe.
      // We do local state update to prevent flashing, which is operationally great.
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, is_available: nextAvail } : i))
      );
    } catch (err) {
      toast(`Failed to update availability: ${getErrorMessage(err, "Update failed.")}`, "error");
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
      {/* Top Title Block */}
      <div>
        <h1 className="text-3xl font-black tracking-tight text-white">
          Menu Management
        </h1>
        <p className="text-zinc-500 text-xs mt-1.5 font-bold">
          Organize categories and configure menu dishes served to tables
        </p>
      </div>

      {/* Grid Layout for Categories and Menu Items */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* LEFT COLUMN: Categories list */}
        <div className="lg:col-span-1 bg-zinc-950/40 border border-zinc-850 rounded-3xl p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-zinc-850 pb-3">
            <h2 className="text-sm font-black text-orange-500 uppercase tracking-wider">
              Categories
            </h2>
            <button
              onClick={() => openCategoryModal("create")}
              className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-xs font-bold text-white rounded-xl transition cursor-pointer"
            >
              + Add
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
                  className="bg-zinc-900 border border-zinc-800 rounded-xl p-3.5 flex items-center justify-between gap-4"
                >
                  <div className="truncate">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-sm text-zinc-200 truncate">
                        {cat.name_en}
                      </span>
                      {!cat.is_active && (
                        <span className="text-[8px] bg-red-950/40 border border-red-900/50 text-red-400 font-bold px-1.5 py-0.5 rounded uppercase">
                          Inactive
                        </span>
                      )}
                    </div>
                    {cat.name_ml && (
                      <span className="text-[10px] text-zinc-500 font-medium block mt-0.5">
                        {cat.name_ml}
                      </span>
                    )}
                    <span className="text-[9px] text-zinc-500 font-bold block mt-1">
                      Order: {cat.display_order} • {cat.item_count} items
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => openCategoryModal("edit", cat)}
                      className="p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-[10px] font-bold text-zinc-300 transition cursor-pointer"
                      title="Edit"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => handleDeleteCategory(cat.id)}
                      className="p-1.5 bg-zinc-800 hover:bg-red-950/20 rounded-lg text-[10px] font-bold text-red-400 hover:text-red-300 transition cursor-pointer"
                      title="Delete"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Menu items list with Search/Filters */}
        <div className="lg:col-span-2 bg-zinc-950/40 border border-zinc-850 rounded-3xl p-5 flex flex-col gap-4">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-850 pb-3">
            <h2 className="text-sm font-black text-orange-500 uppercase tracking-wider">
              Dishes & Menu Items
            </h2>
            <button
              onClick={() => openItemModal("create")}
              disabled={categories.length === 0}
              className={`px-4 py-2 text-xs font-bold text-white rounded-xl transition ${
                categories.length === 0
                  ? "bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-800"
                  : "bg-orange-600 hover:bg-orange-700 active:bg-orange-800 cursor-pointer"
              }`}
            >
              + Add Menu Item
            </button>
          </div>

          {/* Filters Panel */}
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Category Filter */}
            <div className="flex-1">
              <select
                value={selectedCategoryId}
                onChange={(e) => setSelectedCategoryId(e.target.value)}
                className="w-full px-3 py-2.5 bg-zinc-900 border border-zinc-800 focus:border-orange-600 rounded-xl text-xs outline-none transition text-white"
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
                className="w-full px-4 py-2.5 bg-zinc-900 border border-zinc-800 focus:border-orange-600 rounded-xl text-xs outline-none transition text-white placeholder-zinc-600"
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  className="bg-zinc-900 border border-zinc-800 hover:border-zinc-750 transition rounded-2xl p-4 flex flex-col justify-between gap-4"
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
                        <span className="font-extrabold text-sm text-zinc-200 truncate">
                          {item.name_en}
                        </span>
                        {!item.is_available && (
                          <span className="text-[8px] border border-red-300 bg-red-100 text-red-700 font-black px-1.5 py-0.5 rounded uppercase">
                            Unavailable
                          </span>
                        )}
                      </div>
                      {item.name_ml && (
                        <span className="text-[10px] text-zinc-500 font-medium block mt-0.5">
                          {item.name_ml}
                        </span>
                      )}
                      <span className="text-[9px] font-black text-orange-500 uppercase tracking-wider block mt-1.5">
                        {item.category_name}
                      </span>
                    </div>
                  </div>

                  {/* Pricing and Details */}
                  <div className="flex items-center justify-between border-t border-zinc-850 pt-3">
                    <div>
                      <span className="text-[10px] text-zinc-500 font-semibold block uppercase">
                        Price
                      </span>
                      <span className="text-sm font-black text-white">
                        ₹{Number(item.price).toFixed(2)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Availability Quick Toggle */}
                      <button
                        onClick={() => handleToggleAvailability(item)}
                        disabled={updatingAvail[item.id]}
                        className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition cursor-pointer select-none ${
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
                        className="p-1.5 bg-zinc-800 hover:bg-zinc-750 rounded-lg text-xs font-bold text-zinc-300 transition cursor-pointer"
                        title="Edit Item"
                      >
                        ✏️
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => handleDeleteItem(item.id)}
                        className="p-1.5 bg-zinc-800 hover:bg-red-950/20 rounded-lg text-xs font-bold text-red-400 hover:text-red-300 transition cursor-pointer"
                        title="Delete Item"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* CATEGORY FORM MODAL */}
      {categoryModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl max-w-md w-full flex flex-col gap-4 shadow-2xl relative">
            <h3 className="text-lg font-black text-white">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl max-w-lg w-full flex flex-col gap-4 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-black text-white">
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
          </div>
        </div>
      )}
    </div>
  );
}
