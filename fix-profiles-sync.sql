-- ============================================
-- FIX PROFILES SYNCHRONIZATION
-- ============================================
-- This will populate the profiles table with existing users
-- and set up automatic sync for new/updated users

-- Step 1: Populate profiles table with all existing auth users
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

-- Step 2: Create function to sync profiles automatically
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

-- Step 3: Create trigger on auth.users to sync on insert/update
DROP TRIGGER IF EXISTS on_auth_user_profile_sync ON auth.users;
CREATE TRIGGER on_auth_user_profile_sync
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_profile_sync();

-- ============================================
-- VERIFICATION
-- ============================================
-- Run this to verify profiles were populated:
-- SELECT id, email, display_name, avatar_url FROM public.profiles;

-- Run this to verify the view now works:
-- SELECT * FROM public.replies_with_users LIMIT 5;
