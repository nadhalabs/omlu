# Tenant and authentication boundary

## Current evidence and contradictions

Before P1.1, HTTP authority in `backend/app/utils/auth.py` checked staff/restaurant IDs, active status, security version, and only conditionally required an active JTI. `backend/app/routes/realtime.py` still checks only decoded IDs, active staff/restaurant, and role at connection; it does not validate JTI, security version, session, locks, or later revocation. Web query keys sometimes include slug (`frontend/lib/queryCache.ts`), while Flutter `OperationsDataCache` uses global keys such as `tables_all`. `tables_screen.dart` and `new_order_screen.dart` explicitly pass `table.tableNumber` to `CartNotifier.setTable(..., restaurantSlug)`. Flutter logout clears tokens but not that cache/cart or realtime as one atomic operation.

The Android WebView remembers that an authenticated workspace existed and prevents later navigation to an authentication route by loading the remembered role home (`src/omlu_webview_app.dart`, `navigation_policy.dart`). This can reverse explicit logout or authentication-failure navigation. Web logout clears the cookie even when backend logout fails, but no single coordinator clears query cache, component state, reconnects, DOM storage, and WebView state.

### P1.1 implementation record

Authenticated HTTP requests now resolve through `AuthenticatedContext` in `backend/app/utils/auth.py`. Its frozen `TenantScope` is derived only after the token signature/expiry, actor, database restaurant relationship, database role, security version, and active `StaffSession` JTI are validated. `authority_epoch` is the deterministic string `<security_version>:<active_session_jti>`. `get_tenant_scope` exposes the scope directly; existing routes remain compatible through `get_current_staff_user`, which returns the actor from the same cached FastAPI dependency context. Legacy JWTs without a matching active session now fail closed.

P1.1 does not scope client storage, perform account teardown, change WebView behavior, or change WebSocket authentication. Operations locks and restaurant `open|closing|closed` remain write-policy checks rather than identity fields; their redesign/revocation behavior remains P1.3/P1.5.

### P1.2 web implementation record

The authenticated web `/me` contract now includes `{restaurant_id, actor_id, role, authority_epoch}` under `scope`. The external epoch is a deterministic HMAC-derived opaque value and does not expose the active session JTI. `frontend/lib/authRuntime.mjs` is the sole browser authority coordinator: it owns activation, generation changes, account-switch ordering, identity-storage deletion, server logout, and final history-replacing navigation.

Authenticated browser cache and staff-cart keys are built centrally from the complete scope plus feature and normalized filters. Query responses capture their authority generation and fingerprint and are rejected if teardown or an epoch change occurs before completion. Explicit logout and an authenticated HTTP `401` join the same idempotent teardown; an ordinary `403` leaves the session active. Authenticated polling, focus/visibility refreshes, query state, and staff WebSocket reconnects register cleanup callbacks that finish before a new login is permitted.

P1.2 is web-only. Flutter, Android WebView state, server WebSocket authority/revocation, Redis, database migrations, and authority-invalidating `403` error codes remain assigned to later tasks.

### P1.3 Flutter implementation record

The native operations application consumes the authoritative `/auth/staff/me` scope through immutable `FlutterTenantScope` in `mobile-app/omlu_operations/lib/core/auth/flutter_tenant_scope.dart`. `NativeAuthRuntime` owns the active scope, lifecycle generation, teardown phase, and cleanup barrier. Token restoration does not activate providers or operational storage until `/me` succeeds; login first terminates any previous authority and persists the new session only after its scope validates.

`OperationsDataCache` builds every authenticated cache, cart, draft, and staff-access key through the versioned complete-scope builder. Representative keys contain restaurant ID, actor ID, role, opaque authority epoch, feature, and identifier. The staff cart persists its exact tenant/table draft and stable in-progress idempotency key, resets incompatible table selections, and obtains restaurant slug only from the validated session. The two table-entry paths no longer pass `tableNumber` as `restaurantSlug`.

Explicit logout, active-authority `401`, expiry, invalid restore, failed login `/me`, and account switching converge on the idempotent native teardown. Realtime/lifecycle observers, reconnect timers, carts, provider scope, operational cache, token, and identity are ended before another scope can activate. HTTP, cache, and realtime work is guarded by scope plus lifecycle generation, so late Account A work cannot mutate or terminate Account B. Ordinary `403` remains in-session.

Legacy `omlu_reference_cache_v1_*`, `staff_access_v1_*`, `tables_all`, `staff_cart`, `selected_table`, `kitchen_orders`, and `pending_payments` records are deleted rather than attributed to a tenant. Theme, language, onboarding, public customer state, and other non-operational preferences remain untouched. Offline cold start intentionally exposes no confidential operational cache until `/me` validates.

P1.3 does not change Android WebView navigation/storage, server WebSocket authorization or forced revocation, or Redis channel identity; those remain P1.4/P1.5 work.

### P1.4 Android WebView implementation record

`WebViewAuthorityRuntime` in `mobile-app/omlu_operations/lib/src/webview_authority_runtime.dart` replaces remembered-route authority with explicit `unknown → validating → authenticated(scope) → terminating → anonymous` state. The embedded browser activates only from the already validated native `FlutterTenantScope`; loading or remembering a privileged URL never establishes authority. Anonymous login/register routes are never rewritten, forced password-change routes remain reachable, and an anonymous or terminated runtime rejects privileged history/deep-link navigation.

The WebView registers its idempotent teardown with the P1.3 native runtime. Web-origin logout/login navigation joins native logout, then clears DOM local/session storage, enumerable IndexedDB databases, WebView local storage, disk/memory cache, cookies, current URL, and remembered workspace before another scope may activate. Generation changes and scope removal make late page callbacks unable to restore Account A. Ordinary `403` has no termination transition. Runtime tests cover logout, `401`, expiry, revocation, suspension/deletion, role/restaurant changes, forced password change, stale callbacks, back/restart behavior, cleanup, concurrent termination, and A-to-B ordering.

P1.4 does not alter the native download boundary assigned to P5.3 and does not implement server WebSocket authority or revocation.

### P1.5 WebSocket authority implementation record

`resolve_bearer_token_context` in `backend/app/utils/auth.py` exposes the canonical P1.1 resolver to non-HTTP bearer transports. `/ws/staff` now uses that resolver at handshake and at every event-delivery/heartbeat boundary, validating signature/expiry, actor, claimed/current restaurant, current database role/status, restaurant activity, security version, JTI, and active `StaffSession`. Channel permission is derived from the current database role.

Every staff connection binds an immutable `StaffConnectionAuthority` containing a random connection ID, restaurant/actor IDs, role, opaque external authority epoch, HMAC-derived internal session key, connection time, and requested channel. It subscribes to actor, opaque-session, and restaurant authority channels in addition to its permitted operational channels. Raw JTI is never sent through Redis, client payloads, logs, or metrics.

Logout emits a session-targeted disconnect after commit. Password/security changes, revoke-all, role changes, suspension/removal, password reset, and deletion emit actor-targeted disconnects after commit. Restaurant-wide authority messages are supported for restaurant deactivation/reassignment flows. The configured broker transports the same internal `AuthorityRevocation` message in memory or through Redis Pub/Sub; production configuration now requires Redis so revocation reaches every worker. Multiple sockets for one session and multiple sessions for one actor close with code `1008`.

Current product policy treats global/individual operations locks and `open|closing|closed` operating status as write-policy restrictions, not identity termination. Those sockets remain connected to receive lock/status and later unlock/reopen events, while HTTP privileged writes return `403`. Periodic/event-boundary database revalidation is the missed-message and token-expiry backstop. Publication remains post-commit best effort rather than transactional outbox delivery; that durability gap remains P4.

### P1.6 integrated validation record

The database-backed backend suite, browser authority runtime, Flutter native persistence/generation suite, WebView authority runtime, debug Android compilation, and live TestClient WebSocket suite pass together. Covered cross-client invariants include complete-scope key separation, same numeric table isolation, A-to-B teardown ordering, epoch changes, late-response/stale-`401` rejection, reconnect cancellation, WebView workspace cleanup semantics, HTTP session enforcement, and live socket termination.

Closure evidence is still incomplete in this environment. No Android device/emulator is connected, so the actual platform WebView cookie/DOM storage plugin calls cannot be observed across a real process restart. `redis-cli` is unavailable, so the Redis message path is validated with two independent `RedisRealtimeBroker` instances against the faithful fake Redis server, not a real Redis service with separate application processes. Exact remaining commands are an Android integration test on an attached emulator/device and the authority-revocation suite with `REDIS_URL` pointing to a disposable Redis instance. Until both pass, Phase 1 remains partially completed and the overall readiness decision remains NO-GO.

## Scope propagation contract

| Location | Required namespace/validation |
|---|---|
| Backend query/mutation | Authenticated `restaurant_id`; actor and role from current DB row; conflicting client scope rejected |
| Browser query cache | `restaurant_id:actor_id:role:opaque_authority_epoch:feature:normalized_filters` |
| Flutter cache | Same scope; no global `tables_all`; purge scope on termination |
| Staff cart/draft | Tenant+actor+authority+table ID+intent key |
| Public cart/session | Restaurant ID/slug route validated to restaurant, table ID/code, session capability |
| Cookies/tokens | Host-only, Secure, HttpOnly where applicable, SameSite policy; token contains sub/restaurant/JTI/security version |
| WebView | Dedicated cookie/storage partition per authority or complete data clearing at termination |
| Realtime | Server-derived restaurant channel; current JTI/security version/role/locks checked |
| Restored routes | Reauthorize target under the new scope; otherwise role root |
| Analytics/export | Restaurant predicate plus explicit local UTC bounds and currency |

Slug MAY appear in a route or display label, but canonical records MUST carry restaurant ID. A client MUST discard a response/event whose restaurant or authority version does not match the active scope.

## Teardown state machine

`active → terminating → anonymous`; no `terminating → active` transition is allowed. Calls are idempotent and concurrent triggers join the same completion future.

1. Set `terminating`; mutation clients fail closed.
2. Close all sockets; set a permanent “do not reconnect” generation.
3. Cancel fetches, refreshes, timers, subscriptions, and background tasks.
4. Clear in-memory query/providers and scoped persistent cache.
5. Delete carts, drafts, idempotency drafts only when explicitly abandoned; retain unresolved intent keys in a quarantined scope for reconciliation.
6. Clear identity-bound routes, bfcache state, WebView cookies/DOM storage/cache, and service-worker user data.
7. Attempt backend session revocation; locally clear tokens/cookies regardless of network result.
8. Reset identity and navigate to login with history replacement.
9. Permit new authentication only after completion.

An authenticated browser `401` always terminates. P1.2 preserves the session for every `403`; authority-invalidating `403` codes and their teardown policy remain future work. Clients MUST use error codes, not message text, when that distinction is introduced.

## WebSocket contract

At handshake the server performs the same authority load as HTTP and binds canonical actor/restaurant/role/epoch plus an internal opaque session key to the connection. Redis-distributed revocation closes matching connections for session revoke, revoke-all, password/security version change, role/status/restaurant change, and restaurant deactivation. Event delivery and heartbeats revalidate against current database authority as a backstop.

Clients MUST cancel reconnect before clearing credentials. Reconnect obtains a new short-lived WS credential; it MUST NOT reuse a terminated access token. Channel authorization is server-generated from role; callers cannot subscribe by naming arbitrary privileged channels. Public channel payloads use an allowlist and capability status is rechecked.

## WebView and native download boundary

Authentication routes MUST never be rewritten to a remembered workspace. P1.4 implements this with the scope-bound `WebViewAuthorityRuntime`; native teardown or observed anonymous-auth navigation clears the remembered URL/workspace and WebView identity stores before returning to the native login root. A newly authenticated identity starts only after cleanup completes.

Native downloads MUST accept only HTTPS URLs on an explicit configured host/path allowlist, reject redirects outside it, sanitize filenames/MIME types, avoid forwarding auth cookies to external origins, use scoped storage, and show origin/size/type before opening. APK distribution MUST include integrity/signing verification and version provenance.
