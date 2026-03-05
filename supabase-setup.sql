-- Enable Row Level Security
ALTER DATABASE postgres SET "app.jwt_secret" TO 'your-jwt-secret';

-- Create annotations table
CREATE TABLE IF NOT EXISTS annotations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  book_id TEXT NOT NULL,
  page_number INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('highlight', 'pen', 'text')),
  data JSONB NOT NULL,
  comment TEXT,
  color TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_annotations_user_book ON annotations(user_id, book_id);
CREATE INDEX IF NOT EXISTS idx_annotations_user_book_page ON annotations(user_id, book_id, page_number);

-- Enable Row Level Security
ALTER TABLE annotations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own annotations
CREATE POLICY "Users can view their own annotations"
  ON annotations FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own annotations
CREATE POLICY "Users can insert their own annotations"
  ON annotations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own annotations
CREATE POLICY "Users can update their own annotations"
  ON annotations FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Users can delete their own annotations
CREATE POLICY "Users can delete their own annotations"
  ON annotations FOR DELETE
  USING (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_annotations_updated_at
  BEFORE UPDATE ON annotations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
