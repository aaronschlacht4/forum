-- ============================================
-- CHECK CURRENT STATE
-- Run these queries one by one to diagnose the issue
-- ============================================

-- 1. Check if profiles table has data
SELECT 'PROFILES TABLE:' as check_name;
SELECT id, email, display_name, avatar_url
FROM public.profiles
LIMIT 5;

-- 2. Check replies table structure and data
SELECT 'REPLIES TABLE:' as check_name;
SELECT
  id,
  user_id,
  content,
  is_anonymous,
  created_at
FROM public.replies
ORDER BY created_at DESC
LIMIT 5;

-- 3. Check what the view returns
SELECT 'REPLIES_WITH_USERS VIEW:' as check_name;
SELECT
  id,
  user_id,
  content,
  is_anonymous,
  username,
  display_name,
  avatar_url
FROM public.replies_with_users
ORDER BY created_at DESC
LIMIT 5;

-- 4. Manual join to see what SHOULD happen
SELECT 'MANUAL JOIN (what should work):' as check_name;
SELECT
  r.id,
  r.user_id,
  r.content,
  r.is_anonymous,
  CASE
    WHEN r.is_anonymous = true THEN NULL
    ELSE p.email
  END as username,
  CASE
    WHEN r.is_anonymous = true THEN 'Anonymous'
    ELSE COALESCE(p.display_name, p.email)
  END as display_name,
  CASE
    WHEN r.is_anonymous = true THEN NULL
    ELSE p.avatar_url
  END as avatar_url
FROM public.replies r
LEFT JOIN public.profiles p ON r.user_id = p.id
ORDER BY r.created_at DESC
LIMIT 5;

-- ============================================
-- WHAT TO LOOK FOR:
-- ============================================
-- Query 1 (Profiles): Should show at least YOUR user data
-- Query 2 (Replies): is_anonymous should be 'false' for non-anonymous replies
-- Query 3 (View): Should show display_name = your name (not NULL, not 'Anonymous')
-- Query 4 (Manual): Should match Query 3

-- ============================================
-- IF is_anonymous is NULL instead of false:
-- ============================================
-- Run this to fix existing replies:
-- UPDATE public.replies SET is_anonymous = false WHERE is_anonymous IS NULL;
