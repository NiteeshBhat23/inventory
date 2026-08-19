"""Fuzzy matching of extracted bill rows onto the shop's item catalog.

Deliberately built on stdlib `difflib` rather than a faster library like
rapidfuzz: the catalog for one shop is hundreds of rows, not millions, so the
speed difference is invisible here — while a compiled C extension is a real
deployment risk on a serverless Python runtime. Zero extra dependencies also
keeps the function bundle small.

The matcher never decides anything on its own. It returns a suggestion plus a
confidence, and the UI makes the owner confirm it — a wrong guess must always
be visible and one tap away from being corrected, because everything
downstream (average cost, margins, stock) is computed from it.
"""

from __future__ import annotations

import re
from difflib import SequenceMatcher

from sqlalchemy.orm import Session

from .. import models
from ..deps import ShopContext
from ..schemas import ExtractedLine, MatchedLine

# Above this, the name is effectively the same item written slightly
# differently ("Bosch Wiper Blade 20" vs "bosch wiper blade 20") and we
# pre-select it. The owner still sees it and can change it.
STRONG_MATCH = 0.82

# Between the two, we surface it as an unconfirmed suggestion. Below the
# floor we suggest nothing at all, because a bad suggestion is worse than
# none — it invites a careless tap that merges two genuinely different parts.
SUGGEST_FLOOR = 0.55

# Words that carry no identifying information in an auto-parts catalog and
# would otherwise inflate similarity between unrelated rows.
_NOISE_TOKENS = frozenset({"pcs", "pc", "piece", "pieces", "nos", "no", "qty", "set", "x"})

_NON_ALNUM = re.compile(r"[^a-z0-9\s]+")
_WHITESPACE = re.compile(r"\s+")


def normalise(name: str) -> str:
    """Casefold, drop punctuation, collapse whitespace.

    Bills write the same part a dozen ways — "BOSCH-WIPER 20\"", "bosch wiper
    20", "Bosch Wiper(20)". Normalising first means the similarity score
    reflects the actual words rather than the punctuation around them."""
    lowered = name.casefold()
    lowered = _NON_ALNUM.sub(" ", lowered)
    return _WHITESPACE.sub(" ", lowered).strip()


def _tokens(normalised: str) -> frozenset[str]:
    return frozenset(t for t in normalised.split() if t and t not in _NOISE_TOKENS)


def similarity(a: str, b: str) -> float:
    """Blended character- and token-level similarity, 0-1.

    Pure character similarity alone mis-ranks this domain badly: "oil filter"
    and "air filter" share most of their characters but are different parts,
    while "brake pad front" and "front brake pad" are the same part in a
    different word order and score poorly. Combining a sequence ratio with a
    token-overlap (Jaccard) score handles both cases — reordering stays high,
    one-word-different drops."""
    na, nb = normalise(a), normalise(b)
    if not na or not nb:
        return 0.0
    if na == nb:
        return 1.0

    sequence = SequenceMatcher(None, na, nb).ratio()

    ta, tb = _tokens(na), _tokens(nb)
    if not ta or not tb:
        return sequence
    overlap = len(ta & tb) / len(ta | tb)

    # Weighted toward token overlap because word identity matters more than
    # spelling proximity when the words are part names.
    return (0.4 * sequence) + (0.6 * overlap)


def _candidate_names(item: models.Item) -> list[str]:
    """An item matches on its canonical name or any alias it has accumulated
    (aliases are how a previously-corrected bill spelling gets remembered)."""
    names = [item.canonical_name]
    names.extend(alias for alias in (item.aliases or []) if alias)
    return names


def best_match(name: str, items: list[models.Item]) -> tuple[models.Item | None, float]:
    """Highest-scoring catalog item for one extracted name."""
    if not name or not name.strip():
        return None, 0.0

    best: models.Item | None = None
    best_score = 0.0
    for item in items:
        score = max((similarity(name, candidate) for candidate in _candidate_names(item)), default=0.0)
        if score > best_score:
            best, best_score = item, score
    return best, best_score


def match_lines(db: Session, shop: ShopContext, lines: list[ExtractedLine]) -> list[MatchedLine]:
    """Resolves every extracted row against the shop's active catalog.

    Loads the catalog once for the whole bill rather than querying per line —
    a 15-row bill would otherwise be 15 round trips for data that cannot
    change mid-request."""
    if not lines:
        return []

    catalog = (
        db.query(models.Item)
        .filter(models.Item.shop_id == shop.id, models.Item.is_archived.is_(False))
        .all()
    )

    matched: list[MatchedLine] = []
    for line in lines:
        item, score = best_match(line.item_name or "", catalog)
        # Below the floor we hand back no suggestion at all, so the UI offers
        # "create new item" rather than a misleading near-miss.
        if item is None or score < SUGGEST_FLOOR:
            item, score = None, 0.0

        matched.append(
            MatchedLine(
                item_name=line.item_name,
                quantity=line.quantity,
                unit=line.unit,
                unit_price=line.unit_price,
                total_price=line.total_price,
                gst_pct=line.gst_pct,
                price_includes_gst=line.price_includes_gst,
                matched_item_id=item.item_id if item else None,
                matched_item_name=item.canonical_name if item else None,
                match_confidence=round(score, 3) if item else None,
            )
        )
    return matched
