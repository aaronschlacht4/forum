-- ============================================
-- COMPLETE FIX - Run this to fix everything
-- ============================================
-- This single file will:
-- 1. Add is_anonymous column to replies
-- 2. Populate profiles table with existing users
-- 3. Update the replies_with_users view
-- 4. Set up automatic profile sync
-- ============================================

-- 1. Add is_anonymous column to replies table
ALTER TABLE public.replies
ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN DEFAULT false;

-- 2. Populate profiles table with all existing auth users
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

-- 3. Update the replies_with_users view
DROP VIEW IF EXISTS public.replies_with_users;
CREATE OR REPLACE VIEW public.replies_with_users AS
SELECT
  r.*,
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

-- 4. Create function to sync profiles automatically
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

-- 5. Create trigger on auth.users to sync on insert/update
DROP TRIGGER IF EXISTS on_auth_user_profile_sync ON auth.users;
CREATE TRIGGER on_auth_user_profile_sync
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_profile_sync();

-- ============================================
-- DONE! Now refresh your app and test:
-- ============================================
-- 1. Post a reply without checking anonymous
--    → Should show your username and avatar
-- 2. Post a reply WITH anonymous checked
--    → Should show "Anonymous" with gray "?" avatar
-- ============================================

-- Verify it worked:
SELECT 'Profiles populated:', COUNT(*) FROM public.profiles;
SELECT 'Replies view working:', COUNT(*) FROM public.replies_with_users;
