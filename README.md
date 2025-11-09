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
- Trades (risk/reward/R metrics; finalize with exit; setup mode)
- Transactions (deposits/withdrawals)
- Analytics
	- Equity curve (realized PnL + cash flows) in user base currency
	- Daily PnL calendar heatmap
- Tags (CRUD + merge)
- CSV export (trades, transactions)
- Attachments (file upload per trade)
- Settings (base currency, favorite account)

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
