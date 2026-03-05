-- ============================================
-- FINAL COMPLETE FIX - Run this to fix everything
-- ============================================
-- This is the definitive fix that includes:
-- 1. Add is_anonymous column
-- 2. Set existing replies to not anonymous
-- 3. Populate profiles table
-- 4. Fix BOTH views (annotations and replies)
-- 5. Set up auto-sync
-- ============================================

-- 1. Add is_anonymous column to replies table
ALTER TABLE public.replies
ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN DEFAULT false;

-- 2. Fix any existing replies that have NULL for is_anonymous
UPDATE public.replies
SET is_anonymous = false
WHERE is_anonymous IS NULL;

-- 3. Populate profiles table with all existing auth users
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

-- 4. Fix annotations_with_users view (for comments)
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

-- 5. Fix replies_with_users view (for replies)
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

-- 6. Create function to sync profiles automatically
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

-- 7. Create trigger on auth.users to sync on insert/update
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

SELECT '✅ Step 3: Annotations view check' as status;
SELECT id, display_name, username FROM public.annotations_with_users LIMIT 3;

SELECT '✅ Step 4: Replies view check' as status;
SELECT id, is_anonymous, display_name, username FROM public.replies_with_users LIMIT 3;

-- ============================================
-- DONE! Refresh your app and test:
-- ============================================
-- 1. Comments should show your username
-- 2. Replies (without anonymous) should show your username
-- 3. Replies (with anonymous) should show "Anonymous"
-- ============================================
