-- Add visibility column to annotations table
ALTER TABLE annotations ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'private' CHECK (visibility IN ('private', 'public'));

-- Add user profiles table for displaying usernames
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view public profiles
CREATE POLICY "Public profiles are viewable by everyone"
  ON profiles FOR SELECT
  USING (true);

-- Policy: Users can insert their own profile
CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Policy: Users can update their own profile
CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Update annotations policies to support public visibility
-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own annotations" ON annotations;

-- New policy: Users can view their own annotations OR public annotations
CREATE POLICY "Users can view own or public annotations"
  ON annotations FOR SELECT
  USING (
    auth.uid() = user_id OR visibility = 'public'
  );

-- Keep other policies the same (users can only modify their own)
-- Insert, update, delete policies remain unchanged

-- Create a view for annotations with user info
CREATE OR REPLACE VIEW annotations_with_users AS
SELECT
  a.*,
  p.username,
  p.display_name,
  p.avatar_url
FROM annotations a
LEFT JOIN profiles p ON a.user_id = p.id;

-- Grant access to the view
GRANT SELECT ON annotations_with_users TO authenticated;

-- Function to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name)
  VALUES (
    new.id,
    new.email,
    split_part(new.email, '@', 1)
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically create profile
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_annotations_visibility ON annotations(visibility);
CREATE INDEX IF NOT EXISTS idx_annotations_book_visibility ON annotations(book_id, visibility);
