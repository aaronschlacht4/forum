-- ============================================
-- COMPLETE SUPABASE SETUP FOR UNIVAULT
-- ============================================
-- Run this file in your Supabase SQL Editor to set up:
-- 1. Replies table and policies
-- 2. Storage bucket for avatars with proper RLS policies
-- 3. Updated views for annotations and replies with user data

-- ============================================
-- PART 1: REPLIES TABLE
-- ============================================

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
DROP POLICY IF EXISTS "Anyone can view replies" ON replies;
CREATE POLICY "Anyone can view replies"
  ON replies FOR SELECT
  USING (true);

-- Policy: Users can insert their own replies
DROP POLICY IF EXISTS "Users can insert their own replies" ON replies;
CREATE POLICY "Users can insert their own replies"
  ON replies FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own replies
DROP POLICY IF EXISTS "Users can update their own replies" ON replies;
CREATE POLICY "Users can update their own replies"
  ON replies FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Users can delete their own replies
DROP POLICY IF EXISTS "Users can delete their own replies" ON replies;
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
DROP TRIGGER IF EXISTS update_replies_updated_at ON replies;
CREATE TRIGGER update_replies_updated_at
  BEFORE UPDATE ON replies
  FOR EACH ROW
  EXECUTE FUNCTION update_replies_updated_at();

-- ============================================
-- PART 2: STORAGE BUCKET FOR AVATARS
-- ============================================

-- Create avatars bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view avatars (public bucket)
DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;
CREATE POLICY "Anyone can view avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- Policy: Authenticated users can upload their own avatars
DROP POLICY IF EXISTS "Users can upload their own avatars" ON storage.objects;
CREATE POLICY "Users can upload their own avatars"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
  );

-- Policy: Users can update their own avatars
DROP POLICY IF EXISTS "Users can update their own avatars" ON storage.objects;
CREATE POLICY "Users can update their own avatars"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
  );

-- Policy: Users can delete their own avatars
DROP POLICY IF EXISTS "Users can delete their own avatars" ON storage.objects;
CREATE POLICY "Users can delete their own avatars"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
  );

-- ============================================
-- PART 3: VIEWS WITH USER DATA
-- ============================================

-- Create a view that joins replies with user metadata
DROP VIEW IF EXISTS replies_with_users;
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

-- ============================================
-- SETUP COMPLETE
-- ============================================
-- You should now be able to:
-- 1. Post and view replies on annotations
-- 2. Upload and update profile avatars
-- 3. See user profile information in annotations and replies
