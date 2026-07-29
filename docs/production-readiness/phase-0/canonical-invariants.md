# Canonical invariants

`MUST`, `MUST NOT`, `SHOULD`, `SHOULD NOT`, and `MAY` are normative.

## Identity and authority

`TenantScope = {restaurant_id, actor_id, role, authority_epoch}` is the only operational identity scope. `restaurant_id` and `actor_id` are immutable database identifiers. `role` is current authority, not identity. `authority_epoch` is the server-issued `security_version` plus active session JTI; either changing invalidates the scope. Restaurant slug is a mutable routing label and MUST NOT identify cached or persisted operational state. Table ID/number, staff ID, and user ID MUST NOT stand in for tenant identity.

Every backend query and mutation MUST derive restaurant scope from authenticated authority (or a validated public restaurant/session capability), include it in the database predicate, and reject conflicting route/body identifiers. Every browser/Flutter cache, cart, draft, secure-storage record, WebView state, restored route, realtime subscription, analytics filter, and export MUST be namespaced by the complete applicable scope. Public dining state MUST use `{restaurant_id, dining_session_id/public_token, table_id}`. No state owned by one tenant or actor MAY be returned, rendered, restored, or submitted under another.

Authority MUST be checked against active staff, active restaurant, current role, security version, active JTI, password-change requirement, operations locks, and restaurant operating state for each privileged HTTP mutation. A role change, suspension, removal, password/security change, session revocation, or restaurant reassignment MUST increment authority and terminate incompatible clients.

## Authentication termination

Termination MUST be one idempotent logical operation: mark terminating; reject new mutations; close sockets and cancel reconnects; stop timers/listeners/background work; clear in-memory and persistent scoped caches; clear carts/drafts/navigation/workspace state; clear applicable WebView cookies, DOM storage, and cache; revoke/clear tokens and cookies; reset identity; navigate to login; then permit a new login. It MUST run for logout, expiry, `401`, failed refresh, revoke-all or one-session revoke, password reset, reauthentication-required password change, suspension/removal, invalidating role/restaurant change, applicable global/individual lock, and account switch. A transient logout network failure MUST NOT preserve local authority.

## Realtime

A staff WebSocket MUST validate signature/expiry, `sub`, `restaurant_id`, JTI, active `StaffSession`, `security_version`, role/channel permission, staff/restaurant status, and locks before acceptance. It MUST periodically or event-driven revalidate authority and MUST disconnect on revocation. A reconnect MUST acquire fresh current authority and MUST be impossible after teardown. Privileged channels MUST never rely on the token’s role claim alone. Public channels MUST validate the current capability/session/table state and expose only allowlisted fields. A WebSocket MUST never remain more authoritative than HTTP.

Events MUST be committed transactionally to an outbox, then published with stable event ID and aggregate version. Consumers MUST deduplicate and recover gaps by refetching authoritative state. Redis interruption MAY delay events but MUST NOT lose the committed outbox. Process-local connection/rate counters are not distributed enforcement.

## Time and business date

All instants MUST be stored as timezone-aware UTC. `business_date(restaurant, timestamp_utc)` MUST convert with a validated IANA timezone and return the restaurant-local calendar date. The same service MUST determine order/bill/invoice sequence dates, dashboard “today,” history/export bounds, Quick Sale attribution, and local-hour grouping. Bounds MUST be constructed in local time then converted to UTC, including daylight-saving transitions.

An invalid timezone MUST block settings writes. Legacy invalid data MUST fall back to `Asia/Kolkata`, emit a visible operator warning and structured alert, and MUST NOT fail silently. Sequence allocation MUST lock a row uniquely keyed by `(restaurant_id, business_date)`; server-local `date.today()` is prohibited.

## Operational lifecycles

Authoritative states and transitions are in [state-machines.md](state-machines.md). Status comparisons MUST use shared server/client contracts; presentation stages such as `bill_requested` MUST NOT be stored or confused with entity status. Invalid transitions MUST return `409 transition_conflict` without mutation.

Orders MUST snapshot item name, unit price, quantity, tax-relevant data, and selected option names/prices at creation. Creation MUST be idempotent. Billable subtotal MUST include only accepted/preparing/ready/served orders; pending MAY appear as provisional separately; rejected/cancelled MUST be excluded. Every transition, including automatic rejection at closure, MUST record actor and history. Terminal orders are served, rejected, or cancelled; served is immutable except an explicit correction workflow.

Quick Sales MUST follow `pending → accepted → preparing → ready → served → completed`. Payment from `ready` is forbidden. An atomic `serve_and_record_payment` MAY transition ready to served then completed in one transaction while recording both events, timestamps, actor, method, and one stable key. Late entry is an explicit historical fulfillment+payment workflow, not a lifecycle shortcut: it MUST record occurred-at, entered-at, reason, actor, method, and a system-approved served/completed history.

## Bills and payments

One dining session has at most one active bill. Bill totals MUST be server-derived from immutable snapshots and exclude rejected/cancelled orders. Issuing freezes the financial snapshot; later corrections require void/reissue or an explicit adjustment. Only owner/admin MAY record counter payment under the current product policy. Staff MAY generate/issue/handoff where authorized but MUST NOT choose or confirm method.

Payment review MUST display restaurant, table/Quick Sale, bill identity, exact amount/currency, method, current actor, resulting session/entity states, irreversible consequences, and freshly fetched authoritative status. `record_payment` MUST atomically lock bill/session, verify unpaid/current amount, create a unique payment record, set bill paid, session paid then closed, resolve bill requests, append audits/outbox events, and commit. Duplicate same-key attempts MUST replay the original result; a different key against a paid bill MUST return a non-mutating conflict. Refund/correction is not currently supported and MUST be disabled until an append-only adjustment/refund model exists.

## Revenue

Metric definitions and equations in [financial-contracts.md](financial-contracts.md) are authoritative. A field named only `revenue` MUST NOT be introduced. Collected metrics require an immutable payment record; issued or outstanding value MUST NOT be labeled revenue. Currency MUST be grouped, never summed across currencies. Date attribution uses the payment/refund instant’s restaurant business date.

## Idempotency and atomicity

One logical user intent MUST have one cryptographically random key, created when the draft/action begins, persisted in the same tenant/actor/operation scope, sent on every attempt, and retained across timeout, refresh, background/foreground, and restart. It rotates only after authoritative success or explicit abandonment. The server MUST require it for harmful duplicate mutations, bind it to tenant+actor+operation+request hash, lock/uniquely insert a record, and deterministically replay status/body/resource. Same key with different payload MUST return `409 idempotency_conflict`.

Every workflow MUST be classified as a single transaction, idempotent resumable workflow, explicitly best-effort, or prohibited multi-request sequence. Financial state changes, registration, option-group creation, bill issue/handoff/payment, session closure, and history/outbox writes MUST be a single transaction or a documented resumable saga. User-visible success MUST follow commit. Realtime/push publication occurs from the outbox after commit.

## Database, concurrency, and migrations

A database built by the full Alembic chain MUST enforce all invariants expected by ORM/application metadata. Production MUST NOT use `Base.metadata.create_all()` as migration. CI MUST upgrade an empty PostgreSQL database to head, upgrade a production revision fixture, introspect and compare constraints/indexes/types/defaults/nullability, exercise PostgreSQL-specific races, and test supported downgrade boundaries.

Financial and operational uniqueness MUST be database-backed. Table number/code, daily sequences, idempotency scope, one bill/session, one active dining session/table, and one pending service request per session/type require unique constraints or partial unique indexes. Application pre-checks MAY improve messages but MUST NOT be the safety boundary. Row locks MUST order session → bill → payment/requests to avoid deadlocks.

## Audit, errors, and active states

Every important change MUST record `restaurant_id, entity_type, entity_id, previous_state, new_state, actor_type, actor_id, actor_role, timestamp_utc, reason, request_id, idempotency_key`. `actor_type` is `staff|customer|system|integration`; automatic work uses an explicit named system actor, never null attribution. Kitchen changes MUST identify the staff actor.

Public errors MUST use stable `{code,message,request_id,field_errors?}`. Authentication failures are `401`; authenticated lack of permission is `403`; lifecycle/version/idempotency conflicts are `409`; invalid input is `422`; throttling is `429`; unexpected failures are generic `500`. Raw exceptions, upstream bodies, SQL, stack traces, secret/config details, and internal hostnames MUST NOT cross the public proxy/API boundary.

Active means: dining session `open|payment_requested|payment_pending|paid` (paid is transient until atomic close); bill `draft|issued|payment_pending`; order `pending|accepted|preparing|ready`; Quick Sale `pending|accepted|preparing|ready|served`; staff session `active`; staff `active`; restaurant `open|closing` for reads, with writes governed explicitly; service request `pending`. `closed`, `cancelled`, `rejected`, `completed`, `removed`, and `revoked` are terminal.

## Decision register

| ID | Topic | Decision | Alternatives rejected | Reason | Layers |
|---|---|---|---|---|---|
| D-01 | Tenant scope | Database restaurant+actor IDs, role, authority epoch | Slug, table number | Stable and unambiguous | All |
| D-02 | Authority epoch | Security version + active JTI | JWT expiry only | Immediate invalidation | API, clients, WS |
| D-03 | Account switch | Complete teardown before login | Overwrite token | Prevent leakage | Web, Flutter, WebView |
| D-04 | WebView auth navigation | Login/logout navigation is authoritative and clears WebView identity | Redirect auth route back to remembered workspace | Current behavior reverses logout | Android |
| D-05 | WS revocation | Revalidate and force-disconnect | Connect-time JWT only | HTTP/WS parity | API, Redis, clients |
| D-06 | Quick Sale | Served before completed | Ready→completed | Fulfillment is auditable | API, UI, DB |
| D-07 | Serve-and-pay | Optional atomic action with two history events | Silent combined status | Safe fast path | API, DB, UI |
| D-08 | Business date | Restaurant IANA local date | Server/UTC date | Operational consistency | All |
| D-09 | Payment review | One authoritative confirmation contract | Per-client copy | Prevent method/context mistakes | Web, Flutter |
| D-10 | Revenue | Named collected/issued/outstanding metrics | Generic revenue | Reconciliation | Analytics |
| D-11 | Idempotency | Stable intent key with replay record | Per-attempt random key | Timeout safety | All mutations |
| D-12 | Atomicity | Transaction or resumable workflow, outbox after commit | Sequential best effort | No partial financial state | API, DB, realtime |
| D-13 | Schema CI | PostgreSQL Alembic-built database | SQLite/create_all | Production parity | DB, CI |
| D-14 | Service requests | Partial unique pending `(restaurant,session,type)` | Query pre-check | Race safety | DB |
| D-15 | Tables | Unique normalized `(restaurant,table_number)` and table code | Application check | Race safety | DB |
| D-16 | Audit actor | Typed staff/customer/system actor | Nullable actor | Accountability | DB, API |
| D-17 | Realtime recovery | Transactional outbox + versioned refetch | Fire-after-commit only | Close commit/publication gap | DB, Redis, clients |

No business-owner decision blocks these safety defaults. Before supporting refunds, partial/split payments, service-day cutoffs other than midnight, or multiple currencies per restaurant, the owner MUST choose the commercial policy; until then those features remain disabled.
