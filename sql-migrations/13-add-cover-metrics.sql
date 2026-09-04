-- The target proportions to BUILD a book's wraparound cover at — a spec, not
-- a measurement of a file that already exists.
--
-- Everything is computed against the fixed 1200px reference height the whole
-- convention is defined in terms of (see BOOK_MODEL_URL's doc comment in
-- lib/bookModel.ts), so these say "draw this book's jacket at these
-- proportions" rather than "this file happens to be this big". That's what
-- makes them useful for a book whose cover hasn't been drawn yet: the numbers
-- come first, the artwork is built to match, and cover_calibrated goes true
-- once it is.
--
-- The layout, on a 1200px-tall canvas:
--
--   [ 921px back cover | 203px × thickness spine | 921px front cover ]
--
-- cover_spine_px:     203 × thickness
-- cover_aspect_ratio: (921 + cover_spine_px + 921) / 1200
--
-- where thickness = clamp(sqrt(pageCount / 300), 0.55, 1.7), matching
-- spineThickness in components/ShelfScene.tsx. A book with no page_count
-- falls back to thickness 1 — the classic 203px spine on a 2045px file.
--
-- Both null until scripts/backfill-cover-metrics.mjs has run. Unlike
-- cover_calibrated, these are meaningful for every book regardless of whether
-- its cover has been rebuilt yet — for an uncalibrated one they're the recipe
-- for rebuilding it.

ALTER TABLE books ADD COLUMN IF NOT EXISTS cover_aspect_ratio NUMERIC;
ALTER TABLE books ADD COLUMN IF NOT EXISTS cover_spine_px NUMERIC;
