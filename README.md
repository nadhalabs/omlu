# OMLU

OMLU is a production-ready web application for restaurant QR-code menus, customer ordering, order tracking, service requests, and staff kitchen dashboards.

## Quick Start (Local Setup)

### Local Backend Setup (FastAPI)

1. Navigate to the backend folder:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Set up the local PostgreSQL database and configure environment variables in `backend/.env` (see the Environment Variables section).
5. Run the database migrations using Alembic:
   ```bash
   alembic upgrade head
   ```
6. Start the development backend server:
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```

### Local Frontend Setup (Next.js)

1. Navigate to the frontend folder:
   ```bash
   cd frontend
   ```
2. Install npm packages:
   ```bash
   npm install
   ```
3. Set up environment variables in `frontend/.env.local` (see the Environment Variables section).
4. Run the development server:
   ```bash
   npm run dev -- --webpack
   ```

---

## Environment Variables

### Backend Environment Variables (`backend/.env`)

Create a `backend/.env` file:
```env
# Database connection string (PostgreSQL)
DATABASE_URL=postgresql://user:password@localhost/nadha_serve

# Allowed CORS origins (comma-separated, no trailing slashes, no wildcard * with credentials)
FRONTEND_URLS=http://localhost:3000,http://127.0.0.1:3000,https://serve.nadhalabs.com

# Public URLs for construction of table menu links (e.g. QR codes)
PUBLIC_FRONTEND_URL=http://localhost:3000

# Kitchen API Key (used for secure kitchen actions)
KITCHEN_API_KEY=replace-with-secure-random-kitchen-api-key

# JWT authentication secrets
JWT_SECRET_KEY=your-secure-random-32-character-secret-key-goes-here
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_MINUTES=480
```

### Frontend Environment Variables (`frontend/.env.local`)

Create a `frontend/.env.local` file:
```env
# Backend API URL for client-side API requests (or server-side fallback)
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000

# Server-only backend URL for proxy route handlers
BACKEND_API_BASE_URL=http://localhost:8000

# Server-only API key for the kitchen proxy
KITCHEN_API_KEY=replace-with-secure-random-kitchen-api-key
```

---

## Alembic Database Migrations

Always use Alembic to manage schemas. Do not write ad-hoc SQL modifications or rely on `create_all()`.

Apply migrations to current database:
```bash
alembic upgrade head
```

Roll back the last migration:
```bash
alembic downgrade -1
```

---

## Production Deployment

### Backend Production Setup (Railway / Heroku)

Ensure the database URL has a `pool_pre_ping=True` and handles `postgres://` to `postgresql://` normalization (automatically managed by `app/database.py`).

Production command:
```bash
alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
```

For multi-process or multi-instance realtime on Render, create a Render Key Value
instance and set the backend service environment variable:

```bash
REDIS_URL=<internal Redis URL from Render Key Value>
```

When `REDIS_URL` is present, FastAPI realtime events use Redis Pub/Sub. When it
is absent, the backend falls back to the in-memory broker for local development
and tests.

### Realtime, Push, and Operations Runbook

Customer realtime uses direct browser WebSockets to the FastAPI backend. In
production, set `REDIS_URL` so multiple Render workers or instances exchange
events through Redis Pub/Sub. Without Redis, websocket delivery is limited to the
single backend process that accepted the connection; customers still recover
missed state through PostgreSQL refetch and polling.

Optional customer push notifications require browser support, HTTPS, a service
worker, and VAPID keys:

```bash
VAPID_PUBLIC_KEY=<web-push public key>
VAPID_PRIVATE_KEY=<web-push private key>
VAPID_SUBJECT=mailto:ops@omlu.app
CUSTOMER_PUSH_TTL_SECONDS=43200
```

Frontend Vercel must expose the public key only through the backend config
endpoint; it should continue to set:

```bash
NEXT_PUBLIC_BACKEND_URL=https://omlu-api.onrender.com
```

Customers are prompted only after tapping **Notify me** on their active table
session. Push subscriptions are stored against the active public dining session
and are expired when the session closes. Lock-screen notifications intentionally
avoid sensitive details: they announce only order accepted, order ready, bill
issued, or payment received.

Realtime guardrails can be tuned with:

```bash
REALTIME_MAX_CONNECTIONS=5000
REALTIME_MAX_CONNECTIONS_PER_SESSION=20
REALTIME_MAX_CONNECTIONS_PER_IP=100
```

Operational checks:

```bash
GET /health
GET /health/database
GET /health/realtime
GET /health/ready
GET /metrics/realtime
```

Failure behavior:

- WebSocket disconnects: the frontend reconnects with backoff and continues
  polling every few seconds.
- Redis unavailable: HTTP writes continue, publish failures are logged and
  reflected in realtime metrics; customers recover on refetch/polling.
- Push unavailable or denied: realtime and polling remain authoritative.
- Push delivery failure: invalid endpoints are expired; transient failures are
  logged without failing the order, bill, payment, or session transaction.

Horizontal scaling verification:

1. Set `REDIS_URL` to Render Key Value internal Redis.
2. Run at least two FastAPI instances.
3. Open a customer session websocket through one instance.
4. Confirm an order/bill/payment update through another instance.
5. Verify `/metrics/realtime` shows publish/delivery activity and the customer
   page refetches the updated PostgreSQL state.

### Frontend Production Setup (Vercel / Next.js)

Compile and build the production bundle:
```bash
npm run build
```

Production launch:
```bash
npm start
```

---

## Database Backups & Recovery

> [!WARNING]
> Database backups must be separately configured with your hosting provider (e.g., Railway automated pg backups, AWS RDS snapshots). The commands below are for manual operation.

### Manual Backup (pg_dump)

Run this command to create a compressed custom-format archive:
```bash
pg_dump "$DATABASE_URL" \
  --format=custom \
  --file="nadha_serve_$(date +%Y-%m-%d).dump"
```

### Manual Restore (pg_restore)

1. Create a clean restore target database:
   ```bash
   createdb nadha_serve_restore
   ```
2. Restore the backup archive:
   ```bash
   pg_restore \
     --dbname=nadha_serve_restore \
     --clean \
     --if-exists \
     backup.dump
   ```

---

## Restaurant Onboarding CLI

To onboard a new restaurant with an owner account and initial table maps, run:
```bash
python -m app.onboard_restaurant \
  --name "Restaurant Name" \
  --slug restaurant-slug \
  --owner-name "Owner Name" \
  --owner-email owner@email.com \
  --tables 5
```
Password prompting is done securely and hidden. The credentials are shown once. The operation is fully transactional.

---

## Troubleshooting & Verification

- **CORS Errors**: Confirm that the exact frontend domain (including protocol and port, e.g., `https://serve.nadhalabs.com`) is added to the `FRONTEND_URLS` list in `backend/.env`.
- **JWT Expired**: Staff login sessions automatically expire. Clear browser cookies and log in again at `/staff/login`.
- **SWC Compiler Crash**: On macOS Darwin ARM64, the SWC compiler can crash during Next.js local builds. Always pass the `--webpack` flag to bypass it (`npm run dev -- --webpack`).
