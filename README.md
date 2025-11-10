# Aether Terminal

Full-stack trading journal & analytics terminal: accounts, multi-asset fills-first trades, automated fees, equity curve, calendar heatmap, strategies, tags, CSV export, attachments, and currency conversion.

> Deployment note (trigger): This README bump ensures the latest backend image & schema (no obsolete `setupRef`) redeploys. No functional changes.

# Aether Terminal

Full-stack trading journal & analytics terminal: accounts, multi-asset fills-first trades, automated fees, equity curve, calendar heatmap, strategies, tags, CSV export, attachments, and currency conversion.

## Monorepo Structure
- `backend` Node + Express + Prisma (Postgres)
- `frontend` React + Vite (TypeScript)
- `shared` Shared math utils (risk/reward)

## Prerequisites
- Node 20+
- Docker (for Postgres) or a local Postgres URL

## Environment
Copy `.env.example` to `.env` at the repo root and fill values:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/stonkjournal
JWT_SECRET=dev_secret_change_me
PORT=4000
```

## Run the stack
Terminal A (database):
```bash
docker compose up -d db
```

Terminal B (backend):
```bash
cd backend
npm install
npx prisma migrate dev --name init
npm run dev
# Backend on http://localhost:4000
```

Terminal C (frontend):
```bash
cd frontend
npm install
npm run dev
# Frontend on http://localhost:5173
```

If you change the Prisma schema:
```bash
cd backend
npx prisma generate
npx prisma migrate dev --name some_change
```

## Features at a glance
- Auth (register/login via JWT)
- Accounts (multi-currency)
- Trades (fills-first, risk/reward/R metrics; finalize with exit)
- Transactions (deposits/withdrawals)
- Analytics
	- Equity curve (realized PnL + cash flows) in user base currency
	- Daily PnL calendar heatmap
- Tags (CRUD + merge)
- CSV export (trades, transactions)
- Attachments (file upload per trade)
- Settings (base currency, favorite account)

## System overview and architecture
- Backend: Node.js + Express + Prisma (PostgreSQL)
- Frontend: React + TypeScript + Vite
- Shared math utilities in `shared/`
- Auth: JWT-based; backend middleware `requireAuth` protects routes
- Files: attachments stored via backend (local upload path by default)

### Domain models (Prisma)
- User, Account, Trade, TradeFill, Transaction, Tag, TradeTag, Strategy, StrategyTag, Attachment
- Fee models:
	- AccountFee: per-asset-class fee rules (mode/value)
	- TickerFee: per-ticker override (mode/value) with unique `(accountId, symbol)`

### Fee model & precedence
Fees are applied as round-trip costs where appropriate and are used in PnL calculations and exports.

Order of precedence when determining fees for a trade:
1) TickerFee override (per-symbol) if defined → mode in { PER_CONTRACT_DOLLAR, PER_CONTRACT_PERCENT }
2) Futures defaults on Account (round-trip per contract):
	 - `defaultFeePerMicroContract` if symbol is a micro (heuristic: starts with `M` and is a futures symbol)
	 - `defaultFeePerMiniContract` otherwise for futures
3) AccountFee matrix by assetClass (fallback) if provided
4) For Topstep CSV import only, if none of the above exist, fall back to CSV `Fees + Commissions`

Notes:
- Futures defaults are interpreted as ROUND-TRIP per realized contract. For open trades (no exit), fee accrual is deferred.
- Per-ticker overrides take precedence over all defaults and matrix rules.

### Futures PnL computation
Centralized in `backend/src/utils/pnl.ts`:
- Point value multipliers:
	- MES 5, ES 50, MNQ 2, NQ 20, MYM 0.5, YM 5, M2K 5, RTY 50, MET 0.1
- Formula: `gross = dir * (exit - entry) * qty * pointValue`; `pnl = gross - fees`
- Used consistently across: trade list, single trade views, analytics summaries, equity curve, calendar heatmap, and CSV export.

### Fills-first trade model
- On Topstep import, we create TradeFill rows for ENTRY (and EXIT if present). Metrics prefer fills when present.
- If a trade lacks fills, legacy fields remain as fallback.

## CSV import & export

### Generic CSV import
- Route: `POST /csv/trades/import` (multipart: `file`, `accountId`)
- Upserts by id when provided; otherwise creates trades.

### Topstep CSV import
- Route: `POST /csv/topstep/import?explain=true` (multipart: `file`, `accountId`, optional `explain=true`)
- Column mapping: `Id, ContractName, EnteredAt, ExitedAt, EntryPrice, ExitPrice, Size, Type, Fees, Commissions`
- Date parsing handles `MM/DD/YYYY HH:mm:ss ±HH:MM` (timezone offset preserved)
- Symbol normalization: Topstep contract (e.g., `MESZ5`) → Yahoo `.CME` format (e.g., `MESZ25.CME`) using entry date to resolve two-digit year
- Asset class set to FUTURE, direction derived from `Type` (LONG/SHORT)
- Fills created: ENTRY always; EXIT when present
- Fee handling:
	- Prefer account futures defaults (round-trip per realized contracts)
	- Else fallback to CSV `Fees + Commissions`

#### Duplicate prevention and manual trade protection
- Stable ID: `topstep_<accountId>_<TopstepId>`; if `Id` missing, a hash of key fields is used
- Only-new import: skip if ID already exists
- Manual trade dedupe to avoid duplicating manually entered trades:
	- Exact-second window (±5s): match same account, symbol, size, entryPrice, and direction → skip with reason `manual_match_exact`
	- Minute-level window (ignore seconds): same account, symbol, entryPrice within tolerance and direction → skip with reason `manual_match_minute`
- Explain diagnostics: if `explain=true`, response includes per-row skip reasons
- UTF-8 BOM stripping on header to avoid misreading `Id`

### CSV export
- Trades: `GET /csv/trades` (uses `computeDirectionalPnl` for PnL column)
- Transactions: `GET /csv/transactions`
- Account bundle: `GET /csv/account-bundle?accountId=...` → zip of trades, transactions, and fees
- Full user backup: `GET /csv/backup` → zip of accounts, trades, transactions, tags, settings, account fees

## API surface (selected)

Authentication
- `POST /auth/register`, `POST /auth/login`

Accounts
- `GET /accounts`, `POST /accounts`, `GET /accounts/:id`, `PATCH /accounts/:id`, `DELETE /accounts/:id`
- Per-asset-class fees: `GET /accounts/:id/fees`, `PUT /accounts/:id/fees`
- Per-ticker fee overrides: `GET /accounts/:id/ticker-fees`, `PUT /accounts/:id/ticker-fees`

Trades & fills
- `GET /trades`, `POST /trades`, `PATCH /trades/:id`, `DELETE /trades/:id`
- Fills created on import; additional fills endpoints may be added as needed

Transactions
- `GET /transactions`, `POST /transactions`, `DELETE /transactions/:id`

Analytics
- `GET /analytics/summary`, `GET /analytics/equity`, `GET /analytics/calendar`

CSV
- `GET /csv/trades`, `GET /csv/transactions`, `POST /csv/trades/import`
- `POST /csv/topstep/import?explain=true`, `POST /csv/transactions/import`
- `GET /csv/account-bundle`, `GET /csv/backup`

Attachments
- `POST /attachments` (multipart), `GET /attachments/:id`, linked to trades

Settings & Tags
- `GET/PUT /settings`
- `GET/POST /tags`, `PUT /tags/:id`, `DELETE /tags/:id`, `POST /tags/merge`

## Frontend structure
- `src/App.tsx`, `src/router.tsx`: routing and layout
- Pages: Dashboard (summary, equity, calendar), Trades (create/update, list), Accounts (fees, transactions), Settings, Tags
- Components: analytics charts, equity curve, calendar heatmap, symbol autocomplete, modal containers, export buttons, placeholders while loading
- Account Settings includes:
	- Export CSVs (trades, transactions, account bundle)
	- Import CSVs (trades, Topstep with explain, transactions)
	- Edit fees (mini/micro defaults, per-asset-class matrix, per-ticker overrides)
	- Manage transactions with `datetime-local` input

## Data deletion/cascade
Account delete flow runs inside a transaction in dependency order to avoid FK errors:
1. Trade fills and attachments
2. Trade tags
3. Trades
4. Transactions
5. Account fees
6. Account

## Recreate-this-app contract (for AI/codegen)
Core invariants:
- Trades have direction, entry/exit price/time, size, and optional fills. PnL must use `futuresPointValue` mapping and subtract fees.
- Fee precedence: TickerFee → futures mini/micro defaults (round-trip) → AccountFee by assetClass → CSV fees+commissions (Topstep import only).
- Topstep import must normalize symbols to Yahoo `.CME`, dedupe by ID or key hash, protect manual trades (exact±5s and minute-level), and optionally explain skips.
- Equity curve combines realized trade PnL and transactions, converting values to user base currency when applicable.
- Calendar aggregates daily realized PnL and cash flows.

Minimal environment to run:
- Node 20+, Postgres, Prisma migrations applied, `.env` with `DATABASE_URL`, `JWT_SECRET`, and frontend `VITE_API_BASE_URL`.

## Legacy / deprecated / removed
- Setup Mode: removed via migrations `20251109082505_remove_setup_mode` and `20251109082631_remove_setup_mode`.
- Checklist feature: removed via migration `20251109140000_remove_checklist`.
- Old PnL logic (naive entry/exit diff without point value multipliers) replaced by `computeDirectionalPnl` everywhere.
- Import behavior: previously updated existing trades; now Topstep import is “only-new” (skip existing by ID or hash) and uses fills.
- Direct reliance on CSV fees for futures replaced by round-trip per-contract defaults (with per-ticker override now available). CSV fees used only as fallback.

## Build & deploy
See free-tier guide below for Vercel (frontend) + container host (backend). Ensure backend start command runs migrations before serving:
`npx prisma migrate deploy && node dist/index.js`

## Troubleshooting (additional)
- UTF-8 BOM in CSV headers: parser strips BOM to ensure `Id` is recognized for Topstep import.
- Minute-level duplicate skip: manual trades with minute-only precision won’t be duplicated by Topstep import.


## API Highlights
- Auth: `POST /auth/register`, `POST /auth/login`
- Health: `GET /health`
- Accounts: `GET/POST /accounts`
- Trades: `GET/POST /trades`, `PUT /trades/:id/exit`
- Transactions: `GET/POST /transactions`
- Tags: `GET/POST /tags`, `PUT /tags/:id`, `DELETE /tags/:id`, `POST /tags/merge`
- Analytics: `GET /analytics/summary`, `GET /analytics/equity`, `GET /analytics/calendar`
- CSV: `GET /csv/trades`, `GET /csv/transactions`
- Attachments: `POST /attachments` (multipart form: file, tradeId)
- Settings: `GET/PUT /settings`

Most endpoints require the `Authorization: Bearer <token>` header after login.

## Frontend Pages
- Dashboard: summary, equity curve, calendar, export CSV
- Trades: create trade (with draft persistence, setup mode)
- Trades List: enriched table with PnL, R, hold time, finalize, and upload attachment
- Accounts: list + create, transactions (deposit/withdraw)
- Tags: CRUD and merge
- Settings: base currency and favorite account
- Auth: register/login

## Styling
Glassmorphism UI with a multi-layer gradient background. Global styles are imported in `frontend/src/main.tsx`. Branding renamed from StonkJournal to Aether Terminal; database name left unchanged for continuity.

## Troubleshooting
- Backend dev server won’t start (exit code 2): Often a previous watcher is still running or an env var is missing. Kill lingering node processes or restart the terminal. Ensure `.env` has `DATABASE_URL` and `JWT_SECRET`.
- CSS not visible: Ensure `import './styles.css'` exists in `frontend/src/main.tsx`; hard refresh the browser.
- CORS: Backend enables CORS by default. If you change ports/hosts, update the frontend `useApi` base URL.
- Database not ready: Check Docker is running, and the container: `docker compose ps`. Re-run migration after DB starts.

## Math: Risk / Reward
```
risk = |entry - stop| * size
reward = |target - entry| * size
R = reward / risk
```

## View screen: fills-first model
- The Journal View and charts are now fills-aware:
	- Metrics (avg entry, avg exit, realized PnL, hold time) are derived from Trade Fills when present.
	- Charts center the time range from first ENTRY to last EXIT and draw price lines for avg Entry, Stop, and Target.
	- Execution markers are plotted for each fill: green up-arrow for long entries, red down-arrow for short entries, and yellow markers for exits, including qty and price.
- If a trade lacks fills, legacy fields are displayed as a fallback.

## Roadmap
- Better auth flows (refresh, password reset)
- Rich attachments viewer and per-trade gallery
- More analytics (per-tag breakdown, rolling metrics, filters)
- Robust currency feeds/seed data and backfill tools
- E2E tests and seed script
# aether-v2

## Free Tier Deployment Guide (Frontend on Vercel + Free Backend Stack)

Below are two practical free backend approaches that pair well with the Vercel-hosted frontend. In both cases, set `VITE_API_BASE_URL` in Vercel project settings so the React app calls the live API.

### Option A (Least Refactor): Container Host + Managed Postgres
Use a free container host (Koyeb / Railway / Fly.io) to run the existing `backend` Docker image and a free managed/serverless Postgres (Neon, Supabase, or Railway Postgres). This preserves current Express + file upload code (though long-term move uploads to object storage):

1. Provision Postgres (Neon or Supabase). Copy the connection string into `DATABASE_URL` (ensure `?schema=public`).
2. On container host, create a service from `backend/` directory (Dockerfile build) or build & push to a registry first.
3. Set env vars: `DATABASE_URL`, `JWT_SECRET`, `PORT=4000`.
4. Ensure start command runs migrations once before serving traffic, e.g. change Docker CMD to: `sh -c "npx prisma migrate deploy && node dist/index.js"` (production build required).
5. Expose port 4000 → get public URL (e.g. `https://aether-backend.fly.dev`).
6. In Vercel Project (frontend), add `VITE_API_BASE_URL=https://aether-backend.fly.dev`.
7. Redeploy frontend; open browser dev tools and verify API calls hit the backend host.

Pros: minimal code changes. Cons: cold start depends on host; free tiers may sleep.

### Option B (More “Serverless”): Supabase for DB + Storage + Auth (Partial Migration)
If you later migrate auth/files:
1. Keep custom Express API for domain logic but move file uploads to Supabase Storage (S3-like) and optionally replace JWT auth with Supabase Auth tokens.
2. Replace local `/uploads` static serving with signed URLs from Storage.
3. Benefit: Durable storage + less need for your own file infrastructure.

### Not Recommended Early: Full Serverless Refactor on Vercel
Would require splitting Express routes into Vercel Functions, moving file storage out, and handling prisma migrations externally.

### Environment Variables Summary
Frontend (Vercel settings):
```
VITE_API_BASE_URL=https://YOUR_BACKEND_HOST
```
Backend (Container host):
```
DATABASE_URL=postgresql://<user>:<pass>@<host>:<port>/<db>?schema=public
JWT_SECRET=generate_a_long_random_value
PORT=4000
```

### Production Backend Dockerfile (Example)
Create `backend/Dockerfile.prod`:
```
FROM node:20 AS build
WORKDIR /app
COPY package*.json tsconfig.json prisma ./
RUN npm ci && npx prisma generate
COPY src ./src
RUN npm run build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY prisma ./prisma
EXPOSE 4000
CMD ["sh","-c","npx prisma migrate deploy && node dist/index.js"]
```
Then build & push: `docker build -f backend/Dockerfile.prod -t yourrepo/aether-backend:latest backend`.

### Simple GitHub Action (Build & Push Backend Image)
```
name: backend-image
on: [push]
jobs:
	build:
		runs-on: ubuntu-latest
		steps:
			- uses: actions/checkout@v4
			- uses: docker/setup-buildx-action@v3
			- uses: docker/login-action@v3
				with:
					registry: docker.io
					username: ${{ secrets.DOCKER_USER }}
					password: ${{ secrets.DOCKER_PASS }}
			- name: Build & push
				run: |
					docker build -f backend/Dockerfile.prod -t docker.io/${{ secrets.DOCKER_USER }}/aether-backend:latest backend
					docker push docker.io/${{ secrets.DOCKER_USER }}/aether-backend:latest
```
Deploy host (Koyeb/Railway/Fly) pulls updated image automatically or via webhook.

### Verifying Deployment
1. Hit `/health` on backend URL → expect `{"status":"ok"}`.
2. Register a user via `/auth/register` POST.
3. Login → copy JWT; test an authenticated endpoint with `Authorization: Bearer <token>`.
4. Use frontend; check network tab for `VITE_API_BASE_URL` origin, no CORS errors, 200 responses.

### Next Upgrades
- Move attachments to object storage (S3/R2) and store only object keys in DB.
- Add monitoring (health pings) to keep free tier containers warm.
- Add a dedicated migration job in CI (avoid running migrations on every cold start).

# aether-v2
