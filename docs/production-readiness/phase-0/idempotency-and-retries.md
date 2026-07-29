# Idempotency and retries

Server contract: require `Idempotency-Key` header (body compatibility must be removed), bind `{restaurant_id, actor_id/capability_id, operation, key, request_hash}`, and persist status/result/resource until at least 24 hours after terminal success (financial/audit keys: seven years or the accounting retention period). In-progress duplicate waits or returns `409 request_in_progress` with retry guidance. A committed result replays the original HTTP status and canonical response.

| Mutation | Current key source | Current persistence | Required key source | Required persistence | Replay result / rotation | Current defect |
|---|---|---|---|---|---|---|
| Customer order create | Menu component random state/header | Memory only | Draft creation | Scoped durable draft | Original order; rotate after verified success/abandon | bfcache/success reuse and transient cleanup |
| Staff-assisted order | Web helper creates Date.now/random per call; Flutter cart key | Web none; Flutter memory | Order draft | Scoped durable draft | Original order; rotate on success/abandon | Web retry instability; Flutter scope corrupted by table number |
| Quick Sale create | Admin UI-generated key/body | Component memory, rotated around submissions | Draft creation | Tenant+actor durable draft | Original sale; rotate after verified success | Timeout/reload rotation |
| Late-entry Quick Sale | Same as Quick Sale | Component memory | Historical-entry draft | Durable until reconciled | Original completed sale | Duplicate financial risk |
| Quick Sale payment | None | None | Payment review open | Durable financial intent | Original payment/completion | No key; ready payment accepted |
| Service request | None | None | Request button intent | Session/type durable pending intent | Existing pending request | Race on first insert |
| Bill create/request | None | DB one bill/session partly helps | Request intent | Capability/session operation record | Current bill/request | Duplicate events/stages |
| Bill issue | None | State only | Issue review | Tenant+bill durable | Issued bill | Ambiguous timeout |
| Payment request/handoff | None | State/audit partly dedupes | Handoff review | Tenant+bill durable | Current pending bill | Sequential partial/event ambiguity |
| Payment record | None | Paid state only | Confirmation dialog | Financial durable ledger | Original receipt | Concurrent/different-method ambiguity |
| Registration | None | None | Registration draft | Email/slug-scoped resumable record | Original account/result | Partial success, unsafe retry |
| Menu option group creation | None | None | Editor draft | Tenant+actor durable | Complete group/options/links | Multi-commit partial group |
| Table creation | None | None | Create dialog | Tenant+actor durable | Existing created table | Check-then-insert race |
| Staff lock/status/role | None | State only | Confirmation dialog | Tenant+target+operation | Current version/result | Duplicate/self-mutation teardown gaps |
| Revoke session(s) | None | Session state | Confirmation intent | Actor+target operation | Revocation summary | Duplicate events acceptable only if replayed |
| Close session | None | State only | Close confirmation | Session durable | Closed session/result | Auto-rejection history may repeat/miss |

## Client behavior

Clients MUST persist unresolved keys before sending. Timeout before commit and timeout after commit use the same key. On restart, an unresolved intent is reconciled by replay or resource lookup. A different key is used only for an explicitly new intent. UI in-flight guards prevent accidental taps but are not the correctness boundary.

Public cart/session state MUST NOT be deleted on a transient network/5xx/ambiguous response. It is cleared only for authoritative invalid capability/session, explicit abandonment, or reconciled success. After success, bfcache/pageshow MUST create a fresh empty draft and key before another submission. Account termination quarantines unresolved keys under the old scope and never submits them under the new identity.

## Atomicity classification

| Workflow | Required class | Commit/failure/resume |
|---|---|---|
| Order/Quick Sale creation | Single transaction | Entity, lines, sequence, history, idempotency, outbox commit together; replay |
| Bill request/generate | Single transaction | Session stage, bill snapshot, key, audit/outbox together |
| Issue and send | Single transaction or two idempotent resumable actions | No untracked partial success; state tells exact resume step |
| Record payment / serve-and-pay | Single transaction | Locks, ledger, entity states, requests, audit/outbox together |
| Session close | Single transaction | Order disposition/history, requests, bill/session, outbox together |
| Registration | Idempotent resumable workflow | Durable workflow row; compensate or resume restaurant/user/session creation |
| Option group create | Single transaction | Group/options/links together |
| Realtime/push delivery | Explicitly asynchronous resumable | Transactional outbox; retries/deduplication |
| Analytics export | Read-only snapshot job | Repeatable snapshot/version; failure produces no partial downloadable artifact |

Direct sequential financial calls without stable keys and authoritative resume state are prohibited.
