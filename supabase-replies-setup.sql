-- Create replies table
CREATE TABLE IF NOT EXISTS replies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  annotation_id UUID REFERENCES annotations(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_replies_annotation ON replies(annotation_id);
CREATE INDEX IF NOT EXISTS idx_replies_user ON replies(user_id);

-- Enable Row Level Security
ALTER TABLE replies ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view replies (if they can see the annotation)
CREATE POLICY "Anyone can view replies"
  ON replies FOR SELECT
  USING (true);

-- Policy: Users can insert their own replies
CREATE POLICY "Users can insert their own replies"
  ON replies FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own replies
CREATE POLICY "Users can update their own replies"
  ON replies FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Users can delete their own replies
CREATE POLICY "Users can delete their own replies"
  ON replies FOR DELETE
  USING (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_replies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_replies_updated_at
  BEFORE UPDATE ON replies
  FOR EACH ROW
  EXECUTE FUNCTION update_replies_updated_at();

-- Create a view that joins replies with user metadata
CREATE OR REPLACE VIEW replies_with_users AS
SELECT
  r.*,
  u.email as username,
  COALESCE(u.raw_user_meta_data->>'display_name', u.email) as display_name,
  u.raw_user_meta_data->>'avatar_url' as avatar_url
FROM replies r
LEFT JOIN auth.users u ON r.user_id = u.id;

-- Update annotations view to include user profile data
DROP VIEW IF EXISTS annotations_with_users;
CREATE OR REPLACE VIEW annotations_with_users AS
SELECT
  a.*,
  u.email as username,
  COALESCE(u.raw_user_meta_data->>'display_name', u.email) as display_name,
  u.raw_user_meta_data->>'avatar_url' as avatar_url
FROM annotations a
LEFT JOIN auth.users u ON a.user_id = u.id;
