# Farm2Fork

Farm2Fork connects Indian farmers and buyers directly with transparent listings, market intelligence, order workflows, and smarter delivery planning.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `bash backend/run.sh` — run the FastAPI backend (port 8000)
- `PORT=5000 BASE_PATH=/ pnpm --filter @workspace/farm2fork run dev` — run the React frontend
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- FastAPI env: `BACKEND_HOST`, `BACKEND_PORT`, and `FRONTEND_ORIGINS` (see `backend/.env.example`)
- Existing API env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- FastAPI + Uvicorn, Python 3.11
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `backend/app/main.py` — FastAPI application entry point.
- `backend/app/routes/health.py` — initial `GET /health` endpoint.
- `artifacts/farm2fork/src/pages/farm-pages.tsx` — public landing, role workspaces, listings, ordering, insights, logistics, and admin views.
- `artifacts/farm2fork/src/components/farm-shell.tsx` — responsive workspace navigation and role switching.
- `artifacts/api-server/src/routes/farm.ts` — demo marketplace API with validated listing, order, insight, dashboard, and logistics endpoints.
- `lib/api-spec/openapi.yaml` — source of truth for the generated API client and Zod schemas.

## Architecture decisions

- The FastAPI service runs independently from the React frontend on port 8000.
- CORS origins are configured with `FRONTEND_ORIGINS`; no frontend source files are changed by the FastAPI setup.
- The first build uses realistic in-memory demo data so the SIH flow works without blocking on database provisioning.
- The frontend consumes generated API hooks and invalidates affected queries after mutations.
- Role switching and profile onboarding are intentionally demo-mode, ready to be replaced by managed identity when the backend is connected.

## Product

- Public landing page with farmer/buyer entry points.
- Farmer crop listing flow and listing management.
- Buyer marketplace, crop details, and order placement.
- Order status progression, market insights, logistics planning, and impact/admin views.
- English/Hindi-ready controls and mobile-first layouts.

## User preferences

No project-specific preferences recorded.

## Gotchas

- Frontend Vite requires `PORT` and `BASE_PATH`; use the managed frontend workflow for runtime verification.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
