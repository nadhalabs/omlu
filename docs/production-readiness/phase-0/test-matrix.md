# Pilot-readiness test matrix

All tests run against an Alembic-built PostgreSQL database, real Next.js route handlers, Flutter storage abstraction, and Redis where relevant. Every assertion includes no cross-scope data, final database state, audit actor, idempotency replay, and event/outbox state. Passing this matrix after remediation is necessary, not sufficient, for pilot approval.

## Tenant and account switching

| ID | Scenario | Required result |
|---|---|---|
| TSW-01 | Browser A → logout → B | A data/cache/cart/routes never render or submit; A sockets closed |
| TSW-02 | Android native/WebView A → logout → B | token, provider/cache/cart, cookies/DOM storage/history removed; login not reversed |
| TSW-03 | Same numeric table/table number in two restaurants | operations always use scoped IDs and correct menu/session |
| TSW-04 | Persistent cache after restart/offline restart | only matching authority epoch restores; otherwise empty/login |
| TSW-05 | Account switch with unresolved intent | key quarantined/reconciled only under A; never sent as B |
| TSW-06 | Token expiry, backend `401`, failed refresh | complete teardown and history-replaced login |
| TSW-07 | Role change | old views/mutations/socket terminate; fresh login gets new routes |
| TSW-08 | Suspension/removal/revoke-all/single revoke | bounded disconnect and HTTP rejection; other sessions follow target policy |
| TSW-09 | Global and individual lock | writes blocked; termination occurs where policy says; owner recovery remains |
| TSW-10 | Admin self-role/status mutation and last-owner attempt | controlled teardown; unsafe last-owner change rejected atomically |

### P1.2 web coverage

The web runtime suite covers TSW-01 and TSW-06 at the client authority boundary: complete-scope cache isolation, cleanup-before-redirect, teardown-before-account-B activation, stale-response rejection after generation or epoch changes, identity-storage removal with preference preservation, authenticated `401` teardown, and ordinary `403` preservation. Focused backend tests verify the `/me` scope contract and that the external epoch does not reveal the raw session JTI. Full browser/database deployment scenarios and non-web clients remain required by this matrix.

### P1.3 Flutter coverage

The native runtime suite exercises complete-scope equality/keying, persistent Restaurant A to Restaurant B isolation, application restart with a changed authority epoch, same numeric table identity across tenants, authoritative restaurant slug flow, cart/draft teardown, legacy-key deletion with preference preservation, teardown-before-B ordering, stale-response rejection, active and stale `401`, ordinary `403`, and real reconnect-timer cancellation. This covers the native portion of TSW-02–07 and TRT-07. Android WebView partition/navigation behavior and server-driven socket revocation remain unproven until P1.4/P1.5.

### P1.4 WebView coverage

The WebView authority runtime suite covers the embedded-browser portion of TSW-02 and TSW-06: explicit scope activation, logout and all native authority-invalidating signals, cookie/DOM/WebStorage/cache cleanup callback completion, anonymous login/register preservation, forced password-change access, privileged back/deep-link rejection after teardown, stale callback rejection, restart without remembered authority, ordinary `403` preservation, idempotent concurrent termination, and teardown-before-Account-B activation. Server-driven live-socket revocation remains P1.5.

### P1.5 WebSocket coverage

Database-backed live-socket tests cover HTTP-equivalent handshake rejection for expired tokens, unknown/revoked JTI, security-version mismatch, wrong restaurant, and role-inappropriate channels. Open sockets are then terminated by explicit logout, revoke-all, password reset, suspension, deletion, role change, and restaurant reassignment. Coverage includes multiple connections for one session, multiple sessions for one actor, Redis broker propagation across two instances, and lock-event preservation under the documented non-terminating lock policy.

### P1.6 integrated status

Host-side validation passes for backend HTTP/realtime, web scope/teardown, Flutter scope/persistence/teardown, WebView authority state, Android debug compilation, same-identifier isolation, and stale work. TSW-01–07 and TRT-07–08 have executable component/integration evidence. TSW-02 remains open for device-level WebView cookie/storage/process-restart observation, and distributed TRT revocation remains open for a real Redis multi-process drill; the two-broker fake Redis test is strong implementation evidence but not deployment evidence.

## Realtime and recovery

| ID | Scenario | Required result |
|---|---|---|
| TRT-01–06 | Connected socket during logout, password reset, revoke-all, deletion, role change, restaurant-state change | force close; no later privileged event; reconnect denied |
| TRT-07 | Reconnect after authority termination | no attempt with old credential; fresh auth required |
| TRT-08 | Handshake with expired token, stale security version, revoked JTI, wrong channel, lock | close 1008 without data |
| TRT-09 | Redis interruption during committed mutation | outbox remains; API success truthful; publish resumes |
| TRT-10 | Duplicate/out-of-order event | client dedupes by ID/version and refetches gaps |
| TRT-11 | Worker crash after publish/before marking delivered | duplicate safe; no state duplication |

## Financial correctness

| ID | Scenario | Required result |
|---|---|---|
| TFIN-01 | Pay ready Quick Sale | `409`, no payment/completion |
| TFIN-02 | Pay served Quick Sale | one payment, completed, actor/history/event |
| TFIN-03 | Atomic serve-and-pay | both lifecycle histories and payment in one commit or none |
| TFIN-04 | Duplicate/concurrent payment, same and different keys | same replays; different conflicts; one ledger success |
| TFIN-05 | Ambiguous response and method mismatch | replay returns authoritative original method; UI never silently changes it |
| TFIN-06 | Rejected/cancelled/pending orders in bill subtotal | rejected/cancelled excluded; pending shown separately; stage names canonical |
| TFIN-07 | Mixed paid, issued, outstanding, rejected, refunded cohorts | each named metric and reconciliation equation exact |
| TFIN-08 | Dashboard/history/export/owner mobile same bounds | identical collected result, timezone, currency, definitions |

## Idempotency and client recovery

| ID | Scenario | Required result |
|---|---|---|
| TID-01 | Timeout before commit then same-key retry | exactly one eventual mutation or safe retry |
| TID-02 | Timeout after commit then same-key retry | original status/body/resource replay |
| TID-03 | Same key, identical payload concurrently | one execution and deterministic result |
| TID-04 | Same key, different payload | `409 idempotency_conflict` |
| TID-05 | Browser refresh during mutation | same unresolved key restored and reconciled |
| TID-06 | bfcache after success | success state cannot resubmit; new intent has new key |
| TID-07 | Application restart/offline recovery | unresolved intent survives under exact scope |
| TID-08 | Explicit draft abandonment | key retired; new key generated; audit where financial |
| TID-09 | Registration failure at each commit boundary | deterministic resume/compensation, one tenant/owner/session |

## Concurrency and migration integrity

| ID | Scenario | Required result |
|---|---|---|
| TCON-01 | Simultaneous first service request | one pending row; both callers receive it |
| TCON-02 | Simultaneous same normalized table number/code | one table; deterministic conflict/replay |
| TCON-03–04 | Simultaneous order/Quick Sale retry | one entity/sequence, complete lines/history |
| TCON-05 | Sequence allocation around local midnight and DST | unique monotonic sequence in correct business date |
| TCON-06 | Concurrent payment attempts | one success, no deadlock/partial close |
| TCON-07 | Failure/concurrency during option-group creation | all group/options/links or none |
| TMIG-01 | Clean Alembic install | head succeeds on supported PostgreSQL |
| TMIG-02 | Production-revision upgrade | cleanup/migration succeeds with preserved data |
| TMIG-03 | ORM/manifest vs migration introspection | no unexplained differences |
| TMIG-04 | Invalid status, negative money, invalid quantity | database rejects each |
| TMIG-05 | Duplicate table, session, pending request, payment | database rejects each |
| TMIG-06 | Supported downgrade/forward rollback drill | declared behavior succeeds; irreversible steps documented |

## Security, audit, staleness, and UX

| ID | Scenario | Required result |
|---|---|---|
| TSEC-01 | Anonymous public metrics request | no internal realtime/rate/Redis metrics |
| TSEC-02–03 | Backend exception/proxy upstream failure | stable generic code/request ID; no raw detail/host/stack |
| TSEC-04 | Rate limit across two app processes/restarts | shared limit enforced with fail-safe policy |
| TSEC-05–07 | Download allowed URL, redirect, hostile filename/MIME/APK | allowlist enforced, auth not leaked, safe file/provenance shown |
| TAUD-01 | Kitchen changes order/Quick Sale | exact staff actor and prior/new state |
| TAUD-02 | Session closure automatically rejects | named system actor, reason and order history |
| TSTALE-01 | Admin A changes staff while Admin B view is open | B receives versioned update/refetch; stale mutation conflicts |
| TUX-01 | Double tap/slow response | one action, disabled/progress/retry feedback |
| TUX-02–05 | Keyboard, screen reader, contrast, focus/error announcements on critical web/Flutter flows | WCAG 2.2 AA-oriented acceptance and usable recovery |
