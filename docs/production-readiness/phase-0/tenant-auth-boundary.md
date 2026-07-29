# Tenant and authentication boundary

## Current evidence and contradictions

Before P1.1, HTTP authority in `backend/app/utils/auth.py` checked staff/restaurant IDs, active status, security version, and only conditionally required an active JTI. `backend/app/routes/realtime.py` still checks only decoded IDs, active staff/restaurant, and role at connection; it does not validate JTI, security version, session, locks, or later revocation. Web query keys sometimes include slug (`frontend/lib/queryCache.ts`), while Flutter `OperationsDataCache` uses global keys such as `tables_all`. `tables_screen.dart` and `new_order_screen.dart` explicitly pass `table.tableNumber` to `CartNotifier.setTable(..., restaurantSlug)`. Flutter logout clears tokens but not that cache/cart or realtime as one atomic operation.

The Android WebView remembers that an authenticated workspace existed and prevents later navigation to an authentication route by loading the remembered role home (`src/omlu_webview_app.dart`, `navigation_policy.dart`). This can reverse explicit logout or authentication-failure navigation. Web logout clears the cookie even when backend logout fails, but no single coordinator clears query cache, component state, reconnects, DOM storage, and WebView state.

### P1.1 implementation record

Authenticated HTTP requests now resolve through `AuthenticatedContext` in `backend/app/utils/auth.py`. Its frozen `TenantScope` is derived only after the token signature/expiry, actor, database restaurant relationship, database role, security version, and active `StaffSession` JTI are validated. `authority_epoch` is the deterministic string `<security_version>:<active_session_jti>`. `get_tenant_scope` exposes the scope directly; existing routes remain compatible through `get_current_staff_user`, which returns the actor from the same cached FastAPI dependency context. Legacy JWTs without a matching active session now fail closed.

P1.1 does not scope client storage, perform account teardown, change WebView behavior, or change WebSocket authentication. Operations locks and restaurant `open|closing|closed` remain write-policy checks rather than identity fields; their redesign/revocation behavior remains P1.3/P1.5.

## Scope propagation contract

| Location | Required namespace/validation |
|---|---|
| Backend query/mutation | Authenticated `restaurant_id`; actor and role from current DB row; conflicting client scope rejected |
| Browser query cache | `restaurant_id:actor_id:authority_epoch:resource:parameters` |
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

`401` always terminates. `403` terminates only for authority-invalidating codes (password change, suspension/removal, revoked role/restaurant, lock policy); ordinary permission denial remains in-session. Clients MUST use error codes, not message text, to distinguish them.

## WebSocket contract

At handshake the server MUST perform the same authority load as HTTP and bind `{staff_id, restaurant_id, role, security_version, jti}` to the connection. A distributed revocation channel MUST close matching connections for session revoke, revoke-all, password/security version change, role/status/restaurant change, locks that terminate access, and restaurant deactivation. Heartbeats SHOULD revalidate at a bounded interval as a backstop.

Clients MUST cancel reconnect before clearing credentials. Reconnect obtains a new short-lived WS credential; it MUST NOT reuse a terminated access token. Channel authorization is server-generated from role; callers cannot subscribe by naming arbitrary privileged channels. Public channel payloads use an allowlist and capability status is rechecked.

## WebView and native download boundary

Authentication routes MUST never be rewritten to a remembered workspace. The shell MUST receive an explicit `auth.terminated` signal or observe login navigation, clear `_hasAuthenticatedWorkspace` and `_currentUri`, clear WebView identity stores, and replace history with `/login`. A newly authenticated identity starts a new partition.

Native downloads MUST accept only HTTPS URLs on an explicit configured host/path allowlist, reject redirects outside it, sanitize filenames/MIME types, avoid forwarding auth cookies to external origins, use scoped storage, and show origin/size/type before opening. APK distribution MUST include integrity/signing verification and version provenance.
