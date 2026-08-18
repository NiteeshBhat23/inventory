# Feature Breakdown & UX Flow
## Inventory & Cost Management App — Phase 7 (Feature Breakdown) & Phase 8 (UX Flow)

---

## Phase 7: Feature Breakdown

Every feature broken into its component tasks, following the PRD (Section 6 Functional Requirements).

### Feature: Authentication & Shop Profile
```
Sign up (shop owner)
Login
Logout
Forgot password / reset
Create shop profile (name, category: 2W/4W/generator)
Edit shop profile
Set default target margin %
```

### Feature: Dashboard (Home) — Phase 1, richer than a basic summary screen
```
KPI tile row: inventory value, today's revenue, today's profit, low-stock count, below-cost count
Inventory value trend chart (line, 7/30/90-day toggle)
Top items by profit (bar chart, top 5-10)
Top items by sales volume (bar chart, top 5-10)
Category breakdown (donut chart — value or spend by category)
Supplier spend breakdown (bar chart — total spend + avg price by supplier)
Margin health panel — items at/below cost, tap-through to item
Low-stock rail — items below threshold, tap-through to Add Purchase
Recent activity feed (latest purchases + sales, unified, newest first)
Date-range filter applied across all dashboard charts
Quick action: Add Purchase
Quick action: Record Sale
Navigate to Inventory
Navigate to Purchase History
Navigate to Reports
```

### Feature: Reports & Analytics — new, Phase 1
```
Purchase spend by supplier over a date range
Sales revenue and profit over a date range
Category-level profitability comparison
Price-trend view across all items (which items are getting more expensive)
Export purchase history to CSV
Export sale history to CSV
```

### Feature: Bill Upload & AI Extraction — Phase 2 (deferred)
```
Open camera to capture bill
Upload bill from gallery/file
Send image for AI extraction
Show loading/processing state
Handle extraction failure (low confidence / unreadable)
Discard image after processing (no storage)
Parse extracted fields (item, qty, unit, unit price, total, supplier, date)
```

### Feature: Purchase Manual Entry — Phase 1 (replaces AI confirmation screen for now)
```
Search/select existing item via type-ahead
Create new item inline if not found
Enter quantity
Enter unit price or total price (app derives the other)
Enter supplier (optional, quick-pick from recent suppliers)
Enter/confirm purchase date (defaults to today)
Add multiple line items to one purchase batch
Show live preview of new avg cost per line before confirming
Remove a line item before confirming
Confirm and commit all rows
Show post-confirm summary (items updated, new items added)
```

### Feature: Purchase Confirmation & Review — Phase 2 (deferred, reuses Manual Entry form)
```
Display extracted line items pre-filled into the manual entry form
Flag fields extraction couldn't read (nulls) as "needs your input"
Suggest matching existing item (fuzzy match)
Accept suggested match
Reject suggested match / create new item instead
Confirm and commit all rows
Show post-confirm summary (items updated, new items added)
```

### Feature: Item / Inventory Management
```
View inventory list (all items)
Search item by name
Filter by category
Sort by name / stock qty / avg cost / margin
View item detail (avg cost, stock qty, selling price, margin)
Create new item manually (without a bill)
Edit item details (name, category, unit)
Delete/archive an item
Merge two items into one (alias mapping)
Rename item (update canonical name)
```

### Feature: Weighted Average Cost Engine
```
Calculate new average cost on purchase confirm
Handle first-time purchase (no prior stock)
Handle re-purchase after stock hits zero
Reject invalid input (zero/negative qty or price)
Store cost snapshot with each purchase (audit trail)
Recalculate stock quantity on purchase confirm
```

### Feature: Selling Price & Margin Management
```
Auto-suggest selling price (cost + target margin %)
Manually override selling price per item
Set/edit target margin % (global default)
Set/edit target margin % (per item override)
Show current margin % on item detail
Warn when selling price is at or below avg cost
```

### Feature: Purchase History
```
View purchase history list per item
View supplier name per purchase entry
View price paid per purchase entry
View date per purchase entry
View price trend (simple chart/list, rising or falling)
Filter purchase history by supplier
Filter purchase history by date range
```

### Feature: Sale / Usage Recording

**Phase 1 — Manual entry only:**
```
Select item(s) used in a service job (searchable list)
Enter quantity used
Support multiple line items per sale
Show current selling price, avg cost, and margin live before confirming
Confirm sale (decrement stock)
Block stock from going negative; flag line for review instead
Block sale if price is below avg cost, require explicit override to proceed
Show post-sale summary: items sold, revenue, profit
View sale record in history
```

**Phase 2 — adds Invoice upload as a second path (deferred):**
```
Choose entry method: upload invoice or manual entry
Open camera to capture sales invoice
Upload sales invoice from gallery/file
Send image for AI extraction (sales prompt variant)
Show loading/processing state
Handle extraction failure (low confidence / unreadable)
Discard image after processing (no storage)
Display extracted line items pre-filled into the manual entry form
Match extracted item to existing inventory (fuzzy match)
Edit item match, quantity, or sale price before confirming
Confirm and commit all rows (decrement stock, log sale records)
Flag (non-blocking) below-cost lines from uploaded invoices — unlike the Phase 1 manual block
```

### Feature: Stock & Alerts
```
Set low-stock threshold per item
View low-stock item list
Receive low-stock notification/badge
View below-cost warning list (items priced under cost)
```

### Feature: Settings
```
Edit shop profile
Manage default margin %
Manage low-stock threshold defaults
Manage unit list (piece, liter, ml, set, box, kg)
Manage item categories
```

---

## Phase 8: UX Flow

The primary end-to-end user journey for **Phase 1**: Dashboard → Add Purchase (manual form) → and, separately, Record Sale (manual form) → back to Dashboard, with the Dashboard itself acting as the analytics hub rather than a plain landing page. Decision points (new vs. existing item, below-cost warning) branch off this main path but are not drawn separately here — they occur inline in the manual entry forms.

**Phase 2 note (future):** "Record Sale" (and "Add Purchase") becomes a fork — the owner chooses **Upload Invoice/Bill** (photo → AI extraction → pre-filled manual form, matched to existing items only for sales) or **Manual Entry** (unchanged from Phase 1). Both paths converge on the same stock/cost/profit calculation before landing back at the Dashboard. See the System Design doc for how Phase 2 reuses Phase 1's services rather than replacing them.

**Tools:** Excalidraw / Figma / pen & paper — this flow is meant to be redrawn as low-fidelity wireframes before any UI design work starts.

**Deliverable:** User Flow (below)
