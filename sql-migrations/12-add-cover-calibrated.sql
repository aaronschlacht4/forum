-- Which covers are actually built for the spine remap.
--
-- The spine-remap shader (lib/bookModel.ts, makeCoverMaterial) assumes a
-- cover file is laid out as [back cover | spine · thickness | front cover]
-- at the book's own proportions. Only covers actually built that way should
-- go through it — anything else (the catalogue's existing covers, laid out
-- however their source happened to be) would get carved up along boundaries
-- that don't correspond to anything in the file, and come out visibly wrong.
--
-- Defaults to false, so every existing book keeps rendering exactly as it
-- did before the remap existed until its cover is rebuilt and this is set.

ALTER TABLE books ADD COLUMN IF NOT EXISTS cover_calibrated BOOLEAN NOT NULL DEFAULT false;
