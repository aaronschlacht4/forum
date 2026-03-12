-- ============================================
-- Step 9: Make public annotations readable by anyone (including non-logged-in users)
-- ============================================

-- Drop existing restrictive SELECT policies on annotations
DROP POLICY IF EXISTS "Users can view their own annotations" ON public.annotations;
DROP POLICY IF EXISTS "Users can view annotations" ON public.annotations;

-- Allow authenticated users to see their own annotations (private + public)
CREATE POLICY "Users see own annotations" ON public.annotations
  FOR SELECT USING (auth.uid() = user_id);

-- Allow anyone (including anonymous) to see public annotations
CREATE POLICY "Anyone sees public annotations" ON public.annotations
  FOR SELECT USING (visibility = 'public');

-- Allow anyone to read replies (replies on public annotations are public)
DROP POLICY IF EXISTS "Anyone can view replies" ON public.replies;
CREATE POLICY "Anyone can view replies" ON public.replies
  FOR SELECT USING (true);

-- Allow anyone to read profiles (for author display names)
DROP POLICY IF EXISTS "Anyone can view profiles" ON public.profiles;
CREATE POLICY "Anyone can view profiles" ON public.profiles
  FOR SELECT USING (true);

SELECT 'Step 9 Complete: public annotations now readable without login' as status;
