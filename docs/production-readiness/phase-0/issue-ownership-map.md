# Issue ownership map

IDs and severities below preserve each supplied finding as separate acceptance criteria. “Owner” is the remediation phase, not a person. All Critical/High issues block pilot; Medium issues marked “yes” affect security, integrity, recovery, or core task completion and also block the gate.

| ID | Sev | Finding and affected evidence/layers | Invariant | Owner/dependencies | Required tests | Pilot |
|---|---|---|---|---|---|---|
| PR-001 | Critical | Cross-account/restaurant persisted leakage; Flutter cache/cart, web cache/storage | D-01–03 | P1 | TSW-01–05 | Yes |
| PR-002 | High | WS survives authority change; realtime route/clients | D-02, D-05 | P1; epoch/teardown | TRT-01–08 | Yes |
| PR-003 | High | Quick Sale pays at ready; quick_sales route/UI | D-06–07 | P3; payment ledger | TFIN-01–03 | Yes |
| PR-004 | High | Server-date order/bill sequences; orders/bills services | D-08 | P2 | TCON-05, TMIG-01 | Yes |
| PR-005 | High | Alembic/ORM drift; models/migrations | D-13 | P2 | TMIG-01–06 | Yes |
| PR-006 | High | Analytics mixes collected/uncollected; history/export/clients | D-10 | P3 | TFIN-07–08 | Yes |
| PR-007 | High | Concurrent duplicate service requests; service_request model/route | D-14 | P2 | TCON-01 | Yes |
| PR-008 | High | `bill_requested` vs `payment_requested`; bill route/types/UI | lifecycle | P3; state constants | TFIN-06 | Yes |
| PR-009 | High | Staff web retry key instability; `staffTables.ts` | D-11 | P3; idempotency store | TID-01–04 | Yes |
| PR-010 | High | Quick Sale retry key rotation; admin Quick Sale UI/API | D-11 | P3 | TID-01–08 | Yes |
| PR-011 | High | Inconsistent financial confirmation; web/Flutter payment UI | D-09 | P3 | TFIN-04–05 | Yes |
| PR-012 | High | Admin self-mutation lacks controlled logout; staff management/auth | D-02–03 | P1 | TSW-07–10 | Yes |
| PR-013 | High | WebView reverses logout/auth failure; WebView/navigation policy | D-04 | P1 | TSW-02,06 | Yes |
| PR-014 | High | Public realtime metrics exposure; health/realtime metrics | error/realtime | P5; auth policy | TSEC-01 | Yes |
| PR-015 | High | Proxy/raw exception disclosure; Next proxy/backend handlers | public errors | P5 | TSEC-02–03 | Yes |
| PR-016 | High | Rejected orders inflate provisional totals; bill/session/history UI | order/financial | P3 | TFIN-06 | Yes |
| PR-017 | High | Concurrent duplicate table numbers; table model/admin | D-15 | P2 | TCON-02, TMIG-05 | Yes |
| PR-018 | High | Non-atomic menu option creation; menu option service/route | atomicity | P3; constraints | TCON-07 | Yes |
| PR-019 | High | Sequential bill/payment partial commits; bills routes/services/clients | D-09, D-12 | P3/P4 | TFIN-03–05, TID-05 | Yes |
| PR-020 | High | Registration partial success; registration route | D-11–12 | P3 | TID-09 | Yes |
| PR-021 | Medium | Public cart/session deleted on transient failure; MenuClient/storage | retry | P3 | TID-01–02,07 | Yes |
| PR-022 | Medium | Public order key reused after success/bfcache; MenuClient | D-11 | P3 | TID-05–06 | Yes |
| PR-023 | Medium | Stale staff management across admins; admin client/realtime | scope/recovery | P4 | TSTALE-01 | Yes |
| PR-024 | Medium | Missing duplicate-action guards; mutation buttons | idempotency | P3/P5 | TUX-01, TID suite | Yes |
| PR-025 | Medium | Kitchen actor missing; kitchen route/history | audit | P3 | TAUD-01 | Yes |
| PR-026 | Medium | Automatic rejection lacks history; dining-session service | audit/order | P3 | TAUD-02 | Yes |
| PR-027 | High | Commit→publication gap; all mutation routes/realtime service | D-12, D-17 | P4; outbox schema | TRT-09–11 | Yes |
| PR-028 | Medium | Process-local rate limiting; auth/realtime counters | concurrency/security | P5; Redis | TSEC-04 | Yes |
| PR-029 | Medium | Android native download trust boundary; WebView/native Android | WebView boundary | P5 | TSEC-05–07 | Yes |
| PR-030 | Medium | Accessibility/feedback gaps; web/Flutter components | UX | P5 | TUX-02–05 | Yes |

## New contradictions found during source inspection

- Flutter’s `restaurantSlug` cart field is populated with `tableNumber` in two entry paths, not only one.
- Bill daily sequence uses server date while invoice sequence in the same service uses restaurant-local time.
- ORM order status does not contain `cancelled`, despite the required lifecycle; bill stores `cancelled` while the canonical accounting term is `voided`.
- Quick Sales share kitchen status events but have no status-history model; standard kitchen history exists but deliberately writes a null actor.
- HTTP requires JTI only when `session_required` is claimed; WebSocket ignores that claim and all session/security-version checks.
- `payment_requested` names a session state, while `bill_requested`, `bill_issued`, and `ready_for_payment` are mixed presentation stages in the pending-payments response.
- Bill payment closes the session directly even though the model includes `paid`; the canonical contract treats paid as an internal atomic waypoint.
