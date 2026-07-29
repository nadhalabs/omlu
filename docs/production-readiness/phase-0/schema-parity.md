# Schema and migration parity

## Current inventories

ORM production constraints include:

- Order: valid status; nonnegative subtotal/line prices; positive quantities; unique restaurant/order number and restaurant/idempotency key.
- Quick Sale: valid type/source/status/method; nonnegative amounts; positive quantities; unique restaurant/order number and restaurant/idempotency key.
- Dining session: valid status; partial unique active customer/staff session per table; restaurant/status and table/status indexes.
- Bill: valid status/method; nonnegative amounts; unique bill/session, restaurant/bill number, restaurant/invoice number.
- Staff/session: valid role/status/session status; restaurant/email and username uniqueness; unique JTI.
- Restaurant: valid operating/tax status and GST range.
- Menu/options: nonnegative prices/selections, valid group type, option/link uniqueness.
- Table: unique `(restaurant_id, table_code)` only.
- Service request: valid type/status and lookup indexes, but no pending uniqueness.

The Alembic chain creates the same broad tables through revisions ending in served Quick Sales, but it is not equivalent to current ORM metadata. Confirmed drift:

| Area | ORM expectation/current chain evidence | Gap and future reconciliation |
|---|---|---|
| Dining-session active uniqueness | ORM declares two PostgreSQL partial unique indexes in `models/dining_session.py` | Migration `b7c8…` creates non-unique status indexes; add partial unique indexes after duplicate cleanup |
| Menu constraints | ORM declares option/group selection and price checks | `c2d3…` creates tables but omits several ORM checks; add named checks |
| Order item/snapshot constraints | ORM has positive quantity/nonnegative prices including selected options | Initial and option migrations do not consistently create all current checks; add named checks |
| Table number | ORM/migration only unique table code | Add normalized restaurant/table-number unique index; retain code uniqueness |
| Service requests | ORM/migration have indexes only | Add partial unique pending `(restaurant_id,dining_session_id,request_type)` with legacy-table fallback resolved |
| Cancelled order / voided bill / payment ledger | Not represented consistently | Schema changes follow canonical states; data mapping migration required |
| Audit contract | Generic `AuditLog` lacks previous/new structured columns, request/key and typed actor | Add append-only audit fields/system actor representation |
| Quick Sale history/payment | No status history or payment ledger | Add history and payment FK/uniqueness |

Before writing migrations, Phase 2 MUST introspect an actual empty-chain PostgreSQL schema and the pilot-production revision, generate a machine-readable diff against SQLAlchemy metadata, and attach it to the change. `create_all()` currently risks producing stronger checks/indexes than an Alembic-built database and MUST NOT be used as proof.

## Concurrency protection

| Rule/race | Required database boundary |
|---|---|
| First pending service request | Partial unique index; catch conflict and replay existing |
| Table number/code | Normalized unique indexes; insert first, translate conflict |
| Order/Quick Sale retry | Unique scoped idempotency record plus unique entity key |
| Daily order/bill/invoice sequence | Unique row and `SELECT … FOR UPDATE` or atomic upsert keyed by local business date |
| One active dining session/table | Partial unique index |
| One bill/session and one successful payment/bill | Unique constraints |
| Concurrent payment | Session→bill row locks plus unique successful payment |
| Menu option creation | One transaction; FK/unique/check constraints |
| Lock/self-mutation | Staff/restaurant row lock and authority version compare |
| Event after commit | Transactional outbox unique event ID/aggregate version |

Application check-only safety is rejected for all these rules.

## CI validation design

1. Start supported PostgreSQL, never SQLite.
2. Upgrade an empty database through every Alembic revision to head.
3. Upgrade a sanitized schema fixture at the current production revision to head.
4. Compare tables, columns, types, nullability, server defaults, FKs/on-delete, checks, unique constraints, partial predicates, and indexes against an explicit production manifest/ORM expectation.
5. Run negative inserts: invalid statuses, negative money, zero/negative quantity, duplicate normalized table number/code, duplicate active session, duplicate pending service request, duplicate payment and idempotency payload mismatch.
6. Run two-connection race tests for every row in the concurrency table, including allocation across restaurant-local midnight/DST.
7. Test migration data cleanup and supported downgrade boundaries. Destructive/irreversible revisions MUST declare no downgrade and rollback via forward restore procedure.

No migration is created in Phase 0.
