# System Design
## Phase 10 — Architecture

Technical answers for how this app is actually built and run, scoped to the real constraints: zero budget, no credit card, single small team. **Phase 1 (this build) has zero AI/external-API dependency** — that's deferred to Phase 2, see the note below.

---

## Architecture Flow — Phase 1 (this build)

```
Frontend (PWA — manual entry forms + dashboard/charts)

↓

API Layer (REST + Auth)

↓

Backend Services (Cost Engine, Item Search/Match, Analytics/Reporting)

↓

Database (Shop / Item / Purchase / Sale data)

↓

Scheduler (daily job: low-stock check, price trend precompute)

↓

Notifications (low-stock, below-cost alerts)
```

There is no vision API, no image handling, and no extraction step anywhere in Phase 1 — every purchase and sale is typed in directly through the manual-entry forms and lands straight in the Cost Engine. The **Analytics/Reporting service** is a Phase 1 addition (not in the original architecture): it aggregates `purchase_history`/`sale_records` into the dashboard's KPIs and charts (inventory value trend, top items, category/supplier breakdowns). It's read-heavy and cache-friendly — see Caching below.

## Architecture Flow — Phase 2 (future, additive)

```
Frontend (PWA)
   ↓
API Layer (REST + Auth)
   ↓
Backend Services (Cost Engine, Item Matching, Extraction Orchestrator ← NEW, Analytics/Reporting)
   ↓
Database (unchanged)
   ↓
External AI Vision API (Gemini — bill extraction only) ← NEW
   ↓
Scheduler / Notifications (unchanged)
```

**How Phase 2 slots in without a rewrite:** recording a purchase or sale gains a second entry path — uploading a photo — alongside the Phase 1 manual form. The upload path adds one new service, the **Extraction Orchestrator** (Gemini call, retry/backoff, discard-image-after-processing), whose only job is to pre-fill the same manual-entry form the owner would otherwise type into. Sale line items from an upload must match an *existing* item, never create a new one. The Cost Engine is untouched — it already computes weighted-average cost and per-line profit regardless of which path (`manual` vs `upload`) produced the row, since `source` was in the data model from day one (Section 8 of the PRD). No new architecture layer is needed beyond the Extraction Orchestrator itself.

**Why no Redis in this flow (unlike a typical reference architecture):** Redis solves problems this app doesn't have yet — session fan-out across many server instances, sub-second cache invalidation, high-QPS rate limiting. At low request volume with a single backend instance, in-process memory handles caching needs fine, and adds zero infra cost. Noted explicitly in the Caching section below rather than silently dropped.

---

## Authentication

- Shop owner signs up with email + password (or phone OTP if targeting low-literacy users who may not check email).
- Passwords hashed with bcrypt/argon2 — never stored plain.
- On login, backend issues a JWT (short-lived access token + longer-lived refresh token).
- Frontend stores the token and attaches it as a Bearer token on every API call.
- If using Supabase as the DB layer, Supabase Auth can be used directly (free tier, no card) instead of hand-rolling this — reduces build time.

## Authorization

- Every table (`items`, `purchase_history`, `sale_records`) is scoped by `shop_id`.
- Every API request resolves `shop_id` from the authenticated JWT — never trusts a `shop_id` passed in the request body/query.
- MVP has one role: **owner**. Data model already supports adding a **staff** role later (e.g., staff can record sales but not edit avg cost or delete items) without a schema rewrite — just add a `role` field to a future `users` table.
- If using Supabase Postgres, Row-Level Security (RLS) policies can enforce shop-level isolation at the database layer, not just the application layer — a good defense-in-depth step to add once past pure prototyping.

## Caching

- **Phase 1: no Redis, no external cache service.** In-process memory (a simple dict or `lru_cache` in the backend) is enough for:
  - Item name type-ahead/search lookups (rebuilt when an item is created/renamed/merged)
  - Shop-level settings (default margin %, thresholds) — read often, changed rarely
  - Dashboard aggregates (inventory value, category/supplier breakdowns) — recomputed on write (purchase/sale confirm) and served from cache on read, since the dashboard is opened far more often than data changes
- Cache invalidation is simple at this scale: on any item create/update/merge or purchase/sale confirm, clear that shop's cache entry.
- **Revisit trigger:** if this scales to thousands of shops or the backend runs multiple instances behind a load balancer, in-process cache breaks (each instance has its own copy) — that's the point to introduce Redis (e.g., Upstash's free tier, which is Redis-compatible and card-free to start).

## Scaling

- Phase 1 has no external API in the request path at all, so the only real load is the backend and database serving form submissions and dashboard reads — comfortably within a single free-tier instance for a small number of shops.
- Still worth designing statelessly from day one so scaling later is just "add more instances," not a rewrite:
  - No session state kept in backend memory — auth state lives in the JWT, not server memory
  - Backend doesn't assume it's the only instance (avoids in-process job scheduling conflicts — see Deployment)
- **Phase 2 note:** once bill-scan upload ships, the real bottleneck becomes the **shared Gemini free-tier quota** (1,500 requests/day across the whole app, not per shop). Mitigations planned for that phase: queue + retry-with-backoff on 429s; if usage approaches the daily cap, that's a strong, well-earned signal to move to a paid tier — a good problem, not a design flaw. None of this applies to Phase 1.

## Logging

- Structured (JSON) logs for: API requests, cost recalculation events, errors. (Phase 2 adds extraction attempts — success/failure, never image content.)
- Phase 2 requirement, noted here for continuity: never log the bill image or its raw base64 — consistent with the "don't retain images" requirement. Not applicable to Phase 1, which never touches an image.
- `purchase_history` already acts as a business-level audit trail (who changed what cost, when) — separate from technical logs, and more important to the business.
- MVP: rely on the hosting platform's built-in log viewer (Render/Railway/Fly all provide this on free tier) rather than standing up a separate logging service.

## Monitoring

- Track at minimum: API error rate, uptime, request volume. (Phase 2 adds extraction success rate and daily Gemini API quota usage vs. the 1,500/day ceiling.)
- Free-tier options with no card required:
  - UptimeRobot (free) for basic uptime/ping monitoring and downtime alerts
  - Hosting platform's built-in metrics dashboard for request counts/errors
- No need for a paid APM tool (Datadog, New Relic, etc.) at this scale — revisit once there's real production traffic and a budget.

## Deployment

- **Frontend:** PWA deployed as a static build to Vercel or Netlify free tier — no card required, auto-deploys from GitHub on push.
- **Backend:** Render, Railway, or Fly.io free tier for the API + backend services.
- **Database:** Supabase free-tier Postgres (if multi-device/remote access is needed from day one) or SQLite file colocated with the backend for the earliest pilot (simplest, but ties data to a single instance — fine only while there's one backend instance and no horizontal scaling).
- **CI/CD:** GitHub Actions free tier — auto-run tests and deploy on push to main.
- **Secrets:** JWT signing secret (and DB connection string, if using Supabase) stored as environment variables in the hosting platform's secret manager — never committed to the repo. Phase 1 needs no third-party API key at all; a Gemini API key is only introduced in Phase 2.
- **Scheduler:** a daily cron-style job (low-stock check, price-trend precompute) can run via the hosting platform's built-in cron (Render Cron Jobs, free tier) or a lightweight GitHub Actions scheduled workflow — no separate scheduler service needed at this scale.

---

**Deliverable:** Architecture Diagram (rendered above) + this system design writeup, covering authentication, authorization, caching, scaling, logging, monitoring, and deployment for the MVP.
