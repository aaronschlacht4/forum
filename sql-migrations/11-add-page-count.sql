-- How thick a book actually is.
--
-- The shelf renders every book's spine at one shared width today. Giving each
-- one its own width means knowing how long it really is, and the one honest
-- measurement of that already exists — the page count computed while
-- extracting the book's text (scripts/extract-books.mjs) — it just never made
-- it into the row alongside the book itself.
--
-- NULL means "not extracted yet, or extracted before this column existed";
-- the shelf renders those at the same default width every book used to have,
-- same as before this migration.

ALTER TABLE books ADD COLUMN IF NOT EXISTS page_count INTEGER;
