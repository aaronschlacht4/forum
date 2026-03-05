-- ============================================
-- Step 1: Add visibility column to annotations
-- ============================================
-- This allows comments to be public or private
-- ============================================

ALTER TABLE public.annotations
ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public';

-- Verification
SELECT 'Step 1 Complete: visibility column added' as status;
SELECT COUNT(*) as annotation_count FROM public.annotations;
