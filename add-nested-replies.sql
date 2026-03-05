-- ============================================
-- ADD NESTED REPLIES (Replies to Replies)
-- ============================================
-- This adds support for replying to replies (threading)

-- 1. Add parent_reply_id column to replies table
ALTER TABLE public.replies
ADD COLUMN IF NOT EXISTS parent_reply_id UUID REFERENCES public.replies(id) ON DELETE CASCADE;

-- 2. Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_replies_parent ON public.replies(parent_reply_id);

-- 3. Update the replies_with_users view to include parent_reply_id
DROP VIEW IF EXISTS public.replies_with_users;
CREATE OR REPLACE VIEW public.replies_with_users AS
SELECT
  r.id,
  r.annotation_id,
  r.user_id,
  r.content,
  r.is_anonymous,
  r.parent_reply_id,
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

-- Check if column was added:
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'replies' AND column_name = 'parent_reply_id';

-- Check the view includes parent_reply_id:
SELECT id, parent_reply_id, display_name FROM public.replies_with_users LIMIT 3;

-- ============================================
-- DONE! Now you can create nested replies
-- ============================================
