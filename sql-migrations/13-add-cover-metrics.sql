-- The cover file's own real proportions, computed off the file itself —
-- same "read off the file, don't assume" principle spineFractionOfWidth
-- (lib/bookModel.ts) already uses at render time, just persisted so it can
-- be read without loading every image.
--
-- cover_aspect_ratio: the full jpg's width / height, in pixels.
-- cover_spine_px: the spine crop's computed width in pixels, at this book's
-- own thickness — the same formula makeCoverMaterial uses at render time:
--   203 × 1.17 (spine-curve correction, see SPINE_CURVE_MAGNIFICATION in
--   lib/bookModel.ts) × thickness × (imageHeight / 1200)
--
-- Both null until scripts/backfill-cover-metrics.mjs has run, and both
-- meaningless for a book that isn't cover_calibrated — an uncalibrated
-- cover was never drawn with a dedicated spine crop for this to describe.

ALTER TABLE books ADD COLUMN IF NOT EXISTS cover_aspect_ratio NUMERIC;
ALTER TABLE books ADD COLUMN IF NOT EXISTS cover_spine_px NUMERIC;
