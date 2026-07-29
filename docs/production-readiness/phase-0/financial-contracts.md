# Financial contracts

## Authoritative lifecycle

Standard order fulfillment, dining session, bill, Quick Sale, and payment transitions are defined in [state-machines.md](state-machines.md). The current contradiction is explicit: `confirm_quick_sale_payment` accepts `ready|served`, although kitchen supports `ready→served`; production MUST reject ready-only payment or use atomic `serve_and_record_payment`. `bill_requested` is currently emitted/displayed as a stage while the dining session stores `payment_requested`; it MUST remain a presentation event (`bill.generated/requested`) and never be an entity status.

## Payment authorization and confirmation

Only an active owner/admin in the bill’s restaurant MAY record cash/UPI counter payment. Before enabling confirmation, web and Flutter MUST refetch and display restaurant name/ID, table or Quick Sale context, bill/order identity, currency and exact total, selected method, signed-in actor, current status/version, resulting closure/completion, and “payment cannot be edited; use a future correction workflow.” The button MUST have an in-flight guard and stable idempotency key.

`record_payment` is one PostgreSQL transaction: lock session then bill; validate tenant, status, version, amount and method; insert a payment row unique on bill and key; set bill `paid`; record session `paid` and close it; resolve bill requests; append audit/history and outbox records; commit. Publication and push are asynchronous outbox delivery. A timeout is reconciled by replay/refetch, never by creating a new key.

The present schema stores payment fields on `Bill`, not an immutable payment ledger. Phase 2/3 MUST add the ledger before refunds/corrections. Until then, partial, split, over/under, refund, and edit-in-place payments MUST be rejected. Same-key duplicate returns the original success. Different-key duplicate returns `409 already_paid` with authoritative resource reference.

`issue_and_request_payment` MAY be a single transaction. Separate issue/handoff requests are allowed only if each is idempotent and the next request can resume from the committed state. `serve_and_record_payment` MAY atomically append `ready→served` and `served→completed` histories before payment completion.

## Snapshots and billable value

Order and Quick Sale lines MUST snapshot names, option selections, unit/option prices, quantity, tax rate/mode, discount and currency used. Current bill subtotal is:

`Σ snapshot line totals for orders in accepted|preparing|ready|served belonging to the session`

Pending value MAY be shown separately as provisional. Rejected/cancelled value is excluded. Issued bills are immutable; newly served orders after issue require explicit void/reissue or adjustment, not silent refresh.

## Named metrics

All amounts are grouped by restaurant and currency. Tax/service charge are included in the following “amount” metrics exactly as represented in the final total; component metrics SHOULD also be exposed.

| Metric | Definition/source | Excludes | Date |
|---|---|---|---|
| `gross_order_value` | Sum final snapshot totals of non-rejected/non-cancelled standard orders plus non-cancelled Quick Sales | rejected, cancelled | entity creation business date |
| `issued_amount` | Sum totals of bills in issued/payment_pending/paid plus completed Quick Sales represented as direct-sale receipts | draft, cancelled | bill issue/direct-sale completion date |
| `outstanding_amount` | Issued/payment-pending bill total minus successful payments/credits | draft, paid, cancelled | as-of instant; aged from issue date |
| `collected_revenue` | Sum successful immutable payments for bills and Quick Sales | unpaid value, failed/voided payments | payment completion business date |
| `refunded_amount` | Sum successful refund/credit records | attempted/failed refunds | refund business date |
| `cancelled_amount` | Snapshot value cancelled/rejected before collection; report rejected separately | fulfilled/paid | cancellation business date |
| `net_collected_revenue` | `collected_revenue - refunded_amount` | unpaid/issued value | payment/refund business date |

Reconciliation per restaurant/currency/as-of time:

`issued_amount = collected_revenue + outstanding_amount + voided_or_cancelled_after_issue_amount - refunded_amount` only when each term uses the same cohort and adjustments; dashboards MUST show any unreconciled difference. Operational funnel reconciliation is `gross_order_value = issued_or_completed_value + unissued_active_value + cancelled_or_rejected_value ± explicit_adjustments`.

The existing `services/revenue.py` correctly labels paid bills plus completed Quick Sales as collected, and dashboard uses local bounds. History/export code and client types still use generic “revenue” labels for item/category/table and day aggregates; each MUST be renamed/defined before release. Quick Sale completion currently acts as its payment record, which MUST migrate to the payment ledger.

## Business-date attribution

All payment/refund instants are UTC; reporting attributes them through `business_date(restaurant, instant)`. Order and bill numbers use the restaurant-local date at allocation. `services/bills.py` currently uses server `date.today()` for bill daily sequence while invoice calculation uses restaurant local time; this contradiction is release-blocking. Export inputs are half-open UTC ranges derived from local `[start_date 00:00, day_after_end 00:00)`.
