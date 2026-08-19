-- Per-user shelves.
--
-- `books` is the shared catalogue; this table records which of those books a
-- person keeps on their own shelf and in what order. Removing a row takes a book
-- off one person's shelf and leaves the catalogue, its PDF and its annotations
-- untouched.
--
-- There is deliberately NO unique constraint on (user_id, book_id): duplicating
-- a book puts a second copy on the shelf, so the same book may appear more than
-- once. A row is a placement, not a membership.

CREATE TABLE IF NOT EXISTS library_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  book_id UUID REFERENCES books(id) ON DELETE CASCADE NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Shelves are always read in order, for one user at a time.
CREATE INDEX IF NOT EXISTS idx_library_items_user_position
  ON library_items(user_id, position);
CREATE INDEX IF NOT EXISTS idx_library_items_book
  ON library_items(book_id);

ALTER TABLE library_items ENABLE ROW LEVEL SECURITY;

-- A shelf is private: only its owner may read it or change it.
DROP POLICY IF EXISTS "Users can view their own library" ON library_items;
CREATE POLICY "Users can view their own library"
  ON library_items FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can add to their own library" ON library_items;
CREATE POLICY "Users can add to their own library"
  ON library_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can reorder their own library" ON library_items;
CREATE POLICY "Users can reorder their own library"
  ON library_items FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can remove from their own library" ON library_items;
CREATE POLICY "Users can remove from their own library"
  ON library_items FOR DELETE
  USING (auth.uid() = user_id);
