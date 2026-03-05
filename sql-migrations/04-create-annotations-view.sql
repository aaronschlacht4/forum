-- ============================================
-- Step 4: Create/Update annotations_with_users view
-- ============================================
-- This view joins annotations with user profiles
-- ============================================

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
  p.avatar_url as avatar_url
FROM public.annotations a
LEFT JOIN public.profiles p ON a.user_id = p.id;

-- Verification
SELECT 'Step 4 Complete: annotations_with_users view created' as status;
SELECT id, visibility, display_name, username FROM public.annotations_with_users LIMIT 3;
