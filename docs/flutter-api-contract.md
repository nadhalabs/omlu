# Flutter Operations API Contract

This contract documents the existing backend surface that the native Flutter OMLU app should reuse. The backend remains the source of truth for roles, restaurant isolation, dining-session creation/reuse, pricing, idempotency, order status transitions, permissions, bills, and realtime fanout.

## Shared Rules

- Base URL: configured at build/runtime, for example `https://<render-backend>`. Do not ship backend secrets in Flutter.
- Auth: staff JWT bearer token from `POST /auth/staff/login`; send `Authorization: Bearer <access_token>` on protected HTTP calls.
- Current roles: `owner`, `admin`, `staff`, `kitchen`.
- Current user and role detection: always refresh from `GET /auth/staff/me` after app start, login, foreground resume, and 401 recovery.
- Restaurant scope: all protected endpoints derive restaurant from the authenticated staff user. Flutter must not send restaurant IDs for tenant scoping.
- Money fields are serialized as strings such as `"120.00"` unless noted by an existing schema.
- Common errors: `401` missing/invalid/expired/revoked token, `403` role denied or password change required, `404` tenant-scoped resource missing, `409` invalid state transition/conflict, `422` validation failure, `429` rate limit, `500` unexpected backend failure.
- Optimistic updates: use only for local button disabling/spinners. Refresh from backend after writes and after reconnect because realtime does not support replay cursors.
- Idempotency: required for order creation. Flutter should generate one key per Send Order attempt and reuse it while retrying that exact attempt.

## Auth And Session

### Login

- Method/path: `POST /auth/staff/login`
- Allowed roles: unauthenticated, returns only active `owner`, `admin`, `staff`, `kitchen`
- Request body:

```json
{"restaurant_slug":"omlu-demo","login":"alice","password":"secret"}
```

- Response body:

```json
{
  "access_token": "jwt",
  "token_type": "bearer",
  "expires_in": 3600,
  "staff": {
    "name": "Alice",
    "username": "alice",
    "email": "alice@example.com",
    "role": "staff",
    "status": "active",
    "must_change_password": false,
    "restaurant_name": "OMLU Demo",
    "restaurant_slug": "omlu-demo"
  }
}
```

- Error responses: `401`, `422`, `429`
- Realtime events emitted: none
- Flutter optimistic update: no
- Idempotency required: no

### Current User/Profile And Role Detection

- Method/path: `GET /auth/staff/me`
- Allowed roles: authenticated `owner`, `admin`, `staff`, `kitchen`; allowed even when `must_change_password=true`
- Request body: none
- Response body: same `staff` object from login, without token fields
- Error responses: `401`, `403`
- Realtime events emitted: none
- Flutter optimistic update: no
- Idempotency required: no

### Logout

- Method/path: `POST /auth/staff/logout`
- Allowed roles: authenticated staff session
- Request body: none
- Response body: `{"ok": true}` currently returned by route implementation
- Error responses: `401`
- Realtime events emitted: none
- Flutter optimistic update: yes, clear local session after successful response; clear anyway on 401
- Idempotency required: no

## Staff Phone Operations

### Tables

- Method/path: `GET /staff/tables?filter=all|available|occupied|needs_attention|bill_requested`
- Allowed roles: `owner`, `admin`, `staff`
- Request body: none
- Response body:

```json
{
  "items": [
    {
      "id": 12,
      "table_number": "A1",
      "state": "occupied",
      "has_open_session": true,
      "session_token": "session-token",
      "session_status": "open",
      "active_order_count": 2,
      "current_bill_amount": "240.00",
      "opened_minutes_ago": 15,
      "attention": ["water", "ready_order"],
      "bill_requested": false
    }
  ]
}
```

- Error responses: `401`, `403`, `422`
- Realtime events emitted by related writes: `table.updated`, `session.opened`, `session.closed`, `bill.generated`, `bill.paid`, `service_request.created`, `service_request.resolved`, `order.status_changed`
- Flutter optimistic update: no
- Idempotency required: no

### Table Details, Staff Menu, Active Session

- Method/path: `GET /staff/tables/{table_id}`
- Allowed roles: `owner`, `admin`, `staff`
- Request body: none
- Response body includes:
  - `table`: table summary
  - `session`: active session with orders, selected options, running subtotal, bill
  - `requests`: pending service requests
  - `menu_categories`: active categories with item IDs, prices, availability, option groups
  - `activity`: lightweight timeline
- Error responses: `401`, `403`, `404`
- Realtime events emitted by related writes: same as table list
- Flutter optimistic update: no
- Idempotency required: no

### Explicitly Open Table Session

- Method/path: `POST /staff/tables/{table_id}/sessions`
- Allowed roles: `owner`, `admin`, `staff`
- Request body: none
- Response body: `{"id":1,"session_token":"...","status":"open"}`
- Error responses: `401`, `403`, `404`, `409`
- Realtime events emitted: `session.opened`, `table.updated`
- Flutter optimistic update: no
- Idempotency required: no

### Create Staff-Assisted Order

- Method/path: `POST /staff/tables/{table_id}/orders`
- Allowed roles: `owner`, `admin`, `staff`
- Required headers: `Idempotency-Key: <10-50 chars>`
- Request body:

```json
{
  "items": [
    {
      "menu_item_id": 101,
      "quantity": 2,
      "item_note": "Less spice",
      "selected_options": [{"group_id": 5, "option_id": 9, "quantity": 1}]
    }
  ],
  "customer_note": "Staff assisted order"
}
```

- Response body: public order response with order number/token/status/subtotal/items/status history plus `dining_session_token`, `session_subtotal`, `session_order_count`, `can_order_more`
- Backend behavior: if no open session exists, creates one; if an open session exists, reuses it; stores `source="staff_assisted"` and `created_by_staff_id`
- Error responses: `400` invalid/missing idempotency key, `401`, `403`, `404`, `409`, `422`
- Realtime events emitted: `session.opened` when auto-created, `order.created`, `table.updated`
- Flutter optimistic update: only disable Send Order and show pending local progress; refresh table/order after response
- Idempotency required: yes

### Active Staff Sessions

- Method/path: `GET /staff/sessions`
- Allowed roles: `owner`, `admin`, `staff`
- Request body: none
- Response body: list of `session_token`, `table_number`, `status`, `opened_at`, `last_activity_at`, `order_count`, `combined_subtotal`, `latest_order_status`
- Error responses: `401`, `403`
- Realtime events emitted by related writes: `session.opened`, `session.updated`, `session.closed`, `table.updated`
- Flutter optimistic update: no
- Idempotency required: no

### Close Empty Session

- Method/path: `POST /staff/sessions/{session_token}/close-empty`
- Allowed roles: `owner`, `admin`, `staff`
- Request body: none
- Response body: staff session detail
- Error responses: `401`, `403`, `404`, `409`
- Realtime events emitted: `session.closed`, `table.updated`
- Flutter optimistic update: no
- Idempotency required: no; backend is idempotent for already cancelled sessions

### Staff Service Requests

- Method/path: `GET /staff/service-requests?status_filter=pending|resolved|all`
- Allowed roles: `owner`, `admin`, `staff`
- Request body: none
- Response body: list of service request rows with table/order/session/bill/resolver context
- Error responses: `401`, `403`
- Realtime events emitted by related writes: `service_request.created`, `service_request.resolved`
- Flutter optimistic update: no
- Idempotency required: no

### Resolve Service Request

- Method/path: `PATCH /staff/service-requests/{request_id}/resolve`
- Allowed roles: `owner`, `admin`, `staff`
- Request body: none
- Response body: enriched service request row
- Error responses: `401`, `403`, `404`, `409`
- Realtime events emitted: `service_request.resolved`
- Flutter optimistic update: only mark button busy; backend is source of truth
- Idempotency required: no; resolving an already resolved request returns the existing resolution

### Generate Bill For Table

- Method/path: `POST /staff/tables/{table_id}/bill`
- Allowed roles: `owner`, `admin`, `staff`
- Request body: none
- Response body: bill with bill number, table, session token, orders, subtotal/tax/discount/total, status, payment method/reference
- Error responses: `401`, `403`, `404`, `409`
- Realtime events emitted: `bill.generated`
- Flutter optimistic update: no
- Idempotency required: no; backend refreshes existing bill for session

### Issue Bill

- Method/path: `POST /staff/bills/{bill_number}/issue`
- Allowed roles: `owner`, `admin`, `staff`
- Request body: none
- Response body: bill response
- Error responses: `401`, `403`, `404`, `409`
- Realtime events emitted: `bill.updated`
- Flutter optimistic update: no
- Idempotency required: no

### Send Bill To Counter

- Method/path: `POST /staff/bills/{bill_number}/send-to-counter`
- Allowed roles: `owner`, `admin`, `staff`
- Request body: none
- Response body: bill response
- Error responses: `401`, `403`, `404`, `409`
- Realtime events emitted: `bill.sent_to_counter`, `bill.payment_pending`, `table.status_changed`
- Flutter optimistic update: no
- Idempotency required: no

### Confirm Counter Payment

- Method/path: `POST /staff/bills/{bill_number}/confirm-counter-payment`
- Allowed roles: `owner`, `admin`; Staff and Kitchen receive `403`
- Request body: `{"method":"counter_cash|counter_upi"}`
- Response body: paid bill response
- Error responses: `401`, `403`, `404`, `409`, `422`
- Realtime events emitted: `bill.payment_recorded`, `bill.paid`, `session.closed`, `table.status_changed`
- Flutter optimistic update: no
- Idempotency required: no

### Pending Payments

- Method/path: `GET /staff/bills/pending-payments`
- Allowed roles: `owner`, `admin`; Staff and Kitchen receive `403`
- Response body: table/session, grand total, request time, sender and payment status
- Realtime refresh triggers: `bill.sent_to_counter`, `bill.payment_pending`, `bill.payment_recorded`, `bill.paid`, `session.closed`

## Kitchen Tablet And Large Screen

### Active Kitchen Orders

- Method/path: `GET /kitchen/restaurants/{restaurant_slug}/orders?status=pending,accepted,preparing,ready&limit=100&since=<iso>`
- Allowed roles: `owner`, `admin`, `kitchen`
- Request body: none
- Response body: list of order rows with `order_number`, `public_token`, `table_number`, `status`, `subtotal`, `customer_note`, `created_at`, `status_history`, `items`
- Error responses: `400`, `401`, `403`, `404`
- Realtime events emitted by related writes: `order.created`, `order.status_changed`
- Flutter optimistic update: no
- Idempotency required: no

### Kitchen Status Changes

- Method/path: `PATCH /kitchen/restaurants/{restaurant_slug}/orders/{public_token}/status`
- Allowed roles: `owner`, `admin`, `kitchen`
- Request body: `{"status":"accepted|rejected|preparing|ready|served"}`
- Response body: updated kitchen order response
- Display mapping: app may label `accepted` as “Received”; backend status remains `accepted`
- Allowed transitions: `pending -> accepted|rejected`, `accepted -> preparing|rejected`, `preparing -> ready`, `ready -> served`
- Error responses: `401`, `403`, `404`, `409`, `422`
- Realtime events emitted: `order.status_changed`
- Flutter optimistic update: no, because invalid transitions are stateful and row-locked
- Idempotency required: no

## Owner/Admin Phone And Tablet

### Dashboard

- Method/path: `GET /admin/dashboard/summary`
- Allowed roles: `owner`, `admin`
- Request body: none
- Response body: `today_order_count`, `today_revenue`, `average_order_value`, order/request/session counts, top selling items, orders by hour, table overview, attention items, recent activity
- Error responses: `401`, `403`
- Realtime events emitted by related writes: operations events
- Flutter optimistic update: no
- Idempotency required: no

### Restaurant Settings/Status

- Method/path: `GET /admin/settings`
- Allowed roles: `owner`, `admin`
- Request body: none
- Response body: restaurant settings model
- Error responses: `401`, `403`, `404`
- Realtime events emitted: none
- Flutter optimistic update: no
- Idempotency required: no

- Method/path: `PATCH /admin/settings`
- Allowed roles: `owner`
- Request body: partial restaurant settings update
- Response body: updated restaurant settings model
- Error responses: `401`, `403`, `404`, `422`
- Realtime events emitted: none
- Flutter optimistic update: no
- Idempotency required: no

### Admin Tables

- Method/path: `GET /admin/tables`, `POST /admin/tables`, `PATCH /admin/tables/{table_id}`, `POST /admin/tables/{table_id}/regenerate-code`, `GET /admin/tables/{table_id}/qr`
- Allowed roles: `owner`, `admin`
- Request body: create/update table uses existing `TableCreate`/`TableUpdate` fields
- Response body: table rows include `id`, `table_number`, `table_code`, `is_active`, `public_menu_url`, `qr_code_url`
- Error responses: `401`, `403`, `404`, `409`, `422`
- Realtime events emitted: none for table management except availability-style operations elsewhere
- Flutter optimistic update: no
- Idempotency required: no

### Menu Management

- Method/path: `GET|POST /admin/categories`, `PATCH|DELETE /admin/categories/{category_id}`
- Allowed roles: `owner`, `admin`
- Response body: category fields plus `item_count`
- Realtime events emitted: none
- Flutter optimistic update: no
- Idempotency required: no

- Method/path: `GET|POST /admin/menu-items`, `PATCH|DELETE /admin/menu-items/{item_id}`, `PATCH /admin/menu-items/{item_id}/availability`
- Allowed roles: `owner`, `admin`
- Response body: menu item fields currently do not include option groups
- Realtime events emitted: `availability.updated` for availability changes
- Flutter optimistic update: no
- Idempotency required: no

- Method/path: `/admin/menu/option-groups`, `/admin/menu/options`, `/admin/menu/items/{item_id}/option-groups`
- Allowed roles: `owner`, `admin`
- Request/response body: existing option group, option, and item-link schemas
- Realtime events emitted: none currently
- Flutter optimistic update: no
- Idempotency required: no

### Staff Management

- Method/path: `GET|POST /admin/staff`, `PATCH|DELETE /admin/staff/{staff_id}`, `POST /admin/staff/{staff_id}/reset-password`, `POST /admin/staff/{staff_id}/sessions/revoke`
- Allowed roles: `owner`, `admin` with owner/admin management restrictions enforced server-side
- Response body: staff account fields plus active sessions
- Error responses: `400`, `401`, `403`, `404`, `409`, `422`
- Realtime events emitted: none
- Flutter optimistic update: no
- Idempotency required: no

### Reports, Bills, Sessions, Performance

- Method/path: `GET /admin/history/orders`, `/admin/history/bills`, `/admin/history/sessions`, `/admin/history/performance`
- Allowed roles: `owner`, `admin`
- Request query: `preset`, `start_date`, `end_date`, status/table/staff filters, pagination depending on endpoint
- Response body: paged historical rows or performance metric groups
- Error responses: `401`, `403`, `422`
- Realtime events emitted: none
- Flutter optimistic update: no
- Idempotency required: no

- Method/path: export endpoints under `/admin/history/*/export` and `/admin/history/performance/export.pdf`
- Allowed roles: `owner`, `admin`
- Response body: CSV or PDF stream
- Flutter optimistic update: no
- Idempotency required: no

## Realtime Contract

### Staff WebSocket

- Path: `GET ws(s)://<backend>/ws/staff?token=<jwt>&channel=operations|kitchen|staff|admin|availability`
- Allowed roles:
  - `operations`: any active staff role
  - `kitchen`: `owner`, `admin`, `kitchen`
  - `staff` and `availability`: `owner`, `admin`, `staff`
  - `admin`: `owner`, `admin`
- Initial message: `{"type":"connection.ready"}`
- Heartbeat: `{"type":"heartbeat"}`
- Server event:

```json
{
  "id": "event-id",
  "type": "order.created",
  "timestamp": "2026-07-16T10:00:00+00:00",
  "restaurant_id": 1,
  "resource_id": "123",
  "state": {"order_number":"SO-20260716-0001","status":"pending","table_id":12}
}
```

- Flutter must send only `ping`, `heartbeat`, or JSON `{"type":"ping"}`/`{"type":"heartbeat"}` if it sends messages.
- Deduplication: keep a bounded set of processed event `id`s per app process.
- Reconnect policy: exponential backoff with jitter; on reconnect, refetch the active screen data because there is no replay cursor.
- Foreground/background: disconnect or pause in background when the platform requires it; reconnect and refresh on foreground.

## Flutter Endpoint Coverage Recommendations

- Staff home: `GET /staff/tables`, `GET /staff/service-requests`, `GET /staff/sessions`, WS channel `staff`.
- Staff table detail/order: `GET /staff/tables/{table_id}`, `POST /staff/tables/{table_id}/orders`, `POST /staff/tables/{table_id}/bill`, WS channel `staff`.
- Kitchen board: `GET /kitchen/restaurants/{restaurant_slug}/orders`, `PATCH /kitchen/.../status`, WS channel `kitchen`.
- Owner/admin overview: `GET /admin/dashboard/summary`, `GET /admin/settings`, `GET /admin/tables`, `GET /admin/staff`, history endpoints, WS channel `admin` or `operations`.
- Menu/availability: staff availability endpoints can be used for operational availability; admin menu endpoints can be used for management. Do not invent option fields beyond existing responses.
