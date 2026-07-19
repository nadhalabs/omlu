# Flutter operations button audit

| Screen | Role | Control | Allowed state | API/action | Success | Failure/loading | Realtime effect |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Login | All | Sign in | Logged out, valid fields | `POST /auth/staff/login` | Secure session and role home | Disabled while sending; inline error | Opens one role socket |
| Tables | Staff | Table card | Active table or new order context | Local navigation + `GET /staff/tables/{id}` | Latest session opens | Loading/error/retry state | Table/session/order/bill events refetch |
| New order | Staff | Add/remove item | Available item, open session | Local cart | Quantity updates | Unavailable items disabled | None until submit |
| Cart | Staff | Send order | Non-empty cart, open session | `POST /staff/tables/{id}/orders` with idempotency key | Cart clears after server response | Disabled while sending; preserves cart on failure | Order and table events |
| Requests | Staff | Resolve | Pending request | `PATCH /staff/service-requests/{id}/resolve` | Request removed after response | Duplicate taps blocked; retry error | Request resolution event |
| Session bill | Owner/Admin/Staff | Generate Bill | Active session with valid orders, no bill | `POST /staff/tables/{id}/bill` | Authoritative bill breakdown loads | Confirmation; disabled while sending | `bill.generated` |
| Session bill | Owner/Admin/Staff | Accept Full Payment | Draft/issued unpaid bill | Issue draft if needed, then `POST /staff/bills/{number}/confirm-counter-payment` | Paid receipt, session closed, table refresh | Cash/UPI confirmation sheet; one in-flight action; stale state refetch | Bill paid and session closed events |
| Kitchen board | Kitchen | Start Preparing | Received order | Kitchen status PATCH | Ticket moves after response | Per-ticket duplicate guard and error | Order status event |
| Kitchen board | Kitchen | Mark Ready | Preparing order | Kitchen status PATCH | Ticket moves after response | Per-ticket duplicate guard and error | Order status event |
| Owner/Admin table list | Owner/Admin | Occupied table | Active session only | Opens native session bill | Contextual bill details | Free table is non-interactive | Bill/session updates refetch |
| App bars | Authenticated | Refresh | Any loaded/error state | Authoritative REST refetch | Latest data replaces cache | Spinner/error state varies by screen | Complements WebSocket recovery |
| Navigation | Authenticated | Logout | Active login | Revoke session, clear secure token | Returns to login | Local token still clears if network fails | Socket disposed |

Cash and UPI are manual counter confirmations. Card, direct gateway, partial payment,
split payment and refunds have no visible Flutter controls. Financial actions never
show success before the backend response.
