# Product Requirements Document
## Smart Inventory & Cost Management App for Vehicle/Generator Service Centers

**Version:** 2.0 (Phased Build Plan)
**Owner:** [Your Name]
**Status:** Draft for build

---

## 0. Phased Roadmap

This app is built in two phases. Phase 1 ships a complete, useful product with **zero AI dependency** — everything is entered manually, which also means zero external API cost, zero rate-limit risk, and zero "the vision model misread my handwriting" support burden. Phase 2 layers AI bill-scanning on top of the same data model as a convenience feature, once the manual flow is validated with a real shop.

| | Phase 1 — Manual Core (this build) | Phase 2 — AI Bill Scan (future) |
|---|---|---|
| Data entry | Owner types purchase/sale details into a form | Owner photographs a bill; AI pre-fills the form |
| Dependencies | None external — fully self-contained | Gemini Vision API (free tier) |
| Why first | Proves the cost-tracking logic and UX with the least moving parts; nothing to debug but the app itself | Adds convenience once the core loop (avg cost, margin, alerts) is trusted |
| Data model impact | None — `purchase_history`/`sale_records` already carry a `source` field (`manual` vs `upload`), so Phase 2 is additive, not a rewrite | Reuses Phase 1 tables and cost engine unchanged |

Everything below describes the full product; sections and requirements are tagged **[Phase 1]** or **[Phase 2]** so scope is unambiguous.

## 1. Problem Statement

Small service centers (2-wheeler, 4-wheeler, and petrol generator repair shops) buy spare parts from multiple suppliers at inconsistent prices over time. Owners have no systematic way to know:

- What a part *actually* costs them on average (across multiple purchases at different prices)
- Whether the price they charge a customer results in profit or loss
- How purchase prices are trending per item/supplier

They currently rely on memory or paper bills, which do not scale and lead to silent margin erosion (undercharging) or lost customers (overcharging).

## 2. Product Vision

A mobile-first web app where a shop owner **manually logs** each purchase (item, qty, unit price, supplier) in a fast, few-taps form. The app maintains a running **weighted-average cost** per item, updates stock quantity in real time, and tells the owner what price to charge to hit their target margin — flagging any sale that would happen below cost. A rich, chart-driven dashboard turns that structured data into decisions at a glance: where money is going, which items are most profitable, and which suppliers are getting more expensive over time.

In Phase 2, photographing a bill becomes an optional shortcut that pre-fills the same manual form via an AI vision model — the manual path always remains available as the fallback/override, and no bill images are ever stored, then or now.

## 3. Target Users

**Primary persona: Shop Owner / Manager**
- Runs a 2W/4W/generator service center
- Buys spare parts irregularly (not daily) from 2-5 regular suppliers
- Low to medium tech comfort; expects a simple, mobile app, not a desktop ERP
- Cares about: "Am I making money on this part?" and "What should I charge?"

**Secondary persona: Counter staff / Mechanic** (optional, later phase)
- Bills customers at time of service
- Needs to know the selling price is not below cost

## 4. Goals & Non-Goals

### Goals (Phase 1 — Manual Core)
- Fast, mobile-friendly manual entry form for purchases (item, qty, unit price, supplier, date)
- Maintain weighted-average purchase cost per item automatically
- Maintain current stock quantity per item, with full audit trail
- Suggest selling price based on cost + target margin
- Warn (and, for manual sales, block-with-override) when a selling price is below current average cost
- Fast manual sale/usage entry that decrements stock and computes per-line profit live
- Rich analytics dashboard: inventory value, margin health, top items, supplier spend, trends — not just a form-filling app
- Low-stock and below-cost alerting, visible on the dashboard and as badges
- Mobile-first responsive UI (works one-handed on a phone at the counter), installable as a PWA

### Goals (Phase 2 — deferred)
- Extract purchase/sale bill data from a photo (handwritten or printed) via AI vision, pre-filling the same manual form
- Confirm/correct extracted data before it commits (the review screen reuses the Phase 1 manual form as its editable UI)

### Non-Goals (explicitly out of scope for now)
- AI/vision bill extraction — **Phase 1 has none; this is the entire content of Phase 2**
- Multi-branch / multi-location support
- Full accounting / GST filing / invoicing compliance
- Customer relationship management (CRM)
- Barcode scanning
- Payroll, labor scheduling, appointment booking
- Offline-first / no-internet operation
- Android/iOS native apps (mobile-responsive web app / PWA covers this need without app-store friction)

## 5. Core User Flows

### Flow A — Recording a Purchase (Manual Entry) **[Phase 1]**
1. Owner taps "Add Purchase" → opens a manual entry form
2. Owner picks an item from a searchable/type-ahead list of existing items, or creates a new item inline if it doesn't exist yet
3. Owner enters: quantity, unit price (or total price — app derives the other), supplier (optional, remembers last-used suppliers as quick-pick chips), date (defaults to today)
4. Owner can add multiple line items to the same purchase batch before submitting (one supplier visit often covers several parts)
5. Live preview shows what the new average cost will become per line, before confirming
6. On confirm, for each row:
   - Update `avg_cost` using the weighted average formula
   - Increment `stock_qty`
   - Log entry in `purchase_history` with `source = "manual"`
7. Confirmation summary shown: "5 items updated, 2 new items added"

### Flow A′ — Recording a Purchase (Bill Upload) **[Phase 2 — future]**
1. Owner taps "Add Purchase" → opens camera or gallery picker
2. Photo is sent to the backend, which calls the vision LLM with a structured extraction prompt
3. Backend returns a parsed table: `[{item_name, quantity, unit, unit_price, total_price}]` + supplier name/date if detected
4. App pre-fills the **same Flow A form** used for manual entry — nothing new to design, extraction just populates fields the owner would otherwise type
5. Owner reviews, corrects any misread values, confirms — same commit logic as Flow A
6. Image is discarded from memory/server — never written to persistent storage

### Flow B — Setting/Checking Selling Price
1. Owner opens an item from inventory list
2. Sees: current avg cost, current stock, suggested selling price (cost × (1 + target margin %))
3. Owner can set/edit the selling price manually
4. If entered selling price < avg cost → show a clear warning banner ("This is below your cost of ₹X. You would lose ₹Y per unit.")

### Flow C — Recording a Sale

**Phase 1 ships one entry method — manual selection.** Phase 2 adds invoice-photo upload as a second, converging path; the data model and UI are already shaped for it so it's additive, not a rewrite.

**Flow C2 — Sale via Manual Entry** **[Phase 1]**
1. Owner taps "Record Sale"
2. Owner selects item(s) used in a service job (searchable list), enters quantity used
3. App shows the current selling price, current avg cost, and computed margin/profit for this sale, live, before confirming — supports multiple line items per sale (a single job often uses several parts)
4. Confirms → decrements `stock_qty`, logs a `sale_record` with `source = "manual"`
5. If sale price < avg cost, require explicit override confirmation ("Sell below cost anyway?") — this path blocks confirm by default since the price is being set in the moment, not transcribed from an already-issued invoice
6. Stock is blocked from going negative — flagged for owner review instead

**Flow C1 — Sale via Invoice Upload** **[Phase 2 — future]**
1. Owner taps "Record Sale" → chooses "Upload Invoice"
2. Photo of the customer invoice/bill is sent to the same vision LLM extraction service used for purchases, with a sales-specific prompt variant
3. Backend returns: `[{item_name, quantity, unit_price, total_price}]` + customer name/invoice date if detected
4. App pre-fills the **same Flow C2 form**: each row matched against existing inventory items (fuzzy match) — a sale can only reference existing items, never auto-create a new one
5. Owner reviews, corrects any misread values, confirms
6. If sale_price < avg_cost, mark `sold_below_cost = true` but do **not** block confirm, since the invoice was already issued to the customer — Phase 2 treats this as an after-the-fact flag, not a preventable warning (unlike the real-time block in manual entry)
7. Image is discarded — never written to persistent storage

**Why the two paths would behave differently on below-cost (Phase 2 note):** in manual entry the owner is actively choosing a price in real time, so the app can intervene before the sale happens. In invoice upload, the sale already happened (the invoice is proof) — the app's job shifts from prevention to accurate reporting, so it flags rather than blocks.

### Flow D — Reviewing Item History **[Phase 1]**
1. Owner opens an item → sees purchase history: date, supplier, quantity, unit price paid
2. Sees a price-trend chart (is this item getting more expensive over time / from which supplier), plus a stock-level-over-time sparkline

### Flow E — Dashboard & Analytics **[Phase 1]**
1. Owner opens the app → lands on a dashboard built around decisions, not just numbers:
   - **KPI strip:** total inventory value, today's revenue, today's profit, open below-cost warnings, open low-stock alerts
   - **Inventory value trend** (line chart, last 30/90 days) — is total stock value growing or shrinking
   - **Top items by profit** and **top items by sales volume** (bar charts) — what's actually making money
   - **Category breakdown** (donut chart) — where inventory value/spend concentrates (oil, filters, spark plugs, batteries, etc.)
   - **Supplier spend breakdown** (bar chart) — who the owner is buying most from, and at what average price
   - **Margin health** — count/list of items currently priced at or below cost, surfaced prominently, not buried
   - **Recent activity feed** — latest purchases and sales, most recent first
   - **Low-stock rail** — items below their threshold, tap-through to reorder via Add Purchase
2. All charts are date-range filterable (7 / 30 / 90 days, custom) and tap through to the underlying list/detail view
3. Dashboard is the default landing screen after login and is fully responsive down to a single-column phone layout

## 6. Functional Requirements

| ID | Requirement | Priority | Phase |
|----|-------------|----------|-------|
| FR-1 | User can manually add a purchase: item, qty, unit price, supplier, date | Must | 1 |
| FR-2 | User can create a new item inline while logging a purchase, or select an existing one via type-ahead search | Must | 1 |
| FR-3 | User can add multiple line items to one purchase batch before submitting | Must | 1 |
| FR-4 | System computes new weighted-average cost on confirm | Must | 1 |
| FR-5 | System updates stock quantity on confirm | Must | 1 |
| FR-6 | System suggests a selling price based on cost + configurable margin % | Must | 1 |
| FR-7 | System warns when selling price is at or below average cost | Must | 1 |
| FR-8 | User can view per-item purchase history (date, supplier, price, qty) with a price-trend chart | Should | 1 |
| FR-9 | User can merge/alias two item names into one SKU | Should | 1 |
| FR-10 | User can record a sale/usage that decrements stock via manual entry | Must | 1 |
| FR-11 | System computes and displays per-line profit (sale price − avg cost) × qty before the sale is confirmed | Must | 1 |
| FR-12 | System blocks stock from going negative on sale confirm and flags the line for owner review instead | Must | 1 |
| FR-13 | System blocks (with explicit override) below-cost lines entered manually | Must | 1 |
| FR-14 | System shows low-stock items below a configurable threshold | Should | 1 |
| FR-15 | User can set target margin % globally or per item/category | Should | 1 |
| FR-16 | Dashboard shows inventory value, revenue, profit, and alert counts as KPI tiles | Must | 1 |
| FR-17 | Dashboard shows inventory-value trend, top items by profit/volume, category breakdown, and supplier spend as charts | Must | 1 |
| FR-18 | Dashboard and all charts support a date-range filter | Should | 1 |
| FR-19 | User can export purchase/sale history to CSV | Should | 1 |
| FR-20 | Multi-supplier price comparison per item | Could | 1 |
| FR-21 | System separates "parts" cost tracking from "labor" charges in billing | Could | 1 |
| FR-22 | User can upload a photo of a bill (camera or file picker); system extracts fields via vision LLM into the Flow A form | Must | 2 |
| FR-23 | System presents extracted data in the editable manual-entry form, with unreadable fields clearly flagged | Must | 2 |
| FR-24 | System suggests matching existing inventory item via fuzzy string match on extracted rows | Must | 2 |
| FR-25 | System does not persist the uploaded image beyond the processing request | Must | 2 |
| FR-26 | User can upload a photo of a sales invoice as an alternative to manual sale entry | Must | 2 |
| FR-27 | System matches extracted sale line items to existing inventory only — never auto-creates a new item from a sale | Must | 2 |
| FR-28 | System flags (not blocks) below-cost lines that arrive via invoice upload | Must | 2 |

## 7. Weighted Average Cost — Calculation Logic

This is the core business logic of the app.

**Formula on each new purchase:**

```
new_avg_cost = ((old_qty * old_avg_cost) + (new_purchase_qty * new_purchase_unit_price)) / (old_qty + new_purchase_qty)
```

**Example:**
- Existing stock: 10 units @ avg cost ₹120 = ₹1,200 total value
- New purchase: 5 units @ ₹150/unit = ₹750
- New avg cost = (1200 + 750) / (10 + 5) = ₹1,950 / 15 = **₹130/unit**
- New stock quantity: 15 units

**Edge cases to handle explicitly:**
- **First-ever purchase of an item** (old_qty = 0): new_avg_cost = new_purchase_unit_price directly
- **Stock quantity is zero but item exists** (all sold out, then repurchased): treat like a fresh average — new_avg_cost = new_purchase_unit_price (old value has no weight since old_qty = 0)
- **Negative/zero quantities from bad OCR read**: reject the row, force manual correction, never silently divide by zero or accept negative stock
- **Bill shows total price, not unit price**: derive `unit_price = total_price / quantity`; if quantity is missing/unclear, block auto-confirm and require manual entry
- **Returns / corrections to a previous purchase**: MVP does not support cost reversal; flag as a known limitation (see Section 12)

## 8. Data Model

### `items`
| Field | Type | Notes |
|---|---|---|
| item_id | PK | |
| shop_id | FK | multi-tenant from day one, even if MVP is single-shop |
| canonical_name | text | e.g. "Castrol 20W40 Engine Oil 1L" |
| aliases | text[] | alternate spellings/names mapped to this item |
| unit | enum | piece, liter, ml, set, box, kg |
| avg_cost | decimal | current weighted average cost |
| stock_qty | decimal | current quantity on hand |
| selling_price | decimal | current selling price (owner-set or system-suggested) |
| target_margin_pct | decimal, nullable | overrides shop-level default if set |
| category | text | e.g. "oil", "filter", "spark plug", "battery" |
| created_at / updated_at | timestamp | |

### `purchase_history`
| Field | Type | Notes |
|---|---|---|
| purchase_id | PK | |
| item_id | FK | |
| shop_id | FK | |
| supplier_name | text, nullable | as extracted/entered |
| quantity | decimal | |
| unit_price | decimal | |
| total_price | decimal | |
| purchase_date | date | extracted or user-confirmed |
| avg_cost_after | decimal | snapshot of avg_cost immediately after this purchase, for audit trail |
| created_at | timestamp | |

### `sale_records` (Flow C — supports both upload and manual entry)
| Field | Type | Notes |
|---|---|---|
| sale_id | PK | |
| item_id | FK | |
| shop_id | FK | |
| quantity | decimal | |
| sale_price | decimal | price per unit charged |
| cost_at_sale | decimal | snapshot of avg_cost at time of sale, for margin reporting |
| profit | decimal | computed: (sale_price − cost_at_sale) × quantity, stored for fast reporting |
| source | enum | `upload` or `manual` — which entry path created this record |
| sold_below_cost | boolean | flag if price was below cost_at_sale (manual: only true if owner explicitly overrode; upload: auto-flagged, non-blocking) |
| customer_name | text, nullable | extracted from invoice if present (upload path only) |
| invoice_ref | text, nullable | extracted invoice/bill number if present (upload path only) |
| sale_date | timestamp | |

### `shops`
| Field | Type | Notes |
|---|---|---|
| shop_id | PK | |
| name | text | |
| default_target_margin_pct | decimal | e.g. 20% |
| created_at | timestamp | |

## 9. AI Extraction — Design Notes **[Phase 2 — not built in this pass]**

This entire section describes future work. Phase 1 has no AI dependency, no vision API calls, and no image handling of any kind — it is included here so the Phase 1 data model and forms are deliberately shaped to make this an additive feature later, not a rewrite.

**Model:** Gemini (Flash, free tier) via vision-capable API call.

**Shared extraction service, two bill types:** the same backend extraction service handles both purchase bills (Flow A) and sales invoices (Flow C1) — the image-in, JSON-out mechanics are identical, only the prompt and the downstream field name differ (`supplier_name` for purchases vs. `customer_name` for sales). This avoids duplicating the vision-call, retry/backoff, and JSON-parsing logic in two places. The service takes a `bill_type: "purchase" | "sale"` parameter and selects the matching prompt template.

**Prompting approach (purchase bills):**
- System instructs the model to act as a bill-parsing engine
- Output format: strict JSON only, no prose, no markdown fences
- Schema requested:
```json
{
  "supplier_name": "string or null",
  "bill_date": "YYYY-MM-DD or null",
  "line_items": [
    {
      "item_name": "string",
      "quantity": "number",
      "unit": "string or null",
      "unit_price": "number or null",
      "total_price": "number or null"
    }
  ]
}
```

**Prompting approach (sales invoices) — same shape, sale-oriented framing:**
```json
{
  "customer_name": "string or null",
  "invoice_ref": "string or null",
  "invoice_date": "YYYY-MM-DD or null",
  "line_items": [
    {
      "item_name": "string",
      "quantity": "number",
      "unit_price": "number or null",
      "total_price": "number or null"
    }
  ]
}
```
Note: sales invoices don't need a `unit` field the way purchase bills do — by the time an item is sold, its unit is already fixed in the inventory record it gets matched to.
- If the model cannot confidently read a field, it should return `null` rather than guess — the confirmation UI must clearly flag nulls as "needs your input" rather than silently defaulting to 0.
- Parse defensively: strip markdown code fences if present, validate JSON, and if parsing fails, surface a "couldn't read this bill clearly, please enter manually" fallback rather than erroring out.

**Fallback path:** If extraction fails or confidence is low (e.g., all fields null), offer a manual entry form pre-populated with nothing, so the flow never fully dead-ends.

## 10. Non-Functional Requirements

| Area | Requirement |
|---|---|
| Cost | Zero infrastructure spend at MVP scale (see Section 11) |
| Privacy | Bill images never persisted; only structured data stored |
| Performance | Extraction result returned within ~5-10 seconds of upload |
| Reliability | Handle API 429 (rate limit) errors with retry + backoff, not a hard failure |
| Usability | Mobile-first, large tap targets, works for low-tech-comfort users |
| Data integrity | No negative stock, no divide-by-zero in avg cost calc, all commits are atomic (item + stock + history updated together or not at all) |
| Multi-tenancy | Data model supports multiple shops from day one, even if MVP runs for one shop, to avoid a costly rewrite later |

## 11. Proposed Tech Stack (Zero Cost, No Card)

### Phase 1 (this build — no AI dependency at all)

| Layer | Choice | Why |
|---|---|---|
| Frontend | React + Vite, mobile-responsive PWA, Tailwind CSS | Fast dev loop, installable on phone home screen, avoids app-store friction/cost |
| Charts | Recharts (or Chart.js) | Lightweight, responsive charts for the dashboard (KPIs, trends, breakdowns) |
| Backend | Node (Express) or Python (FastAPI) | Simple REST API, easy to host free |
| Database | SQLite (file-based) to start; Supabase Postgres free tier if multi-device access needed early | No cost, no setup for SQLite; Supabase adds hosted access without a card |
| Hosting | Render / Railway / Fly.io free tier for backend, Vercel/Netlify for frontend, or run locally during pilot | No cost during pilot with one shop |

### Phase 2 (additive — introduces the only AI/image dependency)

| Layer | Choice | Why |
|---|---|---|
| Vision/extraction | Gemini API free tier (Flash model) | 1,500 requests/day free, no card required, strong handwriting comprehension |
| Image handling | Processed in-memory only, never written to disk/object storage | Zero storage cost, matches "no image retention" requirement |

**Note:** Free-tier terms (rate limits, card requirements) change over time — re-verify current terms before final hosting decision, especially if usage grows past pilot stage.

## 12. Known Limitations (MVP)

- No support for correcting/reversing a previously confirmed purchase (e.g., if owner realizes 2 bills later that an entry was wrong) — flagged for a future "adjustment entry" feature
- No handling of purchase returns/refunds to supplier
- Single currency, no multi-currency support
- No offline mode — requires internet connectivity to process bills
- Item matching relies on fuzzy string similarity, not semantic understanding — may require manual merges initially until the item catalog stabilizes
- GST/tax handling not explicitly modeled in MVP — recommend costs are entered tax-inclusive (i.e., "what I actually paid") for simplicity, revisit if owners need tax-exclusive margin reporting

## 13. Success Metrics

- **Adoption:** % of purchases logged via app vs. still tracked on paper (target: shop logs 80%+ of purchases within first month)
- **Accuracy:** % of extracted bill rows requiring no manual correction (target: improve from baseline over first 100 bills)
- **Business impact:** Number of "below cost" warnings surfaced and acted on (proxy for margin protection)
- **Retention:** Shop owner still actively using the app after 30/60/90 days

## 14. Phase 1 Scope Summary (Build Order)

1. Data model + weighted average cost engine (Section 7 & 8) — core logic, testable independently of UI
2. Manual purchase entry form with item type-ahead / inline-create (Flow A)
3. Item detail view: avg cost, stock, suggested selling price, below-cost warning (Flow B)
4. Purchase history view per item with price-trend chart (Flow D)
5. Manual sale entry (Flow C2) — decrements stock, computes live profit, blocks below-cost with override
6. Dashboard & analytics (Flow E) — KPI tiles, inventory value trend, top items, category/supplier breakdowns, alerts rail
7. Settings — margin defaults, low-stock thresholds, categories, units

## 15. Phase 2 Scope Summary (Deferred — additive on top of Phase 1)

1. Extraction Orchestrator service (Section 9) — Gemini vision call, retry/backoff, JSON parsing
2. Purchase bill upload, pre-filling the Phase 1 manual form (Flow A′)
3. Sales invoice upload, pre-filling the Phase 1 manual sale form (Flow C1)
4. Fuzzy item matching for extracted rows

Everything in Section 4's "Non-Goals" and Section 12's limitations is intentionally deferred until the core cost-tracking loop is validated with a real shop.

---

*End of PRD. Recommend validating Sections 6-8 (functional requirements + cost logic + data model) before any code is written, since these are the hardest parts to change after the fact. Phase 1 build starts with zero external dependencies — no API keys needed to get running.*
