-- ============================================
-- FIX EXISTING REPLIES
-- ============================================
-- This fixes replies that were created before the is_anonymous column existed
-- Sets all NULL values to false (not anonymous)

UPDATE public.replies
SET is_anonymous = false
WHERE is_anonymous IS NULL;

-- Verify it worked:
SELECT
  id,
  content,
  is_anonymous,
  created_at
FROM public.replies
ORDER BY created_at DESC
LIMIT 10;

-- All replies should now show is_anonymous = false (not NULL)
