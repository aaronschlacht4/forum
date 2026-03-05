-- ============================================
-- FIX ALL VIEWS - Complete Fix for Both Annotations and Replies
-- ============================================
-- This fixes BOTH the annotations_with_users AND replies_with_users views
-- to properly include all necessary fields

-- 1. Fix annotations_with_users view
DROP VIEW IF EXISTS public.annotations_with_users;
CREATE OR REPLACE VIEW public.annotations_with_users AS
SELECT
  a.id,
  a.user_id,
  a.book_id,
  a.page_number,
  a.type,
  a.data,
  a.comment,
  a.color,
  a.visibility,
  a.created_at,
  a.updated_at,
  p.email as username,
  COALESCE(p.display_name, p.email) as display_name,
  p.avatar_url
FROM public.annotations a
LEFT JOIN public.profiles p ON a.user_id = p.id;

-- 2. Fix replies_with_users view
DROP VIEW IF EXISTS public.replies_with_users;
CREATE OR REPLACE VIEW public.replies_with_users AS
SELECT
  r.id,
  r.annotation_id,
  r.user_id,
  r.content,
  r.is_anonymous,
  r.created_at,
  r.updated_at,
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
LEFT JOIN public.profiles p ON r.user_id = p.id;

-- ============================================
-- VERIFICATION
-- ============================================

-- Check annotations view:
SELECT 'ANNOTATIONS VIEW:' as check_name;
SELECT
  id,
  user_id,
  visibility,
  display_name,
  username,
  avatar_url
FROM public.annotations_with_users
LIMIT 3;

-- Check replies view:
SELECT 'REPLIES VIEW:' as check_name;
SELECT
  id,
  user_id,
  is_anonymous,
  display_name,
  username,
  avatar_url
FROM public.replies_with_users
LIMIT 3;

-- Both should show your actual display_name, NOT "Anonymous" (unless is_anonymous = true for replies)
