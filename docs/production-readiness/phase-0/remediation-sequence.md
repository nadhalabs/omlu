# Dependency-ordered remediation sequence

No phase begins its dependent work until prerequisite contract tests pass. Compatibility shims are bounded and observable; rollback means forward restoration where data migrations are irreversible.

## Phase 1 — Identity and tenant boundary

| Work item | Prerequisites | Files/layers | Expected behavior / migration / compatibility / tests / rollback | Pilot |
|---|---|---|---|---|
| P1.1 TenantScope + authority epoch | Phase 0 | auth utils/routes/schemas; web/Flutter models | Server-issued scope everywhere; no DB migration initially; old tokens rejected after rollout window; TSW-03, TRT-08; rollback feature flag only before new tokens required | Yes |
| P1.2 Scoped storage/cache/cart | P1.1 | queryCache/public storage/MenuClient; Flutter cache/cart/providers | All keys scoped and legacy keys purged/quarantined; storage version migration; TSW-01–05 | Yes |
| P1.3 Atomic teardown/account switch | P1.1–2 | web auth/realtime, Flutter auth/providers/realtime | One idempotent coordinator for all triggers; no schema migration; TSW-01–10, TRT-07 | Yes |
| P1.4 WebView auth correctness | P1.3 | `webview_authority_runtime.dart`, WebView shell/navigation policy/tests | Implemented: scope-bound authority; auth navigation joins native teardown and clears cookies/DOM storage/cache/workspace; TSW-02,06 runtime coverage | Yes |
| P1.5 WS HTTP-parity authorization | P1.1, P1.3 | canonical auth resolver, realtime route/service, Redis broker, auth/staff mutations | Implemented: active JTI/version/role/scope validation, targeted distributed disconnect, delivery/heartbeat revalidation; TRT-01–08 | Yes |
| P1.6 Cross-client identity validation | P1.4–5 | backend/web/Flutter/WebView/realtime suites and deployment-like environments | Host suites and Android debug compile pass; closure blocked on attached-device WebView storage/restart test and real Redis multi-process revocation drill | Yes |

Rollback: deploy clients that understand both old/new scope envelope first, then enforce server epoch. Never roll back to cross-scope cache reuse; purge instead.

## Phase 2 — Database integrity

| Work item | Prerequisites | Files/layers | Expected behavior / migration / compatibility / tests / rollback | Pilot |
|---|---|---|---|---|
| P2.1 Schema-diff CI | P1 stable | Alembic, models, CI/tests | Alembic-built PostgreSQL is authoritative; no product behavior; TMIG-01–03 | Yes |
| P2.2 Cleanup + parity migration | P2.1 | migrations/models | Add missing checks/indexes/partial uniques after report-only duplicate scan; compatibility mapping for statuses; TMIG-02–06; backup/forward corrective migration | Yes |
| P2.3 Business-date sequence service | P2.2 | order/bill/Quick Sale services, dashboard/history | One local-date allocator and warning path; migrate sequence rows if needed; TCON-05, TFIN-08 | Yes |
| P2.4 Payment/audit/history/outbox schema | P2.2 | new models/migrations | Immutable ledger, typed audit, Quick Sale history, outbox; dual-read compatibility until backfill verified; TMIG and audit tests | Yes |

## Phase 3 — Financial and mutation correctness

| Work item | Prerequisites | Files/layers | Expected behavior / migration / compatibility / tests / rollback | Pilot |
|---|---|---|---|---|
| P3.1 Idempotency service and client drafts | P1.2, P2.2 | mutation routes, web/Flutter | Stable keys/replay/request hashes; idempotency table; TID suite | Yes |
| P3.2 Canonical states/shared contracts | P2.2, P2.4 | models/schemas/routes/types/UIs | No stage/status ambiguity; translate legacy values during migration; lifecycle tests | Yes |
| P3.3 Quick Sale fulfillment/payment | P3.1–2, ledger | quick_sales/kitchen/payment UIs | served required; optional atomic serve/pay; TFIN-01–05 | Yes |
| P3.4 Bill/payment atomicity and review | P3.1–2, ledger | bills service/routes/web/Flutter | Exact review and one payment transaction; TFIN-03–06 | Yes |
| P3.5 Totals/revenue contracts | P3.2–4 | billing/revenue/dashboard/history/export/owner | Named reconciled metrics; API compatibility aliases deprecated with telemetry; TFIN-06–08 | Yes |
| P3.6 Other atomic mutations | P3.1, P2 constraints | registration/menu options/tables/service requests/session close | Transaction/resume contract, actor history; TID-09, TCON-01–02,07, TAUD | Yes |

Rollback: ledger and audit data are append-only. Old write paths remain disabled; UI/API rollback may read new records through compatibility adapters.

## Phase 4 — Atomic workflows and realtime resilience

| Work item | Prerequisites | Files/layers | Expected behavior / migration / compatibility / tests / rollback | Pilot |
|---|---|---|---|---|
| P4.1 Transactional outbox worker | P2.4, P3 workflows | mutations, realtime, Redis, worker | Commit and event cannot diverge; dual publish only during measured cutover; TRT-09–11 | Yes |
| P4.2 Versioned consumer recovery | P4.1 | web/Flutter realtime/providers | Deduplicate, detect gaps, authoritative refetch; backward-compatible envelope window; TRT-10–11 | Yes |
| P4.3 Stale-admin/concurrent mutation control | P4.2 | staff management/admin APIs/UIs | entity versions and conflict/refetch; TSTALE-01 | Yes |

Rollback keeps outbox rows and replays through the prior-compatible event adapter.

## Phase 5 — Security, UX and observability

| Work item | Prerequisites | Files/layers | Expected behavior / migration / compatibility / tests / rollback | Pilot |
|---|---|---|---|---|
| P5.1 Error boundary/metrics access | P1/P4 | exception handlers, proxies, health/metrics | Stable errors; private authenticated metrics; TSEC-01–03 | Yes |
| P5.2 Distributed throttling | Redis resilience | auth/public/realtime | Shared keyed limits and documented Redis failure mode; TSEC-04 | Yes |
| P5.3 Android download boundary | P1.4 | WebView/native Android/distribution | HTTPS allowlist, redirect/MIME/name/signature controls; TSEC-05–07 | Yes |
| P5.4 Critical-flow accessibility/feedback | P3 stable UI | web/Flutter components | guards, progress, focus, announcement, contrast; TUX suite | Yes |
| P5.5 Operational observability | P4/P5.1 | logs/metrics/alerts/runbooks | Request/event/key correlation, timezone/outbox/reconciliation alerts; no customer data leakage | Yes |

## Phase 6 — Validation and pilot gate

Run the full [test matrix](test-matrix.md), clean-install and production-copy migration rehearsals, security review, tenant isolation tests, payment/revenue reconciliation against fixtures, Redis/outbox failure drills, accessibility checks, backup/restore and rollback drills, and sustained pilot-like load. Every Critical/High/Medium issue requires evidence and sign-off. The go/no-go record MUST include residual risk, owners, monitoring, incident/rollback runbooks, and business-owner approval. Documentation completion alone never changes readiness.

## Exact Phase 1 starting task

Implement P1.1 as a backward-compatible scope-envelope change: define `TenantScope` and `authority_epoch` in backend auth responses/token issuance; add contract tests proving restaurant ID, actor ID, role, security version, and JTI are consistent; then consume that immutable scope in web and Flutter without yet deleting legacy keys. This unlocks scoped migration and teardown without mixing financial remediation.
