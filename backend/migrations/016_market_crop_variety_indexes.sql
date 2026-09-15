-- Keeps official commodity and official variety independently queryable.
-- Existing observations are preserved; a NULL variety remains "Not specified" at the API boundary.
CREATE INDEX IF NOT EXISTS market_prices_commodity_idx
    ON public.market_prices (source_commodity);
CREATE INDEX IF NOT EXISTS market_prices_variety_idx
    ON public.market_prices (source_variety);
CREATE INDEX IF NOT EXISTS market_prices_commodity_variety_idx
    ON public.market_prices (source_commodity, source_variety);
CREATE INDEX IF NOT EXISTS market_prices_commodity_variety_date_idx
    ON public.market_prices (source_commodity, source_variety, arrival_date DESC);
