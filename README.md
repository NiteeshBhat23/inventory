# ProfitPulse — Phase 1 (Manual Core)

A mobile-friendly web app for small vehicle/generator service centers to track purchase
cost, stock, margin, and sales — **entirely manual entry, no AI** (see [`docs/`](docs/)
for the full product plan and the Phase 2 AI bill-scan roadmap).

## Stack

- **Backend:** Python + FastAPI, Supabase Postgres, Supabase Auth (JWT)
- **Frontend:** React + Vite + TypeScript + Tailwind CSS, Recharts, installable PWA

## 1. Create your Supabase project (free, no card)

1. Go to [supabase.com](https://supabase.com) → New Project (free tier).
2. Once created, open **SQL Editor** → New query → paste the contents of
   [`backend/schema.sql`](backend/schema.sql) → Run. This creates the tables and
   row-level-security policies.
3. Under **Settings → API**, copy:
   - `Project URL` and `anon public key` → used by the frontend
   - `JWT Secret` → used by the backend to verify tokens
4. Under **Settings → Database → Connection string → URI**, copy the Postgres
   connection string (use the "Session" pooler if given a choice) → used by the backend.
5. Under **Authentication → Providers**, Email is enabled by default — that's all
   Phase 1 needs. (Optional: turn off "Confirm email" for faster local testing.)

## 2. Run the backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt
copy .env.example .env        # then fill in DATABASE_URL and SUPABASE_JWT_SECRET
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Run the unit tests any time with:

```bash
pytest
```

`--host 0.0.0.0` makes it reachable from your phone at `http://<your-laptop-LAN-IP>:8000`
(find your LAN IP with `ipconfig`, the Wi-Fi adapter's IPv4 address).

## 3. Run the frontend

```bash
cd frontend
npm install
copy .env.example .env.local  # then fill in VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_BASE_URL
npm run dev -- --host
```

Open `http://localhost:5173` on your laptop, or `http://<your-laptop-LAN-IP>:5173`
from your phone (same Wi-Fi). On first visit: **Create an account** → sign up with
email/password → set your shop name → you're in.

To install it as an app on your phone's home screen: open it in the phone's browser,
then use "Add to Home Screen" (Chrome/Safari share menu).

## Using it

1. **Add Purchase** — log what you bought: item, qty, unit price (or total price),
   supplier. New items are created inline; existing items are matched via search.
   Average cost and stock update automatically.
2. **Record Sale** — log what you sold/used on a job. Shows live cost/margin/profit
   before you confirm. A price below cost is blocked unless you explicitly override.
3. **Dashboard** — inventory value, revenue, profit, top items, category and supplier
   breakdowns, low-stock and below-cost alerts, recent activity — all at a glance.
4. **Inventory / Item Detail** — search, sort, per-item purchase history and price trend.
5. **Reports** — supplier spend, category profitability, CSV export of purchase/sale history.

## Deploying to Vercel (single project)

The backend and frontend deploy together as **one Vercel project**, rooted at this
`inventory/` directory:

- `vercel.json` builds the frontend (`frontend/dist`) as static output and rewrites
  `/api/*` requests to a Python serverless function.
- [`api/index.py`](api/index.py) imports the FastAPI `app` from `backend/app/main.py`
  and Vercel's Python runtime serves it as an ASGI function.
- Root [`requirements.txt`](requirements.txt) (mirrors `backend/requirements.txt`) is
  what Vercel's Python builder installs — keep them in sync if you change backend deps.
- All API routes are mounted under `/api` (e.g. `/api/items`, `/api/health`), so the
  whole app is served from a single domain with no CORS needed in production.

Steps:

1. In Vercel, **New Project** → import this repo → set the **Root Directory** to
   `inventory` (since this repo lives alongside sibling projects).
2. Add environment variables (Project Settings → Environment Variables):
   - `DATABASE_URL`, `SUPABASE_URL`, `CORS_ORIGINS` (backend — same values as
     `backend/.env`)
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (frontend)
   - `VITE_API_BASE_URL=/api` (relative — same origin, no separate backend URL)
3. Deploy. Vercel builds the frontend via `buildCommand` and deploys `api/index.py`
   as a serverless function automatically.

For local dev, keep running frontend and backend separately as described above —
`frontend/.env.local`'s `VITE_API_BASE_URL=http://localhost:8000/api` points at your
local `uvicorn` server (routes are prefixed with `/api` everywhere now, dev included).

## What's deferred to Phase 2

AI bill-scanning (photograph a bill instead of typing it in) — see Section 9 of
[`docs/PRD_Inventory_Management_App.md`](docs/PRD_Inventory_Management_App.md). The data
model already carries a `source` field (`manual` vs `upload`) so this slots in later
without touching the cost engine or existing screens.
