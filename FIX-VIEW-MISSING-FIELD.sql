-- ============================================
-- FIX: Add is_anonymous to the view
-- ============================================
-- The view was missing the is_anonymous field!
-- This caused all replies to appear anonymous in the frontend

DROP VIEW IF EXISTS public.replies_with_users;
CREATE OR REPLACE VIEW public.replies_with_users AS
SELECT
  r.id,
  r.annotation_id,
  r.user_id,
  r.content,
  r.is_anonymous,  -- ← THIS WAS MISSING!
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

-- Verify it now includes is_anonymous:
SELECT
  id,
  is_anonymous,
  display_name,
  username
FROM public.replies_with_users
LIMIT 5;

-- Should now show is_anonymous = false for non-anonymous replies
