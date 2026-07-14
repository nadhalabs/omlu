"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getPublicMenu,
  createPublicOrder,
  getPublicDiningSession,
  getActivePublicDiningSession,
  addOrderToDiningSession,
  ApiError,
} from "@/lib/api";
import {
  PublicMenuResponse,
  PublicDiningSessionResponse,
  MenuItem,
  OrderItemRequest,
  SelectedOptionRequest,
} from "@/lib/types";
import {
  clearPublicSessionToken,
  readPublicSessionToken,
  savePublicSessionToken,
} from "@/lib/publicSessionStorage";
import { useRealtime } from "@/lib/realtime";

interface MenuClientProps {
  restaurantSlug: string;
  tableCode: string;
}

type CartLine = {
  key: string;
  menu_item_id: number;
  quantity: number;
  item_note: string;
  selected_options: SelectedOptionRequest[];
};

export default function MenuClient({
  restaurantSlug,
  tableCode,
}: MenuClientProps) {
  const router = useRouter();

  // Client-side states
  const [menuData, setMenuData] = useState<PublicMenuResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<"en" | "ml">("en");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeCategory, setActiveCategory] = useState<number | null>(null);
  
  // Cart & notes states
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [customerNote, setCustomerNote] = useState<string>("");
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [idempotencyKey, setIdempotencyKey] = useState<string>("");
  const [customisingItem, setCustomisingItem] = useState<MenuItem | null>(null);
  const [draftOptions, setDraftOptions] = useState<Record<number, Record<number, number>>>({});
  
  // Order submission states
  const [isPlacingOrder, setIsPlacingOrder] = useState<boolean>(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [currentSession, setCurrentSession] =
    useState<PublicDiningSessionResponse | null>(null);
  const [sessionLoading, setSessionLoading] = useState<boolean>(false);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

  // Fetch menu data
  const fetchMenu = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPublicMenu(restaurantSlug, tableCode);
      setMenuData(data);
      if (data.categories.length > 0) {
        setActiveCategory(data.categories[0].id);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Could not connect to the backend server.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      fetchMenu();
      setIdempotencyKey(crypto.randomUUID());
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [restaurantSlug, tableCode]);

  useRealtime({
    target: { kind: "menu", restaurantSlug, tableCode },
    onEvent: () => void fetchMenu(),
    onReconnect: () => void fetchMenu(),
  });

  useEffect(() => {
    const validateSavedSession = async () => {
      const queryToken = new URLSearchParams(window.location.search).get("session");
      const savedToken = readPublicSessionToken(restaurantSlug, tableCode);
      const tokenToValidate = queryToken || savedToken;

      if (!tokenToValidate) {
        setSessionLoading(true);
        try {
          const activeSession = await getActivePublicDiningSession(restaurantSlug, tableCode);
          savePublicSessionToken(restaurantSlug, tableCode, activeSession.public_token);
          setCurrentSession(activeSession);
          setSessionNotice(
            activeSession.status === "open"
              ? null
              : "This table session is no longer open. New ordering is disabled."
          );
        } catch (err) {
          setCurrentSession(null);
          setSessionNotice(null);
          if (err instanceof ApiError && err.status !== 404) {
            setSessionNotice(err.message);
          }
        } finally {
          setSessionLoading(false);
        }
        return;
      }

      setSessionLoading(true);
      try {
        const session = await getPublicDiningSession(tokenToValidate);
        const belongsToThisTable =
          session.restaurant_slug === restaurantSlug &&
          session.table_code === tableCode;

        if (!belongsToThisTable) {
          clearPublicSessionToken(restaurantSlug, tableCode);
          setCurrentSession(null);
          setSessionNotice("Saved table session did not match this QR table and was removed.");
          return;
        }

        if (["closed", "cancelled"].includes(session.status)) {
          clearPublicSessionToken(restaurantSlug, tableCode);
          setCurrentSession(null);
          setSessionNotice("This saved table session is finished and was removed.");
          return;
        }

        savePublicSessionToken(restaurantSlug, tableCode, session.public_token);
        setCurrentSession(session);
        setSessionNotice(
          session.status === "open"
            ? null
            : "This table session is no longer open. New ordering is disabled."
        );
      } catch {
        clearPublicSessionToken(restaurantSlug, tableCode);
        setCurrentSession(null);
        setSessionNotice("Saved table session could not be verified and was removed.");
      } finally {
        setSessionLoading(false);
      }
    };

    validateSavedSession();
  }, [restaurantSlug, tableCode]);

  // Local translations for UI labels
  const translations = {
    en: {
      searchPlaceholder: "Search menu...",
      cart: "Cart",
      subtotal: "Subtotal",
      items: "items",
      add: "Add",
      noItems: "No items found matching your search",
      table: "Table",
      retry: "Retry",
      connectionError: "Could not load the menu. Please check your connection.",
      loadingText: "Loading menu...",
      viewCart: "View Cart",
      placeOrder: "Place Order",
      submitting: "Placing Order...",
      customerNote: "Add general instructions / note for kitchen...",
      itemNotePlaceholder: "Instructions (e.g. Less spicy)",
      checkoutErrorTitle: "Checkout Error",
      close: "Back to Menu",
      yourCart: "Your Cart",
      emptyCartMsg: "Your cart is empty",
      checkoutFailed: "Checkout failed. Please try again.",
      currentBill: "Current bill",
      previousOrders: "previous orders",
      billLocked: "Ordering is currently locked for this table session.",
      checkingSession: "Checking current table bill...",
      viewFullBill: "View full table bill",
    },
    ml: {
      searchPlaceholder: "വിഭവങ്ങൾ തിരയുക...",
      cart: "കാർട്ട്",
      subtotal: "ആകെ തുക",
      items: "ഇനങ്ങൾ",
      add: "ചേർക്കുക",
      noItems: "തിരച്ചിലിന് അനുയോമായ വിഭവങ്ങൾ ഒന്നും കണ്ടെത്തിയില്ല",
      table: "മേശ",
      retry: "വീണ്ടും ശ്രമിക്കുക",
      connectionError: "മെനു ലോഡ് ചെയ്യാൻ കഴിഞ്ഞില്ല. ദയവായി കണക്ഷൻ പരിശോധിക്കുക.",
      loadingText: "മെനു ലോഡ് ചെയ്യുന്നു...",
      viewCart: "കാർട്ട് കാണുക",
      placeOrder: "ഓർഡർ ചെയ്യുക",
      submitting: "ഓർഡർ ചെയ്യുന്നു...",
      customerNote: "പ്രത്യേക നിർദ്ദേശങ്ങൾ ഇവിടെ എഴുതുക...",
      itemNotePlaceholder: "നിർദ്ദേശങ്ങൾ (ഉദാ: മസാല കുറയ്ക്കണം)",
      checkoutErrorTitle: "ഓർഡർ ചെയ്യുന്നതിൽ പിശക്",
      close: "തിരികെ മെനുവിലേക്ക്",
      yourCart: "നിങ്ങളുടെ കാർട്ട്",
      emptyCartMsg: "കാർട്ടിൽ വിഭവങ്ങൾ ഒന്നുമില്ല",
      checkoutFailed: "ഓർഡർ സബ്മിറ്റ് ചെയ്യാൻ സാധിച്ചില്ല. വീണ്ടും ശ്രമിക്കുക.",
      currentBill: "നിലവിലെ ബിൽ",
      previousOrders: "മുൻ ഓർഡറുകൾ",
      billLocked: "ഈ മേശയിലെ സെഷനിൽ പുതിയ ഓർഡർ ഇപ്പോൾ ലോക്ക് ചെയ്തിരിക്കുന്നു.",
      checkingSession: "നിലവിലെ ടേബിൾ ബിൽ പരിശോധിക്കുന്നു...",
      viewFullBill: "മുഴുവൻ ടേബിൾ ബിൽ കാണുക",
    },
  };

  const t = translations[language];

  // Helper: Get localized text with English fallback
  const getLocalizedText = (enVal: string, mlVal: string | null) => {
    if (language === "ml" && mlVal && mlVal.trim() !== "") {
      return mlVal;
    }
    return enVal;
  };

  // Cart operations
  const optionKey = (itemId: number, options: SelectedOptionRequest[]) =>
    `${itemId}:${options
      .map((option) => `${option.group_id}-${option.option_id}-${option.quantity}`)
      .sort()
      .join("|")}`;

  const selectedOptionsFromDraft = (): SelectedOptionRequest[] =>
    Object.entries(draftOptions).flatMap(([groupId, options]) =>
      Object.entries(options)
        .filter(([, quantity]) => quantity > 0)
        .map(([optionId, quantity]) => ({
          group_id: Number(groupId),
          option_id: Number(optionId),
          quantity,
        }))
    );

  const addLineToCart = (item: MenuItem, selectedOptions: SelectedOptionRequest[] = []) => {
    const key = optionKey(item.id, selectedOptions);
    setCart((prev) => ({
      ...prev,
      [key]: prev[key]
        ? { ...prev[key], quantity: prev[key].quantity + 1 }
        : { key, menu_item_id: item.id, quantity: 1, item_note: "", selected_options: selectedOptions },
    }));
  };

  const addToCart = (item: MenuItem) => {
    if ((item.option_groups || []).length > 0) {
      setDraftOptions({});
      setCustomisingItem(item);
      return;
    }
    addLineToCart(item);
  };

  const incrementQty = (lineKey: string) => {
    setCart((prev) => ({
      ...prev,
      [lineKey]: { ...prev[lineKey], quantity: (prev[lineKey]?.quantity || 0) + 1 },
    }));
  };

  const decrementQty = (lineKey: string) => {
    setCart((prev) => {
      const currentQty = prev[lineKey]?.quantity || 0;
      if (currentQty <= 1) {
        const newCart = { ...prev };
        delete newCart[lineKey];
        return newCart;
      }
      return {
        ...prev,
        [lineKey]: { ...prev[lineKey], quantity: currentQty - 1 },
      };
    });
  };

  const removeItem = (lineKey: string) => {
    setCart((prev) => {
      const newCart = { ...prev };
      delete newCart[lineKey];
      return newCart;
    });
  };

  const handleItemNoteChange = (lineKey: string, note: string) => {
    setCart((prev) => ({
      ...prev,
      [lineKey]: { ...prev[lineKey], item_note: note },
    }));
  };

  const toggleDraftOption = (groupId: number, optionId: number, multi: boolean) => {
    setDraftOptions((prev) => {
      const current = prev[groupId] || {};
      const selected = Boolean(current[optionId]);
      if (!multi) {
        return { ...prev, [groupId]: selected ? {} : { [optionId]: 1 } };
      }
      const nextGroup = { ...current };
      if (selected) delete nextGroup[optionId];
      else nextGroup[optionId] = 1;
      return { ...prev, [groupId]: nextGroup };
    });
  };

  // Search filtering
  const filterItems = (items: MenuItem[]) => {
    if (!searchQuery.trim()) return items;
    const query = searchQuery.toLowerCase();
    return items.filter((item) => {
      const nameEn = item.name_en.toLowerCase();
      const nameMl = (item.name_ml || "").toLowerCase();
      const descEn = (item.description_en || "").toLowerCase();
      const descMl = (item.description_ml || "").toLowerCase();
      return (
        nameEn.includes(query) ||
        nameMl.includes(query) ||
        descEn.includes(query) ||
        descMl.includes(query)
      );
    });
  };

  // Order submission
  const handlePlaceOrder = async () => {
    if (isPlacingOrder) return;
    setIsPlacingOrder(true);
    setCheckoutError(null);

    const orderItemsPayload: OrderItemRequest[] = Object.values(cart).map((line) => ({
      menu_item_id: line.menu_item_id,
      quantity: line.quantity,
      item_note: line.item_note.trim() || null,
      selected_options: line.selected_options,
    }));

    const payload = {
      items: orderItemsPayload,
      customer_note: customerNote.trim() || null,
    };

    try {
      if (currentSession && currentSession.status !== "open") {
        throw new ApiError(409, t.billLocked);
      }

      const sessionResponse = currentSession?.status === "open"
        ? await addOrderToDiningSession(
            currentSession.public_token,
            payload,
            idempotencyKey
          )
        : null;

      const orderResponse = sessionResponse
        ? null
        : await createPublicOrder(
            restaurantSlug,
            tableCode,
            payload,
            idempotencyKey
          );

      const sessionToken =
        sessionResponse?.public_token || orderResponse?.dining_session_token;

      if (!sessionToken) {
        throw new ApiError(500, "Order was placed, but no table session was returned.");
      }

      savePublicSessionToken(restaurantSlug, tableCode, sessionToken);
      
      // Order placed successfully! Clear cart & redirect
      setCart({});
      setCustomerNote("");
      setIsCartOpen(false);
      
      router.push(`/session/${sessionToken}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setCheckoutError(err.message);
      } else {
        setCheckoutError(t.checkoutFailed);
      }
    } finally {
      setIsPlacingOrder(false);
    }
  };

  // Render Loading State
  if (loading) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center min-h-screen bg-zinc-50 dark:bg-zinc-950 px-4 py-8">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-600"></div>
        <p className="mt-4 text-zinc-600 dark:text-zinc-400 font-medium">
          {t.loadingText}
        </p>
      </div>
    );
  }

  // Render Error State
  if (error) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center min-h-screen bg-zinc-50 dark:bg-zinc-950 p-6 text-center">
        <div className="max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 shadow-sm">
          <div className="text-red-500 text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 mb-2">
            {error === "Restaurant not found" ||
            error === "Restaurant is inactive" ||
            error === "Table not found" ||
            error === "Table is inactive"
              ? error
              : t.connectionError}
          </h2>
          <button
            onClick={fetchMenu}
            className="mt-6 px-6 py-2.5 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-semibold rounded-xl transition shadow-sm cursor-pointer"
          >
            {t.retry}
          </button>
        </div>
      </div>
    );
  }

  if (!menuData) return null;

  const { restaurant, table, categories } = menuData;

  // Compute category structures matching search query
  const displayCategories = categories
    .map((category) => {
      const matchedItems = filterItems(category.items);
      return {
        ...category,
        items: matchedItems,
      };
    })
    .filter((category) => category.items.length > 0);

  // Cart total calculations
  const allItemsMap: Record<number, MenuItem> = {};
  categories.forEach((cat) => {
    cat.items.forEach((item) => {
      allItemsMap[item.id] = item;
    });
  });

  let totalQty = 0;
  let subtotal = 0;
  const optionPrice = (item: MenuItem, selectedOptions: SelectedOptionRequest[]) => {
    const groups = item.option_groups || [];
    const variant = selectedOptions
      .map((selection) => groups.find((group) => group.id === selection.group_id)?.options.find((option) => option.id === selection.option_id))
      .find((option) => option && groups.find((group) => group.id === option.group_id)?.type === "variant");
    const addons = selectedOptions.reduce((sum, selection) => {
      const group = groups.find((candidate) => candidate.id === selection.group_id);
      const option = group?.options.find((candidate) => candidate.id === selection.option_id);
      if (!group || !option || group.type !== "addon") return sum;
      return sum + Number(option.price_delta) * selection.quantity;
    }, 0);
    return (variant ? Number(variant.price_delta) : Number(item.price)) + addons;
  };

  const selectedOptionLabels = (item: MenuItem, selectedOptions: SelectedOptionRequest[]) => {
    const groups = item.option_groups || [];
    return selectedOptions.flatMap((selection) => {
      const group = groups.find((candidate) => candidate.id === selection.group_id);
      const option = group?.options.find((candidate) => candidate.id === selection.option_id);
      return option ? [`${group?.name}: ${option.name}${selection.quantity > 1 ? ` x${selection.quantity}` : ""}`] : [];
    });
  };

  const hasRequiredSelections = (item: MenuItem, selectedOptions: SelectedOptionRequest[]) => {
    return (item.option_groups || []).every((group) => {
      const count = selectedOptions
        .filter((selection) => selection.group_id === group.id)
        .reduce((sum, selection) => sum + selection.quantity, 0);
      const min = Math.max(group.minimum_selections, group.required ? 1 : 0);
      return count >= min && (!group.maximum_selections || count <= group.maximum_selections);
    });
  };

  const draftSelectedOptions = selectedOptionsFromDraft();

  Object.values(cart).forEach((line) => {
    const item = allItemsMap[line.menu_item_id];
    if (item) {
      totalQty += line.quantity;
      subtotal += optionPrice(item, line.selected_options) * line.quantity;
    }
  });

  const formattedSubtotal = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(subtotal);

  const combinedSubtotal = currentSession
    ? new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
      }).format(Number(currentSession.combined_subtotal))
    : null;

  // Scroll to Category Header
  const scrollToCategory = (categoryId: number) => {
    setActiveCategory(categoryId);
    const element = document.getElementById(`category-${categoryId}`);
    if (element) {
      const headerOffset = 140; // Approximate height of top sticky bars
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.scrollY - headerOffset;
      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      });
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-screen bg-zinc-50 dark:bg-zinc-950 pb-28 text-zinc-900 dark:text-zinc-100">
      {/* Sticky Top Header */}
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800 shadow-xs px-4 py-3 sm:px-6">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-zinc-950 dark:text-zinc-50">
              {restaurant.name}
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
              {t.table} {table.table_number}
            </p>
          </div>
          {/* Language Selector */}
          <button
            onClick={() => setLanguage(language === "en" ? "ml" : "en")}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm font-semibold bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer transition"
          >
            🌐 {language === "en" ? "മലയാളം" : "English"}
          </button>
        </div>
      </header>

      {/* Floating search and category bar */}
      <div className="sticky top-[61px] z-30 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800 py-3 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto flex flex-col gap-3">
          {/* Search box */}
          {sessionLoading && (
            <div className="text-xs font-semibold text-amber-700 dark:text-amber-500 bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40 rounded-xl px-3 py-2">
              {t.checkingSession}
            </div>
          )}

          {currentSession && (
            <div className="flex items-center justify-between gap-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 rounded-2xl px-4 py-3">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                  {t.currentBill}
                </p>
                <p className="text-xs text-emerald-700/80 dark:text-emerald-300/80 font-semibold">
                  {currentSession.order_count} {t.previousOrders}
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-black text-emerald-700 dark:text-emerald-400">
                  {combinedSubtotal}
                </p>
                <button
                  onClick={() => router.push(`/session/${currentSession.public_token}`)}
                  className="text-[11px] font-bold underline text-emerald-700 dark:text-emerald-300 min-h-8"
                >
                  {t.viewFullBill}
                </button>
              </div>
            </div>
          )}

          {sessionNotice && (
            <div className="text-xs font-semibold text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/40 rounded-xl px-3 py-2">
              {language === "en" ? sessionNotice : t.billLocked}
            </div>
          )}

          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400">
              🔍
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.searchPlaceholder}
              className="w-full pl-9 pr-4 py-2 bg-zinc-100 dark:bg-zinc-800 border-0 rounded-xl text-sm focus:ring-2 focus:ring-amber-600 outline-none text-zinc-900 dark:text-zinc-100 placeholder-zinc-400"
            />
          </div>

          {/* Category Tabs */}
          {displayCategories.length > 0 && (
            <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
              {displayCategories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => scrollToCategory(category.id)}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap cursor-pointer transition ${
                    activeCategory === category.id
                      ? "bg-amber-600 text-white shadow-xs"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                  }`}
                >
                  {getLocalizedText(category.name_en, category.name_ml)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <main className="max-w-3xl mx-auto px-4 mt-6 sm:px-6 w-full flex-1">
        {displayCategories.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="text-zinc-300 dark:text-zinc-700 text-5xl mb-4">
              🍽️
            </div>
            <p className="text-zinc-500 dark:text-zinc-400 font-medium">
              {t.noItems}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {displayCategories.map((category) => (
              <section
                key={category.id}
                id={`category-${category.id}`}
                className="scroll-mt-36"
              >
                <h2 className="text-lg font-bold border-b border-zinc-200 dark:border-zinc-800 pb-2 mb-4 text-amber-700 dark:text-amber-500">
                  {getLocalizedText(category.name_en, category.name_ml)}
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {category.items.map((item) => {
                    const simpleKey = optionKey(item.id, []);
                    const cartQty = Object.values(cart)
                      .filter((line) => line.menu_item_id === item.id)
                      .reduce((sum, line) => sum + line.quantity, 0);
                    const isConfigurable = (item.option_groups || []).length > 0;
                    return (
                      <div
                        key={item.id}
                        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 flex gap-4 shadow-2xs hover:shadow-xs transition"
                      >
                        <div className="flex-1 flex flex-col justify-between min-w-0">
                          <div>
                            <h3 className="font-bold text-zinc-950 dark:text-zinc-50 truncate">
                              {getLocalizedText(item.name_en, item.name_ml)}
                            </h3>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2">
                              {getLocalizedText(
                                item.description_en || "",
                                item.description_ml
                              )}
                            </p>
                          </div>
                          <div className="mt-3 flex items-center justify-between">
                            <span className="font-bold text-amber-600 dark:text-amber-500 text-sm">
                              ₹{Number(item.price).toFixed(2)}
                            </span>
                            {!item.is_available ? (
                              <span className="text-xs font-semibold text-red-500 bg-red-50 dark:bg-red-950/20 px-2.5 py-1 rounded-md">
                                Unavailable
                              </span>
                            ) : cartQty === 0 || isConfigurable ? (
                              <button
                                onClick={() => addToCart(item)}
                                className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg cursor-pointer transition shadow-2xs"
                              >
                                + {isConfigurable ? "Choose" : t.add}
                              </button>
                            ) : (
                              <div className="flex items-center border border-amber-600 rounded-lg overflow-hidden bg-amber-50/50 dark:bg-amber-950/10">
                                <button
                                  onClick={() => decrementQty(simpleKey)}
                                  className="px-2.5 py-1 text-amber-600 font-bold hover:bg-amber-600 hover:text-white transition cursor-pointer text-xs"
                                >
                                  −
                                </button>
                                <span className="px-2 text-xs font-bold text-zinc-900 dark:text-zinc-100">
                                  {cartQty}
                                </span>
                                <button
                                  onClick={() => incrementQty(simpleKey)}
                                  className="px-2.5 py-1 text-amber-600 font-bold hover:bg-amber-600 hover:text-white transition cursor-pointer text-xs"
                                >
                                  +
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                        {item.image_url && (
                          <div className="w-20 h-20 bg-zinc-100 dark:bg-zinc-800 rounded-lg overflow-hidden flex-shrink-0">
                            <img
                              src={item.image_url}
                              alt={item.name_en}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      {/* Sticky Bottom Cart Bar */}
      {totalQty > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-t border-zinc-200 dark:border-zinc-800 shadow-lg px-4 py-4 sm:px-6">
          <button
            onClick={() => setIsCartOpen(true)}
            className="max-w-3xl mx-auto flex items-center justify-between w-full bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white rounded-2xl px-5 py-4 shadow-md transition cursor-pointer"
          >
            <div className="flex flex-col text-left">
              <span className="text-xs font-semibold opacity-90 uppercase tracking-wider">
                {t.cart}
              </span>
              <span className="text-sm font-bold">
                {totalQty} {totalQty === 1 ? "item" : t.items}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm font-bold bg-amber-500 px-3 py-1 rounded-xl">
                {t.viewCart}
              </span>
              <span className="text-base font-extrabold">
                {formattedSubtotal}
              </span>
            </div>
          </button>
        </div>
      )}

      {customisingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
              <div>
                <h2 className="text-lg font-black text-zinc-950 dark:text-zinc-50">
                  {getLocalizedText(customisingItem.name_en, customisingItem.name_ml)}
                </h2>
                <p className="mt-1 text-xs font-semibold text-zinc-500">
                  Choose required options before adding this item.
                </p>
              </div>
              <button
                onClick={() => setCustomisingItem(null)}
                className="text-sm font-bold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              >
                Close
              </button>
            </div>
            <div className="flex max-h-[56vh] flex-col gap-5 overflow-y-auto px-6 py-4">
              {(customisingItem.option_groups || []).map((group) => {
                const selectedCount = Object.values(draftOptions[group.id] || {}).reduce((sum, quantity) => sum + quantity, 0);
                const min = Math.max(group.minimum_selections, group.required ? 1 : 0);
                const max = group.maximum_selections;
                const multi = group.type === "addon" && max !== 1;
                return (
                  <section key={group.id} className="rounded-2xl border border-zinc-100 p-4 dark:border-zinc-800">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100">{group.name}</h3>
                        <p className="text-xs text-zinc-500">
                          {min > 0 ? `Choose at least ${min}` : "Optional"}
                          {max ? ` · up to ${max}` : ""}
                        </p>
                      </div>
                      {selectedCount < min && <span className="text-xs font-bold text-red-500">Required</span>}
                    </div>
                    <div className="mt-3 grid gap-2">
                      {group.options.map((option) => {
                        const checked = Boolean(draftOptions[group.id]?.[option.id]);
                        const disabled = !option.available || (!checked && Boolean(max) && selectedCount >= max);
                        return (
                          <button
                            key={option.id}
                            disabled={disabled}
                            onClick={() => toggleDraftOption(group.id, option.id, multi)}
                            className={`flex items-center justify-between rounded-xl border px-3 py-3 text-left text-sm transition disabled:opacity-40 ${
                              checked
                                ? "border-amber-600 bg-amber-50 text-zinc-950 dark:bg-amber-950/20 dark:text-zinc-50"
                                : "border-zinc-200 bg-zinc-50 text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200"
                            }`}
                          >
                            <span className="font-bold">{option.name}</span>
                            <span className="text-xs font-black text-amber-600">₹{Number(option.price_delta).toFixed(2)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
            <div className="border-t border-zinc-200 px-6 py-4 dark:border-zinc-800">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-bold text-zinc-500">Item price</span>
                <span className="text-lg font-black text-amber-600">
                  ₹{optionPrice(customisingItem, draftSelectedOptions).toFixed(2)}
                </span>
              </div>
              <button
                disabled={!hasRequiredSelections(customisingItem, draftSelectedOptions)}
                onClick={() => {
                  addLineToCart(customisingItem, draftSelectedOptions);
                  setCustomisingItem(null);
                  setDraftOptions({});
                }}
                className="w-full rounded-2xl bg-amber-600 px-5 py-3.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Add to cart
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Slide-over Cart Modal View */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl max-w-lg w-full flex flex-col max-h-[85vh] shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-6 py-4">
              <h2 className="text-lg font-bold text-zinc-950 dark:text-zinc-50">
                {t.yourCart} ({totalQty})
              </h2>
              <button
                onClick={() => setIsCartOpen(false)}
                className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 font-semibold cursor-pointer text-sm"
              >
                {t.close}
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-6">
              {checkoutError && (
                <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 p-4 rounded-2xl text-sm font-medium">
                  <strong>{t.checkoutErrorTitle}:</strong> {checkoutError}
                </div>
              )}

              {Object.keys(cart).length === 0 ? (
                <p className="text-center text-zinc-500 dark:text-zinc-400 font-medium py-8">
                  {t.emptyCartMsg}
                </p>
              ) : (
                <div className="flex flex-col gap-5">
                  {Object.values(cart).map((line) => {
                    const item = allItemsMap[line.menu_item_id];
                    if (!item) return null;
                    const unit = optionPrice(item, line.selected_options);
                    const itemTotal = unit * line.quantity;
                    const labels = selectedOptionLabels(item, line.selected_options);

                    return (
                      <div
                        key={line.key}
                        className="flex flex-col gap-2 pb-4 border-b border-zinc-100 dark:border-zinc-800/50"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h4 className="font-bold text-sm text-zinc-900 dark:text-zinc-50">
                              {getLocalizedText(item.name_en, item.name_ml)}
                            </h4>
                            <span className="text-xs text-amber-600 dark:text-amber-500 font-bold">
                              ₹{unit.toFixed(2)} × {line.quantity}
                            </span>
                            {labels.length > 0 && (
                              <div className="mt-1 flex flex-col gap-0.5">
                                {labels.map((label) => (
                                  <span key={label} className="text-[11px] text-zinc-500 dark:text-zinc-400">
                                    {label}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="font-bold text-sm text-zinc-950 dark:text-zinc-50">
                              ₹{itemTotal.toFixed(2)}
                            </span>
                            {/* Qty controls */}
                            <div className="flex items-center border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden bg-zinc-50 dark:bg-zinc-800">
                              <button
                                onClick={() => decrementQty(line.key)}
                                className="px-2 py-0.5 text-zinc-600 dark:text-zinc-400 font-bold hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer text-sm"
                              >
                                −
                              </button>
                              <span className="px-2 text-xs font-bold text-zinc-900 dark:text-zinc-100">
                                {line.quantity}
                              </span>
                              <button
                                onClick={() => incrementQty(line.key)}
                                className="px-2 py-0.5 text-zinc-600 dark:text-zinc-400 font-bold hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer text-sm"
                              >
                                +
                              </button>
                            </div>
                            {/* Remove button */}
                            <button
                              onClick={() => removeItem(line.key)}
                              className="text-red-500 hover:text-red-700 text-xs font-bold cursor-pointer"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                        {/* Item note field */}
                        <input
                          type="text"
                          value={line.item_note}
                          onChange={(e) =>
                            handleItemNoteChange(line.key, e.target.value)
                          }
                          placeholder={t.itemNotePlaceholder}
                          className="w-full px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800/30 rounded-lg text-xs outline-none focus:ring-1 focus:ring-amber-600"
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* General Order Instructions */}
              {Object.keys(cart).length > 0 && (
                <div className="mt-2">
                  <h4 className="font-bold text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
                    {t.customerNote}
                  </h4>
                  <textarea
                    rows={2}
                    value={customerNote}
                    onChange={(e) => setCustomerNote(e.target.value)}
                    placeholder={t.customerNote}
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm outline-none focus:ring-2 focus:ring-amber-600 text-zinc-900 dark:text-zinc-100"
                  />
                </div>
              )}
            </div>

            {/* Modal Footer */}
            {Object.keys(cart).length > 0 && (
              <div className="border-t border-zinc-200 dark:border-zinc-800 px-6 py-4 flex flex-col gap-4 bg-zinc-50 dark:bg-zinc-900/50">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500 dark:text-zinc-400 font-medium">
                    {t.subtotal}
                  </span>
                  <span className="text-lg font-black text-amber-600 dark:text-amber-500">
                    {formattedSubtotal}
                  </span>
                </div>
                <button
                  disabled={isPlacingOrder || (!!currentSession && currentSession.status !== "open")}
                  onClick={handlePlaceOrder}
                  className={`w-full py-3.5 rounded-2xl font-bold text-white text-center shadow-md transition cursor-pointer flex items-center justify-center gap-2 ${
                    isPlacingOrder
                      ? "bg-zinc-400 dark:bg-zinc-700 cursor-not-allowed"
                      : "bg-amber-600 hover:bg-amber-700 active:bg-amber-800"
                  }`}
                >
                  {isPlacingOrder ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                      {t.submitting}
                    </>
                  ) : (
                    t.placeOrder
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
