-- ============================================
-- ULTIMATE FIX - Run this to fix everything
-- ============================================
-- This handles all missing columns and fixes all views
-- ============================================

-- 1. Add visibility column to annotations table if it doesn't exist
ALTER TABLE public.annotations
ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public';

-- 2. Add is_anonymous column to replies table
ALTER TABLE public.replies
ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN DEFAULT false;

-- 3. Fix any existing replies that have NULL for is_anonymous
UPDATE public.replies
SET is_anonymous = false
WHERE is_anonymous IS NULL;

-- 4. Populate profiles table with all existing auth users
INSERT INTO public.profiles (id, email, display_name, avatar_url)
SELECT
  id,
  email,
  COALESCE(raw_user_meta_data->>'display_name', email),
  raw_user_meta_data->>'avatar_url'
FROM auth.users
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  display_name = EXCLUDED.display_name,
  avatar_url = EXCLUDED.avatar_url,
  updated_at = NOW();

-- 5. Fix annotations_with_users view (for comments)
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

-- 6. Fix replies_with_users view (for replies)
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

-- 7. Create function to sync profiles automatically
CREATE OR REPLACE FUNCTION public.handle_user_profile_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    display_name = EXCLUDED.display_name,
    avatar_url = EXCLUDED.avatar_url,
    updated_at = NOW();
  RETURN NEW;
END;
$$;

-- 8. Create trigger on auth.users to sync on insert/update
DROP TRIGGER IF EXISTS on_auth_user_profile_sync ON auth.users;
CREATE TRIGGER on_auth_user_profile_sync
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_profile_sync();

-- ============================================
-- VERIFICATION
-- ============================================

SELECT '✅ Step 1: Profiles populated' as status, COUNT(*) as count FROM public.profiles;
SELECT '✅ Step 2: Replies is_anonymous set' as status, COUNT(*) as count FROM public.replies WHERE is_anonymous = false;
SELECT '✅ Step 3: Annotations visibility added' as status, COUNT(*) as count FROM public.annotations;

SELECT '✅ Step 4: Annotations view check' as status;
SELECT id, visibility, display_name, username FROM public.annotations_with_users LIMIT 3;

SELECT '✅ Step 5: Replies view check' as status;
SELECT id, is_anonymous, display_name, username FROM public.replies_with_users LIMIT 3;

-- ============================================
-- DONE! Refresh your app and test:
-- ============================================
-- 1. Comments should show your username and can be public/private
-- 2. Replies (without anonymous) should show your username
-- 3. Replies (with anonymous) should show "Anonymous"
-- ============================================
