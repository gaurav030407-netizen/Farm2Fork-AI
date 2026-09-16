"""Deterministic agricultural price decision support engine for Farm2Fork.

Calculates market price statistics from verified Government of India observations
and formats them for AI explanation without hallucinating numbers.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta
import logging
import statistics
from typing import Any

from sqlalchemy import text

from ...database.connection import get_engine

logger = logging.getLogger(__name__)


@dataclass
class PriceAnalysisResult:
    """Deterministic price recommendation and analysis output."""

    crop: str
    variety: str
    selected_market: str
    state: str | None
    district: str | None
    latest_modal: float | None
    modal_unit: str
    recent_range_min: float | None
    recent_range_max: float | None
    recent_median: float | None
    observations_count: int
    data_coverage_from: str | None
    data_coverage_to: str | None
    trend: str  # 'Rising' | 'Falling' | 'Mixed' | 'Insufficient data'
    confidence: str  # 'High' | 'Medium' | 'Low' | 'Insufficient data'
    asking_price: float | None
    difference_amount: float | None
    difference_percentage: float | None
    difference_summary: str | None
    market_comparison: list[dict[str, Any]]
    historical_period: str
    has_sufficient_data: bool
    ai_interpretation: str
    disclaimer: str = (
        "Market prices can change quickly based on arrival volumes, quality grade, "
        "and transport costs. This is decision support, not a guaranteed future price."
    )

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class PriceDecisionEngine:
    """Engine performing deterministic calculations on real market price records."""

    PERIOD_DAYS: dict[str, int] = {
        "2m": 60,
        "6m": 180,
        "1y": 365,
        "2y": 730,
        "5y": 1825,
    }

    def fetch_records(
        self,
        crop: str,
        variety: str | None = None,
        state: str | None = None,
        district: str | None = None,
        market: str | None = None,
        period: str = "2m",
    ) -> list[dict[str, Any]]:
        """Fetch real observations within the given time window from public.market_prices."""
        days = self.PERIOD_DAYS.get(period.lower(), 60)
        date_cutoff = date.today() - timedelta(days=days)

        clauses = ["source_commodity ILIKE :crop", "arrival_date >= :date_cutoff"]
        params: dict[str, Any] = {
            "crop": f"%{crop.strip()}%",
            "date_cutoff": date_cutoff,
        }

        if variety and variety.strip() and variety.strip().lower() not in {"all", "all varieties", "not specified"}:
            clauses.append("source_variety ILIKE :variety")
            params["variety"] = f"%{variety.strip()}%"

        if state and state.strip() and state.strip().lower() not in {"all", "all states"}:
            clauses.append("state ILIKE :state")
            params["state"] = f"%{state.strip()}%"

        if district and district.strip() and district.strip().lower() not in {"all", "all districts"}:
            clauses.append("district ILIKE :district")
            params["district"] = f"%{district.strip()}%"

        if market and market.strip() and market.strip().lower() not in {"all", "all markets"}:
            clauses.append("market ILIKE :market")
            params["market"] = f"%{market.strip()}%"

        query = f"""
            SELECT source_commodity, source_variety, state, district, market,
                   min_price, max_price, modal_price, unit, arrival_date
            FROM public.market_prices
            WHERE {' AND '.join(clauses)}
            ORDER BY arrival_date ASC NULLS LAST
            LIMIT 500
        """

        try:
            with get_engine().connect() as conn:
                rows = conn.execute(text(query), params).mappings().all()
            return [dict(r) for r in rows]
        except Exception as err:
            logger.warning("Error fetching market records for price engine: %s", err)
            return []

    def fetch_market_comparisons(
        self,
        crop: str,
        state: str | None,
        district: str | None,
        primary_market: str | None,
    ) -> list[dict[str, Any]]:
        """Compare modal prices across nearby markets in the same district/state."""
        clauses = ["source_commodity ILIKE :crop", "modal_price IS NOT NULL"]
        params: dict[str, Any] = {"crop": f"%{crop.strip()}%"}

        if district and district.strip():
            clauses.append("district ILIKE :district")
            params["district"] = f"%{district.strip()}%"
        elif state and state.strip():
            clauses.append("state ILIKE :state")
            params["state"] = f"%{state.strip()}%"

        query = f"""
            SELECT market, district, state, avg(modal_price) as avg_modal, max(arrival_date) as last_date
            FROM public.market_prices
            WHERE {' AND '.join(clauses)}
            GROUP BY market, district, state
            ORDER BY avg_modal ASC
            LIMIT 5
        """
        try:
            with get_engine().connect() as conn:
                rows = conn.execute(text(query), params).mappings().all()
            return [
                {
                    "market": r["market"] or "Unnamed Mandi",
                    "location": f"{r['district'] or ''}, {r['state'] or ''}".strip(", "),
                    "avg_modal": round(float(r["avg_modal"]), 1),
                    "last_date": str(r["last_date"]) if r["last_date"] else None,
                }
                for r in rows
                if primary_market is None or (r["market"] or "").lower() != primary_market.lower()
            ]
        except Exception as err:
            logger.warning("Error comparing mandis: %s", err)
            return []

    def calculate(
        self,
        crop: str,
        variety: str | None = None,
        state: str | None = None,
        district: str | None = None,
        market: str | None = None,
        asking_price: float | None = None,
        period: str = "2m",
    ) -> PriceAnalysisResult:
        """Run deterministic calculations on verified historical observations."""
        records = self.fetch_records(crop, variety, state, district, market, period)
        valid_modals = [
            float(r["modal_price"])
            for r in records
            if r.get("modal_price") is not None and float(r["modal_price"]) > 0
        ]

        obs_count = len(valid_modals)
        unit = (records[0]["unit"] if records and records[0].get("unit") else "₹ / quintal")
        variety_label = variety or (records[0]["source_variety"] if records and records[0].get("source_variety") else "Not specified")
        market_label = market or (records[0]["market"] if records and records[0].get("market") else "All reporting mandis")

        # Insufficient data rule: less than 3 observations
        if obs_count < 3:
            return PriceAnalysisResult(
                crop=crop,
                variety=variety_label,
                selected_market=market_label,
                state=state,
                district=district,
                latest_modal=valid_modals[-1] if valid_modals else None,
                modal_unit=unit,
                recent_range_min=None,
                recent_range_max=None,
                recent_median=None,
                observations_count=obs_count,
                data_coverage_from=None,
                data_coverage_to=None,
                trend="Insufficient data",
                confidence="Insufficient data",
                asking_price=asking_price,
                difference_amount=None,
                difference_percentage=None,
                difference_summary=None,
                market_comparison=[],
                historical_period=period,
                has_sufficient_data=False,
                ai_interpretation=(
                    "Not enough verified market observations to provide a price estimate. "
                    "Farm2Fork does not fabricate or guess agricultural prices when official data is sparse."
                ),
            )

        parsed_dates: list[date] = []
        for r in records:
            d = r.get("arrival_date")
            if d is None:
                continue
            if isinstance(d, date):
                parsed_dates.append(d)
            elif isinstance(d, str) and d.strip():
                try:
                    parsed_dates.append(datetime.strptime(d.strip()[:10], "%Y-%m-%d").date())
                except ValueError:
                    pass

        coverage_from = str(min(parsed_dates)) if parsed_dates else None
        coverage_to = str(max(parsed_dates)) if parsed_dates else None
        date_span_days = (max(parsed_dates) - min(parsed_dates)).days if len(parsed_dates) >= 2 else 0

        latest_modal = valid_modals[-1]
        recent_min = min(valid_modals)
        recent_max = max(valid_modals)
        recent_median = round(statistics.median(valid_modals), 1)

        # Deterministic trend computation
        half = max(1, obs_count // 2)
        earlier_avg = statistics.mean(valid_modals[:half])
        recent_avg = statistics.mean(valid_modals[half:])
        pct_change = ((recent_avg - earlier_avg) / earlier_avg) * 100 if earlier_avg > 0 else 0

        if pct_change > 2.0:
            trend = "Rising"
        elif pct_change < -2.0:
            trend = "Falling"
        else:
            trend = "Mixed"

        # Deterministic confidence based on observations count and span
        if obs_count >= 30 and date_span_days >= 30:
            confidence = "High"
        elif obs_count >= 10 and date_span_days >= 14:
            confidence = "Medium"
        else:
            confidence = "Low"

        # Farmer asking price comparison
        diff_amount: float | None = None
        diff_pct: float | None = None
        diff_summary: str | None = None

        if asking_price is not None and asking_price > 0 and latest_modal:
            diff_amount = round(asking_price - latest_modal, 1)
            diff_pct = round(((asking_price - latest_modal) / latest_modal) * 100, 1)
            sign = "+" if diff_amount > 0 else ""
            position = "above" if diff_amount > 0 else "below"
            diff_summary = f"{sign}₹{abs(diff_amount)}/quintal ({sign}{diff_pct}%) {position} latest mandi modal reference"

        # Mandi comparison
        comparisons = self.fetch_market_comparisons(crop, state, district, market)

        # Build initial deterministic interpretation template
        interpretation_lines = [
            f"Based on {obs_count} verified official observations from {coverage_from or 'recent dates'} to {coverage_to or 'latest'}, "
            f"the latest modal reference for {crop} ({variety_label}) at {market_label} is ₹{latest_modal:,.0f} per quintal.",
            f"The observed price range across this period spans from ₹{recent_min:,.0f} to ₹{recent_max:,.0f} per quintal, with a median of ₹{recent_median:,.0f}.",
            f"The recent price trend is currently classified as {trend}.",
        ]

        if diff_summary:
            interpretation_lines.append(f"Your listed asking price of ₹{asking_price:,.0f} is {diff_summary}.")

        if comparisons:
            cheapest = comparisons[0]
            interpretation_lines.append(
                f"Nearby reference: {cheapest['market']} ({cheapest['location']}) recently recorded an average modal price of ₹{cheapest['avg_modal']:,.0f}."
            )

        ai_interpretation = " ".join(interpretation_lines)

        return PriceAnalysisResult(
            crop=crop,
            variety=variety_label,
            selected_market=market_label,
            state=state,
            district=district,
            latest_modal=latest_modal,
            modal_unit=unit,
            recent_range_min=recent_min,
            recent_range_max=recent_max,
            recent_median=recent_median,
            observations_count=obs_count,
            data_coverage_from=coverage_from,
            data_coverage_to=coverage_to,
            trend=trend,
            confidence=confidence,
            asking_price=asking_price,
            difference_amount=diff_amount,
            difference_percentage=diff_pct,
            difference_summary=diff_summary,
            market_comparison=comparisons,
            historical_period=period,
            has_sufficient_data=True,
            ai_interpretation=ai_interpretation,
        )


price_decision_engine = PriceDecisionEngine()
