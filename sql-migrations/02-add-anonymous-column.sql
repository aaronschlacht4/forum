-- ============================================
-- Step 2: Add is_anonymous column to replies
-- ============================================
-- This allows replies to be posted anonymously
-- ============================================

ALTER TABLE public.replies
ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN DEFAULT false;

-- Fix any existing replies that have NULL
UPDATE public.replies
SET is_anonymous = false
WHERE is_anonymous IS NULL;

-- Verification
SELECT 'Step 2 Complete: is_anonymous column added' as status;
SELECT COUNT(*) as reply_count FROM public.replies;
SELECT COUNT(*) as anonymous_count FROM public.replies WHERE is_anonymous = true;
