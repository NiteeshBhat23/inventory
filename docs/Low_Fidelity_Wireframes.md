# Low Fidelity Wireframes
## Phase 9 — Inventory & Cost Management App

Simple boxes. No colors. No fancy UI. One wireframe per screen from the UX Flow.

---

### Screen: Login / Shop Setup

```
--------------------------------
 App Name / Logo
--------------------------------

 Email / Phone input

 Password input

 [ Login Button ]

 Forgot password link

 New here? Create shop profile
--------------------------------
```

---

### Screen: Dashboard (Phase 1 — analytics hub, not a plain landing page)

```
--------------------------------
 Shop Name            [Settings]
 [ 7d | 30d | 90d | Custom ]
--------------------------------

 | Value  | Revenue | Profit |
 | ₹----  | ₹----   | ₹----  |
 | Low Stock: -- | Below Cost: -- |
--------------------------------

 [ + Add Purchase ]  [ Record Sale ]
--------------------------------

 Inventory Value Trend
 --------------------------
 |     .....--/\/--....   |
 --------------------------

 Top Items by Profit      Top Items by Volume
 --------------------------  --------------------------
 | ▇▇▇▇▇▇▇  item A       |  | ▇▇▇▇▇▇  item C          |
 | ▇▇▇▇▇    item B       |  | ▇▇▇▇     item D          |
 | ▇▇▇      item C       |  | ▇▇▇      item A          |
 --------------------------  --------------------------

 Category Breakdown        Supplier Spend
 --------------------------  --------------------------
 |     (donut chart)     |  | ▇▇▇▇▇▇  Supplier 1      |
 |  oil / filter / plug  |  | ▇▇▇      Supplier 2      |
 --------------------------  --------------------------

 [!] Margin Health: 3 items priced at/below cost  [ View ]
 [!] Low Stock: 5 items below threshold           [ View ]

 Recent Activity
 --------------------------
 - purchase: item, qty, date
 - sale: item, qty, date, profit
 - purchase: item, qty, date
--------------------------------

 [ Inventory ] [ Purchase History ] [ Reports ]
--------------------------------
```

---

### Screen: Add Purchase — Manual Entry (Phase 1)

```
--------------------------------
 < Back        Add Purchase
--------------------------------

 Supplier: [ recent v  or type ]
 Date: [ today v ]

 --------------------------------
 | Item: [ search / + new  v ]  |
 | Qty: [ -- ]  Unit: [ v ]     |
 | Unit Price: [ ---- ]         |
 |   or Total Price: [ ---- ]   |
 | New avg cost preview: ₹----  |
 --------------------------------
 [ + Add another item to this purchase ]

 --------------------------------
 | Item: [ search / + new  v ]  |
 | Qty: [ -- ]  Unit Price: [--]|
 --------------------------------

--------------------------------
 [ Cancel ]      [ Confirm ]
--------------------------------
```

*(Phase 2, future: a "Scan Bill" option here opens a camera capture → AI extraction → pre-fills this same form.)*

---

### Screen: Review & Confirm — Batch Summary

```
--------------------------------
 < Back      Review & Confirm
--------------------------------

 --------------------------------
 | Item        | Qty | Price   |
 --------------------------------
 | item name 1 | --  | ------  |
 --------------------------------
 | item name 2 | --  | ------  |
 --------------------------------
 | item name 3 (new) | -- | -- |
 --------------------------------

--------------------------------
 [ Cancel ]      [ Confirm ]
--------------------------------
```

---

### Screen: Inventory List

```
--------------------------------
 Inventory            [Settings]
--------------------------------

 Search item

 Filters: Category v   Sort v

 --------------------------------
 | item name        | stock qty |
 | avg cost | price | margin    |
 --------------------------------
 | item name        | stock qty |
 | avg cost | price | margin    |
 --------------------------------
 | item name        | stock qty |
 | avg cost | price | margin    |
 --------------------------------

 [ + Add Item Manually ]
--------------------------------
```

---

### Screen: Item Detail

```
--------------------------------
 < Back        Item Name
--------------------------------

 Category: ------
 Unit: ------

 Avg Cost: ₹ ------
 Stock Qty: ------
 Selling Price: ₹ ------  [Edit]
 Margin: ---%

 --------------------------------
 [!] Below cost warning (if any)
 --------------------------------

 [ View Purchase History ]

--------------------------------
 [ Merge / Rename ]  [ Delete ]
--------------------------------
```

---

### Screen: Record Sale — Manual Entry (Phase 1)

```
--------------------------------
 < Back        Record Sale
--------------------------------

 --------------------------------
 | Item: [ search / dropdown ]  |
 | Qty Used: [ -- ]             |
 | Selling Price: ₹ ------      |
 | Cost: ₹ ------  Margin: --%  |
 | Line Profit: ₹ ------        |
 --------------------------------
 [ + Add another item to this sale ]

 [!] Below cost warning (if any)
 [ ] Confirm override

 Total Revenue: ₹ ------
 Total Profit:  ₹ ------

--------------------------------
 [ Cancel ]      [ Confirm Sale ]
--------------------------------
```

*(Phase 2, future: a "Scan Invoice" option here opens camera capture → AI extraction → pre-fills this same form, matched only to existing items, and below-cost becomes a flag instead of a block since the sale already happened.)*

---

### Screen: Purchase History (per item)

```
--------------------------------
 < Back      Purchase History
--------------------------------

 Filters: Supplier v   Date v

 --------------------------------
 | date | supplier | qty | price |
 --------------------------------
 | date | supplier | qty | price |
 --------------------------------
 | date | supplier | qty | price |
 --------------------------------

 Price Trend: [ line chart ]

--------------------------------
```

---

### Screen: Reports & Analytics (Phase 1 — new)

```
--------------------------------
 < Back          Reports
--------------------------------

 [ Date Range v ]  [ Export CSV ]

 Spend by Supplier
 --------------------------
 | ▇▇▇▇▇▇▇  Supplier 1     |
 | ▇▇▇▇      Supplier 2     |
 --------------------------

 Revenue & Profit Over Time
 --------------------------
 |     .....--/\/--....    |
 --------------------------

 Category Profitability
 --------------------------
 | oil     ▇▇▇▇▇▇  ₹----   |
 | filter  ▇▇▇      ₹----   |
 --------------------------

 Items Getting More Expensive
 --------------------------
 | item name | +12% (30d)  |
 | item name | +8%  (30d)  |
 --------------------------

--------------------------------
```

---

**Deliverable:** Low Fidelity Wireframes (above) — meant to be redrawn in Excalidraw/Figma/pen & paper before moving to high-fidelity UI design. Phase 1 screens (Dashboard, Add Purchase, Record Sale, Reports) are all manual-entry / chart-driven — no camera or AI-processing screens are part of this build.
