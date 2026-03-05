-- ============================================
-- Step 3: Populate profiles table
-- ============================================
-- Syncs all auth.users data to profiles table
-- ============================================

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

-- Verification
SELECT 'Step 3 Complete: profiles populated' as status;
SELECT COUNT(*) as profile_count FROM public.profiles;
SELECT id, email, display_name FROM public.profiles LIMIT 3;
