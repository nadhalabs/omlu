# OMLU production pilot

## Roles

OMLU has exactly four backend roles:

| Role | Operational access |
| --- | --- |
| `owner` | Full restaurant, financial, staff, menu, table, settings, billing and audit access |
| `admin` | Daily operations, staff/menu administration, billing, payments and basic reports; cannot manage the owner |
| `staff` | Tables, orders, requests and session-specific billing; sends bills to Owner/Admin for payment |
| `kitchen` | Kitchen tickets and Received → Preparing → Ready transitions only |

The backend checks every protected endpoint. Flutter navigation is a convenience,
not the authorization boundary. Waiter and cashier demo users both use `staff`.

## First restaurant onboarding

Do not run the demo seed for a real restaurant. From `backend/`, run:

```bash
PYTHONPATH=. python -m app.onboard_restaurant
```

Enter the restaurant identity, contact details, currency, timezone, tax and service
charge, then use the owner setup pages to create tables, categories, items and staff.
Download each table QR from **Admin → Tables**, or print that page to produce a
restaurant- and table-labelled QR sheet. Verify one QR and complete the pilot drill
in `PILOT_CHECKLIST.md` before opening service.

## Android signing

Generate a private keystore locally:

```bash
keytool -genkeypair -v \
  -keystore android/app/omlu-release.jks \
  -alias omlu-release -keyalg RSA -keysize 4096 -validity 10000
cp android/key.properties.example android/key.properties
```

Put the keystore passwords, alias and relative store path in `android/key.properties`.
Both files are ignored by Git. Back them up in a password manager or secret vault;
losing the key prevents signing upgrades with the same Android identity.

Build from `mobile-app/omlu_operations/`:

```bash
flutter build apk --release \
  --dart-define=OMLU_FRONTEND_URL=https://restaurant.example \
  --dart-define=OMLU_BACKEND_URL=https://api.example \
  --dart-define=OMLU_ALLOWED_DOMAINS=restaurant.example,api.example
flutter build appbundle --release \
  --dart-define=OMLU_FRONTEND_URL=https://restaurant.example \
  --dart-define=OMLU_BACKEND_URL=https://api.example \
  --dart-define=OMLU_ALLOWED_DOMAINS=restaurant.example,api.example
```

## Render deployment

`render.yaml` installs the backend, runs `alembic upgrade head` as a pre-deploy
step, starts Uvicorn, provisions PostgreSQL and Redis, and checks `/ready`. Configure
the three synced values in Render: `FRONTEND_URL`, `PUBLIC_FRONTEND_URL`, and
`FRONTEND_URLS`. The demo seed is never executed automatically.

Production startup rejects short JWT secrets, localhost/wildcard CORS origins,
non-HTTPS public QR URLs, and a missing Redis URL when `REQUIRE_REDIS=true`.

Deploy the customer frontend to Vercel with `NEXT_PUBLIC_BACKEND_URL` and
`BACKEND_URL` set to the Render HTTPS API origin. Run `npm run build` before release.

## Flutter native-screen audit

Native today: login/session restore, role landing, owner dashboard/tables/requests/pending payments,
admin overview/tables/staff directory/pending payments, staff table grid/manual ordering/requests,
kitchen board, active-session bill breakdown, bill generation, and full Cash/UPI
counter confirmation by Owner/Admin. Staff generates and sends a bill to the counter,
then sees realtime pending/paid status. WebView is disabled by default and can be enabled explicitly
as a fallback. Full menu editing, settings, and historical reporting do not yet have
complete native Flutter screens.

## Operational limitations

- Full-balance counter Cash/UPI recording is restricted to Owner/Admin. Card, partial/multiple
  payments, discounts and split billing are intentionally outside V1.
- The generated QR administration page is print-friendly; there is no separate
  server-generated multi-table QR PDF.
- Uploaded image URLs must point at durable object storage; Render disk is ephemeral.
- Multi-instance realtime requires Redis. Clients recover through reconnect plus
  authoritative database refetch/polling.
