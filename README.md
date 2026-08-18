# Shop Cost Tracker — Phase 1 (Manual Core)

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

## What's deferred to Phase 2

AI bill-scanning (photograph a bill instead of typing it in) — see Section 9 of
[`docs/PRD_Inventory_Management_App.md`](docs/PRD_Inventory_Management_App.md). The data
model already carries a `source` field (`manual` vs `upload`) so this slots in later
without touching the cost engine or existing screens.
