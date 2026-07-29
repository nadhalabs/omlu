# OMLU Phase 0 — Production invariant contract

Status: **complete as a specification; launch decision remains NO-GO**.

This package defines the contracts that remediation MUST implement consistently in the FastAPI backend, PostgreSQL, Alembic, Next.js, Flutter, Android WebView, WebSockets, Redis, analytics, exports, background work, and tests. It is based on repository commit `f60574fade319987a928795cd4fdbe12975488d0` (readiness audit: 24/100). Phase 0 changes documentation only. It does not fix a vulnerability, change runtime behavior, migrate data, or make OMLU pilot-ready.

## Documents

- [Canonical invariants](canonical-invariants.md) — normative cross-layer rules and decision register.
- [State machines](state-machines.md) — authoritative lifecycles and transition contracts.
- [Tenant and authentication boundary](tenant-auth-boundary.md) — identity, storage, logout, WebView, and realtime.
- [Financial contracts](financial-contracts.md) — billing, payment, Quick Sale, metrics, and dates.
- [Idempotency and retries](idempotency-and-retries.md) — mutation inventory and replay ownership.
- [Schema parity](schema-parity.md) — ORM/migration drift, race protection, and CI design.
- [Issue ownership map](issue-ownership-map.md) — the 30 audited findings, owners, dependencies, and tests.
- [Test matrix](test-matrix.md) — deployment-level acceptance scenarios.
- [Remediation sequence](remediation-sequence.md) — dependency-ordered Phases 1–6.

## Evidence boundary

The package was derived from current models, services, routes, migrations, web and Flutter clients, Android WebView code, and tests. “Current” statements are observations, not guarantees. The most important evidence locations are:

- Models: `backend/app/models/{order,quick_sale,dining_session,bill,staff_user,restaurant,restaurant_table,service_request}.py`
- Workflows: `backend/app/routes/{orders,kitchen,quick_sales,bills,sessions,service_request,auth,registration,staff_management,admin,realtime,history,dashboard}.py`
- Services: `backend/app/services/{bills,revenue,realtime,dining_sessions,menu_options}.py`
- Authority: `backend/app/utils/auth.py`
- Schema: `backend/alembic/versions/`
- Web: `frontend/lib/{api,realtime,queryCache,publicSessionStorage,staffTables}.ts` and `frontend/app/`
- Flutter: `mobile-app/omlu_operations/lib/{core,features,src}/`

## Scope and next phases

Phase 0 defines identity, authority, storage ownership, lifecycles, dates, money, retries, atomicity, audit, error, schema, concurrency, and release validation. It deliberately contains no feature development. Work proceeds in order: Phase 1 identity/tenant boundary; Phase 2 database integrity; Phase 3 financial/mutation correctness; Phase 4 atomic workflows/realtime resilience; Phase 5 security/UX/observability; Phase 6 validation and pilot gate.

The first Phase 1 task is to introduce an immutable `TenantScope`/`AuthorityEpoch` at authentication, thread it through web and Flutter cache/storage keys, and implement one teardown coordinator with account-switch tests before changing any financial workflow.

## Glossary

API: application programming interface. CI: continuous integration. DST: daylight-saving time. FK: foreign key. GST: goods and services tax. IANA timezone: a timezone name from the Internet Assigned Numbers Authority database. JTI: JWT ID, the unique token/session identifier. JWT: JSON Web Token. ORM: object-relational mapper. UI: user interface. UTC: Coordinated Universal Time. WebSocket/WS: a persistent bidirectional web connection.
