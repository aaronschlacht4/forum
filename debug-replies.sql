-- ============================================
-- DEBUG REPLIES ISSUE
-- Run these queries to diagnose why replies show as Anonymous
-- ============================================

-- 1. Check if is_anonymous column exists and its values
SELECT
  id,
  user_id,
  content,
  is_anonymous,
  created_at
FROM public.replies
ORDER BY created_at DESC
LIMIT 5;

-- 2. Check if profiles table has data
SELECT
  id,
  email,
  display_name,
  avatar_url
FROM public.profiles
LIMIT 5;

-- 3. Check what the view returns
SELECT *
FROM public.replies_with_users
ORDER BY created_at DESC
LIMIT 5;

-- 4. Check if there's a user profile for your replies
SELECT
  r.id as reply_id,
  r.content,
  r.is_anonymous,
  r.user_id,
  p.id as profile_id,
  p.email,
  p.display_name,
  p.avatar_url
FROM public.replies r
LEFT JOIN public.profiles p ON r.user_id = p.id
ORDER BY r.created_at DESC
LIMIT 5;

-- ============================================
-- EXPECTED RESULTS:
-- ============================================
-- Query 1: Should show is_anonymous = false for non-anonymous replies
-- Query 2: Should show at least one profile (yours)
-- Query 3: Should show display_name and email, not NULL
-- Query 4: Should show profile data joined with replies

-- ============================================
-- IF PROFILES TABLE IS EMPTY:
-- ============================================
-- The profiles table might be empty. Run this to populate it:
-- (Replace the user_id with your actual auth.users id)

-- First, check your auth user:
-- SELECT id, email, raw_user_meta_data FROM auth.users LIMIT 1;

-- Then manually insert your profile:
-- INSERT INTO public.profiles (id, email, display_name, avatar_url)
-- SELECT
--   id,
--   email,
--   COALESCE(raw_user_meta_data->>'display_name', email),
--   raw_user_meta_data->>'avatar_url'
-- FROM auth.users
-- WHERE id = 'YOUR_USER_ID_HERE'
-- ON CONFLICT (id) DO UPDATE SET
--   email = EXCLUDED.email,
--   display_name = EXCLUDED.display_name,
--   avatar_url = EXCLUDED.avatar_url;
