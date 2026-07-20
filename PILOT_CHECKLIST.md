# Restaurant Pilot Onboarding & Deployment Checklist

Use this checklist to verify and prepare the OMLU installation for a new restaurant pilot deployment.

## Phase 1: Pre-Deployment & Collection
- [ ] Collect restaurant name, physical address, and logo URL.
- [ ] Determine restaurant local business hour timezone (e.g. `Asia/Kolkata`) and default currency code (`INR`).
- [ ] Create restaurant owner account using the onboarding script.
- [ ] Record the generated owner credentials securely.
- [ ] Create kitchen staff accounts for daily operations.

## Phase 2: Menu Setup & Verification
- [ ] Upload menu categories and establish logical `display_order`.
- [ ] Upload menu items with Malayalam & English names/descriptions.
- [ ] Verify menu item prices against the restaurant's actual menu.
- [ ] Toggle item availability to confirm that unavailable items do not appear on the customer menu.
- [ ] Perform a mock menu update to confirm changes reflect instantly.

## Phase 3: Tables & QR Code Map
- [ ] Generate tables with correct numbers in the admin panel.
- [ ] Download dynamic QR codes (verify filenames include the restaurant slug and table number).
- [ ] Test table code regeneration: verify old QR codes return 404/invalid and new codes resolve correctly.
- [ ] Print QR code placards (ensure high contrast and clear scanning instructions).
- [ ] Affix placards to physical tables and verify placement match.

## Phase 4: Device Configuration & Infrastructure
- [ ] Configure kitchen tablet/device (ensure lock screen sleep is disabled, set screen timeout to "never").
- [ ] Set up staff requests dashboard on a waiter/runner device.
- [ ] Verify audio notifications are working on all staff dashboards (test sound alerts for orders and service requests).
- [ ] Test weak internet environment: verify app retries queries and displays cached states without throwing full crash screens.

## Phase 5: Reliability & End-to-End Drills
- [ ] Submit duplicate customer order (confirm idempotency key blocks double charge/order).
- [ ] Submit waiter, water, and bill service requests from customer tracking page:
  - [ ] Verify 2-minute request cooldown per table is enforced.
  - [ ] Verify waiter requests trigger the alert sound.
  - [ ] Verify waiters can mark requests as resolved.
- [ ] Check dashboard metrics: verify that today's order count, revenue (from served status transition timestamp only), and top products are computed correctly.
- [ ] Train restaurant staff (front of house, waiters, and kitchen).
- [ ] Test a rollback plan: prepare manual order slips in case of power or internet failure.
- [ ] Share support contact number and SLA guidelines with restaurant owners.

## Phase 6: Production Ops
- [ ] Verify automated database backup schedule is configured with the cloud provider (e.g. Railway daily PG backup).
- [ ] Perform a test database restore onto a restore-target DB to confirm backup integrity.
