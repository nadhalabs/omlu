# OMLU

OMLU is a production-ready web application for restaurant QR-code menus, customer ordering, order tracking, service requests, and staff kitchen dashboards.

<!-- Project maintenance: 2026-08-11 -->

## Development Note
Keep production changes small, tested, and independently reviewable.

## Heimdal observability

The backend attaches the repository-local Heimdal Python SDK once during FastAPI
initialization. For local development, keep the Heimdal repository next to this
repository and install backend dependencies from `backend/`:

```bash
cd backend
pip install -r requirements.txt
```

This resolves `../../heimdal/sdk/python` as an editable dependency. Set
`HEIMDAL_DSN` to enable telemetry; missing or invalid configuration leaves the
backend operational with telemetry disabled. `HEIMDAL_RELEASE` should be a stable
deployment identifier. Render supplies it from `RENDER_GIT_COMMIT` in the start
command.

The SDK is not published, so a production build must make the sibling
`heimdal/sdk/python` path available with this layout (for example, from a parent
deployment repository). Render's current OMLU-only checkout cannot resolve that
path until its build context includes the SDK. Do not copy or vendor the SDK into
OMLU; publish it to a private package source or provide a combined deployment
checkout before enabling this dependency in production.

## Production
OMLU production runs from the main branch.

## Frontend
Production frontend: https://omlu.in

## Android
The Android operations app connects to the production OMLU API.
