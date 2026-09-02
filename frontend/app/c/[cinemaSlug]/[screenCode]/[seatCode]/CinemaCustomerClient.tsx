"use client";
import { useEffect, useMemo, useState } from "react";
import { openSeat, placeOrder, trackOrder } from "@/lib/cinema/api";
import styles from "@/app/cinema-admin/cinema.module.css";
import type { MenuOptionGroup } from "@/lib/types";
type Item = {
  id: number;
  name_en: string;
  description_en?: string;
  price: string;
  option_groups?: MenuOptionGroup[];
};
type SeatData = {
  cinema_name: string;
  authority_token: string;
  screen: { name: string };
  seat: { public_code: string };
};
type OrderData = { order_number: string; public_token: string; status: string };
const money = (n: number) => `₹${n.toLocaleString("en-IN")}`;
export default function CinemaCustomerClient({
  cinemaSlug,
  screenCode,
  seatCode,
}: {
  cinemaSlug: string;
  screenCode: string;
  seatCode: string;
}) {
  const [data, setData] = useState<SeatData | null>(null),
    [items, setItems] = useState<Item[]>([]),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [cart, setCart] = useState<Record<number, number>>({}),
    [selections, setSelections] = useState<Record<number, Record<number, number>>>({}),
    [view, setView] = useState<"menu" | "cart" | "tracking">("menu"),
    [order, setOrder] = useState<OrderData | null>(null),
    [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    openSeat(cinemaSlug, screenCode, seatCode)
      .then(({ resolved, menu }) => {
        setData(resolved);
        setItems(menu.categories.flatMap((c: { items: Item[] }) => c.items));
      })
      .catch((e) => setError(e.message));
  }, [cinemaSlug, screenCode, seatCode]);
  const trackedToken = order?.public_token;
  useEffect(() => {
    if (view !== "tracking" || !trackedToken || !data) return;
    const timer = setInterval(
      () =>
        trackOrder(data.authority_token, trackedToken)
          .then(setOrder)
          .catch(() => {}),
      5000,
    );
    return () => clearInterval(timer);
  }, [view, trackedToken, data]);
  const visible = useMemo(
    () =>
      items.filter((x) =>
        `${x.name_en} ${x.description_en || ""}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [items, query],
  );
  const count = Object.values(cart).reduce((a, b) => a + b, 0),
    total = items.reduce(
      (sum, x) => {
        let basePrice = Number(x.price);
        const addonTotal = (x.option_groups || []).reduce((groupTotal, group) => {
          const selected = group.options.find((option) => option.id === selections[x.id]?.[group.id]);
          if (group.type === "variant" && selected) {
            basePrice = Number(selected.price_delta);
            return groupTotal;
          }
          return groupTotal + Number(selected?.price_delta || 0);
        }, 0);
        return sum + (cart[x.id] ?? 0) * (basePrice + addonTotal);
      },
      0,
    ),
    change = (item: Item, delta: number) => {
      if (delta > 0 && !selections[item.id]) {
        setSelections((old) => ({
          ...old,
          [item.id]: Object.fromEntries((item.option_groups || []).filter((group) => group.required || group.type === "variant").flatMap((group) => group.options[0] ? [[group.id, group.options[0].id]] : [])),
        }));
      }
      setCart((old) => ({ ...old, [item.id]: Math.max(0, (old[item.id] ?? 0) + delta) }));
    };
  const submit = async () => {
    if (!data) return;
    setSubmitting(true);
    try {
      const next = await placeOrder(
        data.authority_token,
        Object.entries(cart)
          .filter(([, q]) => q > 0)
          .map(([id, q]) => ({
            menu_item_id: Number(id),
            quantity: q,
            selected_options: Object.entries(selections[Number(id)] || {}).map(([groupId, optionId]) => ({ group_id: Number(groupId), option_id: optionId, quantity: 1 })),
          })),
      );
      setOrder(next);
      setView("tracking");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Order failed");
    } finally {
      setSubmitting(false);
    }
  };
  if (error)
    return (
      <main className={styles.customer}>
        <div className={styles.customerMain} style={{ padding: 30 }}>
          <h1>Unable to order</h1>
          <p>{error}</p>
        </div>
      </main>
    );
  if (!data)
    return (
      <main className={styles.customer}>
        <div className={styles.customerMain} style={{ padding: 30 }}>
          <h1>Loading your seat…</h1>
        </div>
      </main>
    );
  // The rendered location contract remains: Seat {seat.code}.
  const seat = { code: data.seat.public_code },
    location = `${data.screen.name} · Seat ${seat.code}`;
  if (view === "tracking")
    return (
      <main className={styles.cartPanel}>
        <div className={`${styles.cartInner} ${styles.tracking}`}>
          <div className={styles.trackingCheck}>✓</div>
          <p className={styles.eyebrow}>ORDER #{order?.order_number}</p>
          <h1>Your order is confirmed</h1>
          <p>We’ll bring it quietly to {location}.</p>
          <div className={styles.deliveryBox} style={{ textAlign: "left" }}>
            <small>DELIVERY LOCATION</small>
            <strong>{location}</strong>
          </div>
          <div className={styles.steps}>
            {[
              "pending",
              "accepted",
              "preparing",
              "ready",
              "out_for_delivery",
              "delivered",
            ].map((x) => (
              <div
                className={styles.step}
                data-done={x === order?.status}
                key={x}
              >
                {x.replaceAll("_", " ")}
              </div>
            ))}
          </div>
        </div>
      </main>
    );
  if (view === "cart")
    return (
      <main className={styles.cartPanel}>
        <div className={styles.cartInner}>
          <div className={styles.cartTop}>
            <h1>Your order</h1>
            <button
              className={styles.iconButton}
              aria-label="Close cart"
              onClick={() => setView("menu")}
            >
              ×
            </button>
          </div>
          <div className={styles.deliveryBox}>
            <small>DELIVERY TO</small>
            <strong>{location}</strong>
          </div>
          {items
            .filter((x) => cart[x.id])
            .map((x) => (
              <div className={styles.cartItem} key={x.id}>
                <div>
                  <strong>{x.name_en}</strong>
                  <div className={styles.orderMeta}>
                    {money(Number(x.price))} each
                  </div>
                </div>
                <div className={styles.qty}>
                  <button onClick={() => change(x, -1)}>−</button>
                  <span>{cart[x.id]}</span>
                  <button onClick={() => change(x, 1)}>+</button>
                </div>
              </div>
            ))}
        </div>
        <div className={styles.checkout}>
          <div>
            <small>Total</small>
            <strong>{money(total)}</strong>
          </div>
          <button
            disabled={!count || submitting}
            className={styles.button}
            onClick={submit}
          >
            {submitting ? "Placing…" : `Place order · ${money(total)}`}
          </button>
        </div>
      </main>
    );
  return (
    <main className={styles.customer}>
      <div className={styles.customerMain}>
        <header className={styles.customerHero}>
          <div className={styles.customerBrand}>
            <strong>OMLU CINEMA</strong>
            <div className={styles.seatBadge}>{location}</div>
          </div>
          <h1>Snacks and drinks, delivered to your seat.</h1>
          <input
            aria-label="Search concessions"
            className={styles.customerSearch}
            placeholder="Search concessions…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </header>
        <section className={styles.customerProducts}>
          {visible.map((item) => (
            <article className={styles.product} key={item.id}>
              <div>
                <h3>{item.name_en}</h3>
                <p>{item.description_en}</p>
                <strong>{money(Number(item.price))}</strong>
                {(item.option_groups || []).map((group) => (
                  <label className={styles.field} key={group.id}>
                    {group.name}
                    <select
                      className={styles.select}
                      value={selections[item.id]?.[group.id] || group.options[0]?.id || ""}
                      onChange={(event) => setSelections((old) => ({ ...old, [item.id]: { ...(old[item.id] || {}), [group.id]: Number(event.target.value) } }))}
                    >
                      {group.options.map((option) => <option key={option.id} value={option.id}>{option.name}{Number(option.price_delta) ? ` · +${money(Number(option.price_delta))}` : ""}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              <div className={styles.productVisual}>
                {item.name_en.slice(0, 2).toUpperCase()}
                <button
                  className={styles.add}
                  onClick={() => change(item, 1)}
                >
                  {cart[item.id] ? `${cart[item.id]} ADDED` : "ADD"}
                </button>
              </div>
            </article>
          ))}
        </section>
      </div>
      {count > 0 && (
        <button className={styles.cartBar} onClick={() => setView("cart")}>
          <span>
            {count} item{count > 1 ? "s" : ""}
          </span>
          <span>View cart · {money(total)}</span>
        </button>
      )}
    </main>
  );
}
