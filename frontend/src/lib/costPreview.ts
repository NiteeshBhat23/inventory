// Mirrors the backend weighted-average formula (PRD Section 7) for a live
// client-side preview only — the backend is the source of truth on commit.
export function previewNewAvgCost(oldQty: number, oldAvgCost: number, purchaseQty: number, purchaseUnitPrice: number) {
  if (purchaseQty <= 0 || purchaseUnitPrice <= 0) return null
  if (oldQty === 0) return purchaseUnitPrice
  return (oldQty * oldAvgCost + purchaseQty * purchaseUnitPrice) / (oldQty + purchaseQty)
}
