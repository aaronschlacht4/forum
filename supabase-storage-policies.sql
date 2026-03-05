-- ============================================
-- STORAGE BUCKET POLICIES FOR AVATARS
-- Run this AFTER creating the avatars bucket in the UI
-- ============================================

-- First, make sure the bucket exists and is public
-- Go to Storage > Create a new bucket called "avatars" > Make it Public

-- Now set up the RLS policies for the avatars bucket

-- Policy 1: Anyone can view/download avatars (public read)
DROP POLICY IF EXISTS "Public avatars are viewable by everyone" ON storage.objects;
CREATE POLICY "Public avatars are viewable by everyone"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'avatars');

-- Policy 2: Authenticated users can upload avatars
DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
CREATE POLICY "Authenticated users can upload avatars"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'avatars');

-- Policy 3: Users can update any avatar (allows overwriting old ones)
DROP POLICY IF EXISTS "Authenticated users can update avatars" ON storage.objects;
CREATE POLICY "Authenticated users can update avatars"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'avatars')
  WITH CHECK (bucket_id = 'avatars');

-- Policy 4: Users can delete any avatar in the bucket
DROP POLICY IF EXISTS "Authenticated users can delete avatars" ON storage.objects;
CREATE POLICY "Authenticated users can delete avatars"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'avatars');

-- ============================================
-- VERIFICATION QUERIES
-- ============================================
-- Run these to verify the policies are set up correctly:

-- Check if bucket exists:
-- SELECT * FROM storage.buckets WHERE id = 'avatars';

-- Check policies:
-- SELECT * FROM pg_policies WHERE tablename = 'objects' AND policyname LIKE '%avatar%';
