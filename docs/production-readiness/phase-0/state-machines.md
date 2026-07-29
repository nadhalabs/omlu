# Canonical state machines

All transitions require matching tenant scope and optimistic aggregate version. Unless stated, invalid source/target, stale version, or terminal mutation returns `409 transition_conflict`, writes nothing, and emits nothing. Each successful transition writes an audit/outbox record in the same transaction. “Key” means a stable idempotency key is required.

## Standard order

Canonical states: `pending, accepted, preparing, ready, served, rejected, cancelled`. Current ORM/Alembic omit `cancelled`; Phase 2 MUST add it before use.

| From → to | Actor/action | Preconditions | Transaction/audit/realtime | Key |
|---|---|---|---|---|
| none → pending | customer or staff; create order | active session/table/menu; priced snapshots | order+items+initial history+sequence+outbox; `order.created` | Yes |
| pending → accepted | kitchen/owner/admin; update status | restaurant accepts orders | row lock; actor history; `order.status_changed` | Yes |
| pending → rejected | kitchen/owner/admin or named system on closure | reason required | row lock; actor/reason history; status event | Yes |
| pending → cancelled | customer before acceptance or authorized staff | cancellation policy permits; reason | row lock; history/event | Yes |
| accepted → preparing | kitchen/owner/admin | accepted | row lock; history/event | Yes |
| accepted → rejected | owner/admin; exceptional reason | no irreversible fulfillment | row lock; history/event | Yes |
| accepted → cancelled | owner/admin; exceptional reason | compensation recorded | row lock; history/event | Yes |
| preparing → ready | kitchen/owner/admin | preparing | row lock; history/event | Yes |
| ready → served | kitchen/owner/admin/staff handoff | fulfillment confirmed | row lock; history/event | Yes |

`served`, `rejected`, and `cancelled` are terminal. Current `kitchen.py` records kitchen `changed_by_staff_id=None`; this violates actor attribution. Automatic session closure rejection in `dining_sessions.py` MUST create history with a named system actor.

## Quick Sale

| From → to | Actor/action | Preconditions | Transaction/audit/realtime | Key |
|---|---|---|---|---|
| none → pending | owner/admin; create takeaway | valid snapshots, no payment method | sale+items+sequence+history/outbox | Yes |
| pending → accepted | kitchen/owner/admin | active restaurant | lock; history/status event | Yes |
| accepted → preparing | kitchen/owner/admin | accepted | lock; history/status event | Yes |
| preparing → ready | kitchen/owner/admin | preparing | lock; history/status event | Yes |
| ready → served | kitchen/owner/admin | handed off | lock; fulfillment history/event | Yes |
| served → completed | owner/admin; record payment | payment review and valid method | payment+completion+audit/outbox atomically | Yes |
| ready → completed | owner/admin; `serve_and_record_payment` only | UI explicitly confirms service+payment | append ready→served and served→completed plus payment atomically | Yes |
| historical none → served → completed | owner/admin; late entry | occurred-at, reason, method | create snapshots and both histories/payment in one transaction | Yes |

`completed` is terminal. Direct `ready→completed` is invalid. Current code accepts it and lacks Quick Sale status-history rows.

## Dining session

Canonical states: `open, payment_requested, payment_pending, paid, closed, cancelled, expired`. `paid` is an internal transactional waypoint and SHOULD not be externally observable before `closed`.

| From → to | Actor/action | Preconditions | Transaction/audit/realtime | Key |
|---|---|---|---|---|
| none → open | customer capability or staff; open | one active session/table; restaurant open | session+token+outbox | Yes |
| open → payment_requested | customer/staff; request bill | billable or explicit zero-total policy | create/refresh draft bill and request atomically | Yes |
| payment_requested → payment_pending | authorized staff; issue/send to counter | bill issued | session+bill locked; handoff audit/event | Yes |
| payment_pending → paid → closed | owner/admin; record payment | unpaid issued bill, exact amount | payment, bill, session, requests, audits/outbox one transaction | Yes |
| open → closed | authorized staff; close empty | no billable orders/payment | reject pending orders with system histories; close | Yes |
| open/payment_requested → cancelled | owner/admin/system | explicit reason; no collection | cancel bill/requests and reject/cancel orders atomically | Yes |
| open → expired | named system | no activity per configured policy | system audit/event | Yes |

`closed`, `cancelled`, and `expired` are terminal. `bill_requested` is not a session state. Current persisted `payment_requested` is canonical.

## Bill

Canonical states: `draft, issued, payment_pending, paid, voided`. Current `cancelled` is renamed/migrated to `voided`; API compatibility MAY translate during a bounded migration.

| From → to | Actor/action | Preconditions | Transaction/audit/realtime | Key |
|---|---|---|---|---|
| none → draft | customer/staff; generate/request | active session; one bill/session | snapshot totals+sequence | Yes |
| draft → draft | authorized refresh | not issued; current order version | deterministic refresh/audit only if changed | Yes |
| draft → issued | staff/owner/admin; issue | validated/frozen totals | invoice allocation+audit/outbox | Yes |
| issued → payment_pending | staff/owner/admin; send to counter | session payment_requested | bill+session handoff | Yes |
| payment_pending → paid | owner/admin; record payment | exact unpaid amount/method | payment transaction described above | Yes |
| draft/issued → voided | owner/admin | no successful payment; reason | bill/session correction audit | Yes |

`paid` and `voided` are terminal. “Generated,” “sent to counter,” and “payment requested” are events/stages, not additional persisted bill statuses.

## Payment

Canonical states belong to an immutable payment attempt/ledger: `pending, succeeded, failed, voided, refunded`. The current model has no payment entity; Phase 2/3 MUST add it.

| From → to | Actor/action | Preconditions | Transaction/audit/realtime | Key |
|---|---|---|---|---|
| none → pending → succeeded | owner/admin; cash/UPI record | bill/Quick Sale payable; amount exact | normally one local transaction; pending may be internal | Yes |
| pending → failed | integration/system | processor failure; no collection | failure code/audit; entity remains payable | Same key |
| succeeded → refunded | owner/admin via future refund workflow | supported policy and reason | append refund; never edit success | Yes |
| succeeded → voided | authorized same-day correction, future policy only | processor/accounting permits | append reversal | Yes |

## Staff, restaurant, locks, and authority

Staff states: `invited → pending → active → suspended → active`; `active|suspended → removed` terminal. Role changes are versioned self-transitions. Admin self-role downgrade, self-suspension, or self-removal MUST be a controlled transaction that updates authority, revokes sessions, emits disconnect, and completes local teardown; unsafe last-owner removal is forbidden.

Restaurant states: `open → closing → closed → open`. `closing` blocks new public sessions/orders but permits fulfillment/payment/closure. `closed` blocks operational writes except explicit reopen/admin recovery. Restaurant inactive/subscription-disabled is a separate authority gate and terminates access according to policy.

Global staff lock: `unlocked ↔ locked`; individual lock: `unlocked ↔ locked`. Owner/admin remain able to recover; affected staff mutations are blocked. If policy requires access termination, the transition increments authority and disconnects immediately. Every lock transition records actor, target, reason, prior/new state, and event.

Authentication authority: `anonymous → authenticating → active → terminating → anonymous`. `active → password_change_required → terminating` after completion; `active → terminating` for all triggers in [tenant-auth-boundary.md](tenant-auth-boundary.md). There is no account-switch edge from one active identity directly to another.
