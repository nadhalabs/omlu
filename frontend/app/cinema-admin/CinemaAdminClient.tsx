"use client";
/* eslint-disable react-hooks/set-state-in-effect -- async server refreshes reconcile controlled UI state */

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  addSeat,
  addSeatRow,
  addScreen,
  advanceOrder,
  loadDashboard,
  loadMenu,
  loadOrders,
  loadScreens,
  qrDestination,
  removeScreen,
  saveLayout,
  saveSeat,
  setMenuAvailability,
  updateScreen,
} from "@/lib/cinema/api";
import type {
  CinemaDashboard,
  CinemaMenuCategory,
  CinemaOperationalStatus,
  CinemaOrder,
  CinemaOrderStatus,
  CinemaScreen,
  CinemaSeat,
} from "@/lib/cinema/types";
import { cinemaOperationalStatus } from "@/lib/cinema/types";
import { useRealtime } from "@/lib/realtime";
import AdminSidebarLink from "@/app/admin/AdminSidebarLink";
import AdminLogoutButton from "@/app/admin/AdminLogoutButton";
import s from "./cinema.module.css";

const pages = [
  ["dashboard", "Dashboard", "dashboard", "Operations"],
  ["orders", "Orders", "history", "Operations"],
  ["kds", "Concession Orders", "kitchen", "Operations"],
  ["screens", "Screens & Seats", "tables", "Cinema"],
  ["qr-codes", "Seat QR Codes", "billing", "Cinema"],
  ["menu", "Concession Menu", "menu", "Cinema"],
  ["staff", "Staff", "staff", "Management"],
  ["reports", "Reports", "performance", "Management"],
  ["printing", "Printing", "printing", "Management"],
  ["settings", "Settings", "settings", "Management"],
] as const;
const labels: Record<CinemaOrderStatus, string> = {
  pending: "New",
  accepted: "New",
  preparing: "New",
  ready: "Ready",
  out_for_delivery: "Ready",
  delivered: "Delivered",
};
const nextStatus: Partial<Record<CinemaOrderStatus, CinemaOrderStatus>> = {
  pending: "ready",
  accepted: "ready",
  preparing: "ready",
  ready: "delivered",
  out_for_delivery: "delivered",
};
const nextLabel: Partial<Record<CinemaOrderStatus, string>> = {
  pending: "Mark Ready",
  accepted: "Mark Ready",
  preparing: "Mark Ready",
  ready: "Mark Delivered",
  out_for_delivery: "Mark Delivered",
};
const operationalStatuses: CinemaOperationalStatus[] = ["pending", "ready", "delivered"];
const money = (value: number) => `₹${value.toLocaleString("en-IN")}`;
const total = (order: CinemaOrder) =>
  order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
const screenFor = (screens: CinemaScreen[], id: string) =>
  screens.find((value) => value.id === id);
const activeSeats = (screen: CinemaScreen) =>
  screen.seats.filter((seat) => seat.status !== "disabled");

function Header({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={s.pageHead}>
      <div>
        <h1>{title}</h1>
        <p className={s.subtitle}>{subtitle}</p>
      </div>
      {action}
    </div>
  );
}
function Notice({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className={s.page}>
      <Header
        title={title}
        subtitle="This area is intentionally unavailable until a later Cinema phase."
      />
      <div className={s.card}>
        <p>{children}</p>
      </div>
    </div>
  );
}
function QrGraphic({ value }: { value: string }) {
  return (
    <div className={s.qr} aria-label={`QR for ${value}`}>
      <QRCodeSVG value={value} size={190} level="M" marginSize={2} />
    </div>
  );
}
function QrCard({
  slug,
  screen,
  seat,
}: {
  slug: string;
  screen: CinemaScreen;
  seat: CinemaSeat;
}) {
  return (
    <div className={s.qrCard}>
      <div className={s.qrLogo}>OMLU</div>
      <div className={s.qrTitle}>ORDER FROM YOUR SEAT</div>
      <QrGraphic value={qrDestination(slug, screen, seat)} />
      <div className={s.qrSeat}>{seat.code}</div>
      <div className={s.qrScreen}>{screen.name}</div>
      <div className={s.qrHelp}>Scan to order snacks &amp; drinks</div>
    </div>
  );
}

function AddScreen({
  onAdd,
  onClose,
}: {
  onAdd: (screen: CinemaScreen) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("Screen 1"),
    [code, setCode] = useState("S1"),
    [rows, setRows] = useState(10),
    [seats, setSeats] = useState(14),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onAdd(
        await addScreen({
          name,
          code,
          rows,
          seats_per_row: seats,
          aisles_after: [4, 10],
        }),
      );
    } catch (value) {
      setError(
        value instanceof Error ? value.message : "Unable to create screen",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={s.modalBackdrop}>
      <form className={s.modal} onSubmit={submit}>
        <div className={s.modalHead}>
          <h2>Add a screen</h2>
          <button type="button" className={s.iconButton} onClick={onClose}>
            ×
          </button>
        </div>
        <div className={s.formGrid}>
          <label className={s.field}>
            Name
            <input
              className={s.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label className={s.field}>
            Code
            <input
              className={s.input}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              required
            />
          </label>
          <label className={s.field}>
            Rows
            <input
              className={s.input}
              type="number"
              min="1"
              max="30"
              value={rows}
              onChange={(e) => setRows(+e.target.value)}
            />
          </label>
          <label className={s.field}>
            Seats per row
            <input
              className={s.input}
              type="number"
              min="1"
              max="50"
              value={seats}
              onChange={(e) => setSeats(+e.target.value)}
            />
          </label>
        </div>
        {error && <div className={s.notice}>{error}</div>}
        <div className={s.modalActions}>
          <button type="button" className={s.buttonSecondary} onClick={onClose}>
            Cancel
          </button>
          <button disabled={busy} className={s.button}>
            {busy ? "Creating…" : "Create screen"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Screens({ screens, setScreens }: { screens: CinemaScreen[]; setScreens: React.Dispatch<React.SetStateAction<CinemaScreen[]>> }) {
  const [addingScreen, setAddingScreen] = useState(false), [addingRow, setAddingRow] = useState(false), [addingSeat, setAddingSeat] = useState(false),
    [selectedScreen, setSelectedScreen] = useState(screens[0]?.id || ""), [selectedSeat, setSelectedSeat] = useState(""),
    [dirty, setDirty] = useState<Set<string>>(new Set()), [saving, setSaving] = useState(false), [error, setError] = useState("");
  const canvasRef = useRef<HTMLDivElement>(null), drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const screen = screenFor(screens, selectedScreen) || screens[0];
  const replace = (value: CinemaScreen) => setScreens((old) => old.map((x) => x.id === value.id ? value : x));
  if (!screen) return <div className={s.page}><Header title="No screens yet" subtitle="Create the first auditorium, then adapt every row and seat independently." action={<button className={s.button} onClick={() => setAddingScreen(true)}>+ Create first screen</button>} />{addingScreen && <AddScreen onClose={() => setAddingScreen(false)} onAdd={(value) => { setScreens([value]); setSelectedScreen(value.id); setAddingScreen(false); }} />}</div>;
  const seat = screen.seats.find((value) => value.id === selectedSeat);
  const patchSeat = async (value: CinemaSeat, patch: Parameters<typeof saveSeat>[2]) => {
    setError("");
    try { const saved = await saveSeat(screen.id, value.id, patch); replace({ ...screen, seats: screen.seats.map((item) => item.id === saved.id ? saved : item) }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save seat"); }
  };
  const savePositions = async () => {
    setSaving(true); setError("");
    try {
      const saved = await Promise.all(screen.seats.filter((value) => dirty.has(value.id)).map((value) => saveSeat(screen.id, value.id, { layout_x: value.layoutX, layout_y: value.layoutY, display_order: value.displayOrder })));
      const byId = new Map(saved.map((value) => [value.id, value])); replace({ ...screen, seats: screen.seats.map((value) => byId.get(value.id) || value) }); setDirty(new Set());
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save layout"); }
    finally { setSaving(false); }
  };
  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current || !canvasRef.current) return;
    const bounds = canvasRef.current.getBoundingClientRect(), x = Math.max(0, Math.round((event.clientX - bounds.left + canvasRef.current.scrollLeft - drag.current.dx) / 8) * 8), y = Math.max(0, Math.round((event.clientY - bounds.top + canvasRef.current.scrollTop - drag.current.dy) / 8) * 8);
    const id = drag.current.id; replace({ ...screen, seats: screen.seats.map((value) => value.id === id ? { ...value, layoutX: x, layoutY: y } : value) }); setDirty((old) => new Set(old).add(id));
  };
  const width = Math.max(760, ...screen.seats.map((value) => value.layoutX + 100)), height = Math.max(460, ...screen.seats.map((value) => value.layoutY + 150));
  return <div className={s.page}>
    <Header title="Screens & Seats" subtitle="Configure the physical seating layout without changing durable seat or QR identity." action={<button className={s.button} disabled={!dirty.size || saving} onClick={() => void savePositions()}>{saving ? "Saving…" : `Save Changes${dirty.size ? ` (${dirty.size})` : ""}`}</button>} />
    {error && <div className={s.notice}>{error}</div>}
    <div className={s.editorToolbar}>
      <label className={s.screenPicker}><span>Screen</span><select className={s.select} value={screen.id} onChange={(event) => { setSelectedScreen(event.target.value); setSelectedSeat(""); setDirty(new Set()); }}>{screens.map((value) => <option key={value.id} value={value.id}>{value.name} · {activeSeats(value).length} seats</option>)}</select></label>
      <div className={s.editorActions}><button className={s.buttonSecondary} onClick={() => setAddingRow(true)}>+ Add Row</button><button className={s.buttonSecondary} onClick={() => setAddingSeat(true)}>+ Add Seat</button><button className={s.buttonSecondary} onClick={() => setAddingScreen(true)}>+ Add Screen</button></div>
    </div>
    <div className={s.designer}>
      <div className={s.auditoriumViewport}>
        <div ref={canvasRef} className={s.flexibleCanvas} style={{ width, height }} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
          <div className={s.screenName}>{screen.name.toUpperCase()} · SCREEN</div><div className={s.screenArc} />
          {screen.seats.slice().sort((a, b) => a.displayOrder - b.displayOrder).map((value) => <button key={value.id} aria-label={`Seat ${value.code}`} className={s.positionedSeat} data-selected={value.id === selectedSeat} data-status={value.status} style={{ left: value.layoutX + 42, top: value.layoutY + 100 }} onPointerDown={(event) => { const bounds = event.currentTarget.getBoundingClientRect(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { id: value.id, dx: event.clientX - bounds.left, dy: event.clientY - bounds.top }; setSelectedSeat(value.id); }}><span>{value.code}</span>{value.status === "accessible" && <i aria-hidden>♿</i>}</button>)}
        </div>
      </div>
      <aside className={`${s.card} ${s.inspector}`}>{seat ? <><div className={s.inspectorHero}><strong>Edit seat {seat.code}</strong><span>Drag the seat to change its position</span></div>
        <div className={s.seatFields}><label className={s.field}>Seat code<input key={`${seat.id}-code`} className={s.input} defaultValue={seat.code} onBlur={(event) => void patchSeat(seat, { public_code: event.target.value.toUpperCase() })} /></label>
        <label className={s.field}>Row<input key={`${seat.id}-row`} className={s.input} defaultValue={seat.row} onBlur={(event) => void patchSeat(seat, { row_label: event.target.value.toUpperCase() })} /></label><label className={s.field}>Seat number<input key={`${seat.id}-number`} className={s.input} type="number" min="1" defaultValue={seat.number} onBlur={(event) => void patchSeat(seat, { seat_number: +event.target.value })} /></label><label className={s.field}>Display order<input key={`${seat.id}-order`} className={s.input} type="number" min="0" defaultValue={seat.displayOrder} onBlur={(event) => void patchSeat(seat, { display_order: +event.target.value })} /></label></div>
        <div className={s.seatStatusList}><div className={s.seatStatusRow}><span><strong>Availability</strong><small>{seat.isActive ? "Available" : "Disabled"}</small></span><button className={seat.isActive ? s.buttonDanger : s.buttonSecondary} onClick={() => void patchSeat(seat, { is_active: !seat.isActive })}>{seat.isActive ? "Disable" : "Make available"}</button></div><div className={s.seatStatusRow}><span><strong>Accessibility</strong><small>{seat.isAccessible ? "Accessible seat" : "Standard seat"}</small></span><button className={s.buttonSecondary} onClick={() => void patchSeat(seat, { is_accessible: !seat.isAccessible })}>{seat.isAccessible ? "Remove" : "Mark accessible"}</button></div></div>
      </> : <p>Select and drag a seat to position it, or select it to edit details.</p>}</aside>
    </div>
    <div className={s.screenSettings}><label className={s.field}>Screen name<input className={s.input} defaultValue={screen.name} onBlur={async (event) => replace(await updateScreen(screen.id, { name: event.target.value }))} /></label><button className={s.secondaryDanger} onClick={async () => { await removeScreen(screen.id); setScreens(await loadScreens()); }}>Deactivate or delete screen</button></div>
    {addingScreen && <AddScreen onClose={() => setAddingScreen(false)} onAdd={(value) => { setScreens((old) => [...old, value]); setSelectedScreen(value.id); setAddingScreen(false); }} />}
    {addingRow && <SeatBuilderModal title="Add Row" fields={["Row label", "Number of seats", "Starting number"]} defaults={["G", "12", "1"]} onClose={() => setAddingRow(false)} onSubmit={async ([row_label, number_of_seats, starting_number]) => { replace(await addSeatRow(screen.id, { row_label, number_of_seats: +number_of_seats, starting_number: +starting_number })); setAddingRow(false); }} />}
    {addingSeat && <SeatBuilderModal title="Add Seat" fields={["Row", "Seat code", "Seat number"]} defaults={["G", "G14", "14"]} accessible onClose={() => setAddingSeat(false)} onSubmit={async ([row_label, public_code, seat_number], isAccessible) => { const saved = await addSeat(screen.id, { row_label, public_code, seat_number: +seat_number, is_accessible: isAccessible }); replace({ ...screen, seats: [...screen.seats, saved] }); setSelectedSeat(saved.id); setAddingSeat(false); }} />}
  </div>;
}

function SeatBuilderModal({ title, fields, defaults, accessible = false, onClose, onSubmit }: { title: string; fields: string[]; defaults: string[]; accessible?: boolean; onClose: () => void; onSubmit: (values: string[], accessible: boolean) => Promise<void> }) {
  const [values, setValues] = useState(defaults), [isAccessible, setAccessible] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <div className={s.modalBackdrop}><form className={s.modal} onSubmit={async (event) => { event.preventDefault(); setBusy(true); setError(""); try { await onSubmit(values, isAccessible); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to add seats"); } finally { setBusy(false); } }}><div className={s.modalHead}><h2>{title}</h2><button type="button" className={s.iconButton} onClick={onClose}>×</button></div><div className={s.formGrid}>{fields.map((field, index) => <label className={s.field} key={field}>{field}<input className={s.input} type={field.toLowerCase().includes("number") || field.includes("seats") ? "number" : "text"} min="1" value={values[index]} onChange={(event) => setValues((old) => old.map((value, item) => item === index ? event.target.value : value))} required /></label>)}{accessible && <label className={s.checkField}><input type="checkbox" checked={isAccessible} onChange={(event) => setAccessible(event.target.checked)} /> Accessible seat</label>}</div>{error && <div className={s.notice}>{error}</div>}<div className={s.modalActions}><button type="button" className={s.buttonSecondary} onClick={onClose}>Cancel</button><button className={s.button} disabled={busy}>{busy ? "Adding…" : title}</button></div></form></div>;
}

function TransitionButton({
  order,
  onSaved,
}: {
  order: CinemaOrder;
  onSaved: (order: CinemaOrder) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const next = nextStatus[order.status];
  if (!next) return null;
  return (
    <>
      <button
        disabled={busy}
        className={s.button}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            onSaved(await advanceOrder(order, next));
          } catch (value) {
            setError(
              value instanceof Error ? value.message : "Transition failed",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Saving…" : nextLabel[order.status]}
      </button>
      {error && <small>{error}</small>}
    </>
  );
}
function Orders({
  orders,
  setOrders,
  screens,
}: {
  orders: CinemaOrder[];
  setOrders: React.Dispatch<React.SetStateAction<CinemaOrder[]>>;
  screens: CinemaScreen[];
}) {
  const [filter, setFilter] = useState<"all" | CinemaOperationalStatus>("all");
  const visible = orders.filter((x) => filter === "all" || cinemaOperationalStatus(x.status) === filter),
    save = (value: CinemaOrder) =>
      setOrders((old) =>
        old.map((x) => (x.backendId === value.backendId ? value : x)),
      );
  return (
    <div className={s.page}>
      <Header
        title="Cinema Orders"
        subtitle="Server-authoritative concession orders. Every transition is persisted before the UI changes."
      />
      <div className={s.toolbar}>
        {(["all", ...operationalStatuses] as const).map((value) => (
          <button
            className={s.screenTab}
            data-active={filter === value}
            key={value}
            onClick={() => setFilter(value)}
          >
            {value === "all" ? "All" : labels[value]}
          </button>
        ))}
      </div>
      <div className={s.tableCard}>
        {visible.length ? (
          visible.map((order) => (
            <div className={s.orderRow} key={order.backendId}>
              <strong>#{order.id}</strong>
              <div className={s.location}>
                {screenFor(screens, order.screenId)?.name || "Screen"}
                <small>Seat {order.seatCode}</small>
              </div>
              <div className={s.orderMeta}>
                {order.items.map((item) => (
                  <span key={item.name}>
                    {item.quantity}× {item.name}
                    {item.options?.map(
                      (option) => ` · ${option.quantity}× ${option.name}`,
                    )}
                  </span>
                ))}
              </div>
              <div className={s.money}>{money(total(order))}</div>
              <span className={s.pill} data-status={order.status}>
                {labels[order.status]}
              </span>
              <TransitionButton order={order} onSaved={save} />
            </div>
          ))
        ) : (
          <div className={s.emptyInspector}>
            No Cinema orders match this status.
          </div>
        )}
      </div>
    </div>
  );
}
function Kds({
  orders,
  setOrders,
  screens,
}: {
  orders: CinemaOrder[];
  setOrders: React.Dispatch<React.SetStateAction<CinemaOrder[]>>;
  screens: CinemaScreen[];
}) {
  const save = (value: CinemaOrder) =>
      setOrders((old) =>
        old.map((x) => (x.backendId === value.backendId ? value : x)),
      );
  return (
    <div className={s.kds}>
      <div className={s.kdsHead}>
        <div>
          <h1>Concession Orders</h1>
          <p>Prepare and deliver orders to seats</p>
        </div>
        <span className={s.pill}>Backend live</span>
      </div>
      <div className={s.kdsLanes}>
        {operationalStatuses.map((status) => (
          <div className={s.lane} key={status}>
            <div className={s.laneHead}>
              {labels[status]}
              <span>{orders.filter((x) => cinemaOperationalStatus(x.status) === status).length}</span>
            </div>
            {orders
              .filter((x) => cinemaOperationalStatus(x.status) === status)
              .map((order) => (
                <div className={s.ticket} key={order.backendId}>
                  <div className={s.ticketLocation}>
                    <strong>
                      {screenFor(screens, order.screenId)?.name || "Screen"} · Seat {order.seatCode}
                    </strong>
                  </div>
                  <div className={s.ticketItems}>
                    {order.items.map((item) => (
                      <div key={item.name}>
                        {item.quantity} × {item.name}
                        {item.options?.map((option) => (
                          <small key={option.name}>
                            {" "}
                            · {option.quantity}× {option.name}
                          </small>
                        ))}
                      </div>
                    ))}
                  </div>
                  {order.items.some((x) => x.note) && (
                    <div className={s.ticketNote}>
                      Note: {order.items.find((x) => x.note)?.note}
                    </div>
                  )}
                  <div className={s.ticketTop}>
                    <b>Order #{order.id}</b>
                    <span>Placed {order.placedMinutesAgo} min ago</span>
                  </div>
                  <TransitionButton order={order} onSaved={save} />
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Dashboard({
  data,
  orders,
}: {
  data: CinemaDashboard;
  orders: CinemaOrder[];
}) {
  return (
    <div className={s.page}>
      <Header
        title={`Good evening, ${data.cinemaName}`}
        subtitle="Today's live concession operations from PostgreSQL."
      />
      <div className={s.metricGrid}>
        {[
          ["Today's revenue", money(data.revenue)],
          ["Orders today", String(data.orderCount)],
          ["Average order value", money(data.averageOrderValue)],
          ["Active orders", String(data.activeOrderCount)],
          ["Active screens", String(data.activeScreens)],
          ["Active seats", String(data.activeSeats)],
          ["Disabled seats", String(data.disabledSeats)],
        ].map((value) => (
          <div className={s.metric} key={value[0]}>
            <div className={s.metricLabel}>{value[0]}</div>
            <div className={s.metricValue}>{value[1]}</div>
          </div>
        ))}
      </div>
      <div className={s.card}>
        <div className={s.cardHead}>
          <h2>Current fulfilment</h2>
        </div>
        <div className={s.statusStrip}>
          {operationalStatuses.map((status) => (
            <div className={s.statusStat} key={status}>
              <strong>{data.statusCounts[status] || 0}</strong>
              <span>{labels[status]}</span>
            </div>
          ))}
        </div>
      </div>
      <div className={s.grid2}>
        <div className={s.card}>
          <h2>Revenue by screen</h2>
          {data.revenueByScreen.length ? (
            data.revenueByScreen.map((value) => (
              <div className={s.barLabel} key={value.screen}>
                <span>{value.screen}</span>
                <strong>{money(value.revenue)}</strong>
              </div>
            ))
          ) : (
            <p>No Cinema revenue today.</p>
          )}
        </div>
        <div className={s.card}>
          <h2>Top concessions</h2>
          {data.topItems.length ? (
            data.topItems.map((value) => (
              <div className={s.barLabel} key={value.name}>
                <span>{value.name}</span>
                <strong>{value.quantity}</strong>
              </div>
            ))
          ) : (
            <p>No items sold today.</p>
          )}
        </div>
      </div>
      <p className={s.orderMeta}>
        {orders.length} persisted order records loaded.
      </p>
    </div>
  );
}
function Reports({ data }: { data: CinemaDashboard }) {
  return (
    <div className={s.page}>
      <Header
        title="Cinema Reports"
        subtitle="Accurate current-business-day results only; unsupported historical analytics are not fabricated."
      />
      <div className={s.metricGrid}>
        {[
          ["Revenue today", money(data.revenue)],
          ["Orders today", String(data.orderCount)],
          ["Average order value", money(data.averageOrderValue)],
        ].map((value) => (
          <div className={s.metric} key={value[0]}>
            <div className={s.metricLabel}>{value[0]}</div>
            <div className={s.metricValue}>{value[1]}</div>
          </div>
        ))}
      </div>
      <div className={s.grid2}>
        <div className={s.card}>
          <h2>Orders by screen</h2>
          {data.ordersByScreen.length ? (
            data.ordersByScreen.map((value) => (
              <div className={s.barLabel} key={value.screen}>
                <span>{value.screen}</span>
                <strong>{value.orders}</strong>
              </div>
            ))
          ) : (
            <p>No orders today.</p>
          )}
        </div>
        <div className={s.card}>
          <h2>Orders by seat</h2>
          {data.ordersBySeat.length ? (
            data.ordersBySeat.map((value) => (
              <div className={s.barLabel} key={value.seat}>
                <span>{value.seat}</span>
                <strong>{value.orders}</strong>
              </div>
            ))
          ) : (
            <p>No seat activity today.</p>
          )}
        </div>
      </div>
    </div>
  );
}
function Menu({
  categories,
  setCategories,
}: {
  categories: CinemaMenuCategory[];
  setCategories: React.Dispatch<React.SetStateAction<CinemaMenuCategory[]>>;
}) {
  return (
    <div className={s.page}>
      <Header
        title="Concession Menu"
        subtitle="This is the tenant's canonical menu catalog; availability changes are persisted and immediately affect customers."
      />
      <div className={s.menuGrid}>
        {categories
          .flatMap((category) => category.items)
          .map((item) => (
            <div
              className={`${s.menuItem} ${!item.available ? s.unavailable : ""}`}
              key={item.id}
            >
              <h3>{item.name}</h3>
              <p>
                {item.category} · {item.description}
              </p>
              <div className={s.menuPrice}>
                <span>{money(item.price)}</span>
                <button
                  aria-label={`Toggle ${item.name}`}
                  className={s.toggle}
                  data-on={item.available}
                  onClick={async () => {
                    await setMenuAvailability(item, !item.available);
                    setCategories((old) =>
                      old.map((category) => ({
                        ...category,
                        items: category.items.map((value) =>
                          value.id === item.id
                            ? { ...value, available: !value.available }
                            : value,
                        ),
                      })),
                    );
                  }}
                />
              </div>
            </div>
          ))}
      </div>
      {!categories.length && (
        <div className={s.card}>
          No menu categories are configured. Use the canonical menu-management
          workflow to create the catalog.
        </div>
      )}
    </div>
  );
}
function QrCodes({ slug, screens }: { slug: string; screens: CinemaScreen[] }) {
  const [screenId, setScreenId] = useState(screens[0]?.id || "");
  const screen = screenFor(screens, screenId) || screens[0];
  if (!screen)
    return (
      <div className={s.page}>
        <Header
          title="QR Codes"
          subtitle="Create a screen before generating seat QR codes."
        />
      </div>
    );
  return (
    <div className={s.page}>
      <Header
        title="QR Codes"
        subtitle="Canonical public destinations for every active physical chair."
        action={
          <button className={s.button} onClick={() => window.print()}>
            Print active seat QRs
          </button>
        }
      />
      <select
        className={s.select}
        value={screen.id}
        onChange={(e) => setScreenId(e.target.value)}
      >
        {screens.map((value) => (
          <option value={value.id} key={value.id}>
            {value.name}
          </option>
        ))}
      </select>
      <div className={s.qrGrid}>
        {activeSeats(screen).map((seat) => (
          <div className={s.qrTile} key={seat.id}>
            <QrCard slug={slug} screen={screen} seat={seat} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CinemaAdminClient({ children, staffName }: { children: ReactNode; staffName: string }) {
  const pathname = usePathname();
  const requestedSection = pathname.split("/").filter(Boolean)[1] ?? "dashboard";
  const valid = pages.some((x) => x[0] === requestedSection) ? requestedSection : "dashboard",
    [screens, setScreens] = useState<CinemaScreen[]>([]),
    [orders, setOrders] = useState<CinemaOrder[]>([]),
    [dashboard, setDashboard] = useState<CinemaDashboard | null>(null),
    [menu, setMenu] = useState<CinemaMenuCategory[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try {
      const [nextScreens, nextOrders, nextDashboard, nextMenu] =
        await Promise.all([
          loadScreens(),
          loadOrders(),
          loadDashboard(),
          loadMenu(),
        ]);
      setScreens(nextScreens);
      setOrders(nextOrders);
      setDashboard(nextDashboard);
      setMenu(nextMenu);
      setError("");
    } catch (value) {
      setError(
        value instanceof Error ? value.message : "Cinema data unavailable",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  const realtimeStatus = useRealtime({
    target: { kind: "staff", channel: "cinema" },
    onEvent: () => void refresh(),
    onReconnect: () => void refresh(),
  });
  let content: React.ReactNode;
  if (loading) {
    content = (
      <div className="flex flex-col gap-6" aria-label="Loading Cinema dashboard">
        <div className="space-y-3"><div className="omlu-skeleton h-7 w-52 rounded" /><div className="omlu-skeleton h-4 w-80 max-w-full rounded" /></div>
        <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, index) => <div key={index} className="rounded-2xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] p-5"><div className="omlu-skeleton h-3 w-24 rounded" /><div className="omlu-skeleton mt-4 h-8 w-20 rounded" /></div>)}</div>
      </div>
    );
  } else if (error || !dashboard) {
    content = (
      <div className="flex flex-1 items-center justify-center py-20"><div className="max-w-md rounded-2xl border border-[var(--omlu-destructive-border)] bg-[var(--omlu-destructive-background)] p-8 text-center"><h1 className="text-lg font-black">Cinema data unavailable</h1><p className="mt-2 text-sm text-[var(--omlu-destructive-text)]">{error}</p><button className="mt-6 rounded-xl bg-orange-600 px-6 py-2.5 text-sm font-bold text-white" onClick={() => void refresh()}>Retry</button></div></div>
    );
  } else switch (valid) {
    case "screens":
      content = <Screens screens={screens} setScreens={setScreens} />;
      break;
    case "qr-codes":
      content = <QrCodes slug={dashboard.cinemaSlug} screens={screens} />;
      break;
    case "orders":
      content = (
        <Orders orders={orders} setOrders={setOrders} screens={screens} />
      );
      break;
    case "kds":
      content = <Kds orders={orders} setOrders={setOrders} screens={screens} />;
      break;
    case "menu":
      content = <Menu categories={menu} setCategories={setMenu} />;
      break;
    case "reports":
      content = <Reports data={dashboard} />;
      break;
    case "staff":
      content = (
        <Notice title="Cinema Staff">
          Cinema staff management is not configured here. Existing authenticated
          roles continue to control access.
        </Notice>
      );
      break;
    case "printing":
      content = (
        <Notice title="Cinema Printing">
          Cinema Printer Bridge routing is planned for Phase 3. No printer
          connection is being claimed.
        </Notice>
      );
      break;
    case "settings":
      content = (
        <Notice title="Cinema Settings">
          Cinema-specific fulfilment settings are not yet persisted. Current
          tenant identity: {dashboard.cinemaName}.
        </Notice>
      );
      break;
    default:
      content = <Dashboard data={dashboard} orders={orders} />;
  }
  return (
    <div className={`${s.cinema} flex min-h-screen min-w-0 flex-col bg-[var(--omlu-page-background)] text-[var(--omlu-text-primary)] lg:flex-row`}>
      <aside className="sticky top-0 z-30 flex w-full shrink-0 flex-col justify-between border-b border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-4 shadow-sm lg:h-dvh lg:w-64 lg:border-b-0 lg:border-r lg:p-6 lg:shadow-none print:hidden">
        <div className="lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
          <div className="mb-3 min-w-0 lg:mb-8"><span className="text-[10px] font-extrabold uppercase tracking-widest text-orange-500">OMLU Admin</span><h2 className="mt-1 text-lg font-black">Cinema Operations</h2><p className="mt-1 flex items-center gap-1.5 truncate text-[10px] font-bold text-[var(--omlu-text-secondary)]"><span className="size-2 shrink-0 rounded-full bg-emerald-500" />{dashboard?.cinemaName ?? "Loading venue…"}</p></div>
          <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-y-auto lg:px-0 lg:pb-0" aria-label="Cinema admin navigation">
            {(["Operations", "Cinema", "Management"] as const).map((group) => <div className="contents lg:block" key={group}><p className="mb-2 mt-4 hidden px-4 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--omlu-text-muted)] first:mt-0 lg:block">{group}</p>{pages.filter((page) => page[3] === group).map(([path, label, icon]) => <AdminSidebarLink href={`/cinema-admin/${path}`} label={label} icon={icon} key={path} />)}</div>)}
          </nav>
        </div>
        <div className="mt-6 hidden border-t border-[var(--omlu-border)] pt-4 lg:block"><div className="mb-3 flex items-center justify-between text-xs font-bold text-[var(--omlu-text-secondary)]"><span className="truncate">{staffName}</span><span className="rounded-md bg-[var(--omlu-muted-surface)] px-2 py-1 uppercase text-[10px] text-orange-500">{realtimeStatus}</span></div><AdminLogoutButton /></div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto p-4 sm:p-6 print:p-0">{content}{children}</main>
    </div>
  );
}
