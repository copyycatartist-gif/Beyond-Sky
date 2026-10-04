-- Migration 015: Backfill public.users for any auth.users without a profile row
-- Safe to run multiple times (ON CONFLICT DO NOTHING).
-- Run this in Supabase SQL Editor after 014.

-- Insert a public.users row for every auth.users that doesn't already have one.
-- Role defaults to 'loan_officer'; update manually as needed.
INSERT INTO public.users (id, full_name, email, role)
SELECT
  au.id,
  COALESCE(au.raw_user_meta_data->>'full_name', au.email) AS full_name,
  au.email,
  COALESCE(
    (au.raw_user_meta_data->>'role')::public.user_role,
    'loan_officer'
  )
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.users pu WHERE pu.id = au.id
)
ON CONFLICT (id) DO NOTHING;

-- Verify the result
SELECT id, full_name, email, role FROM public.users ORDER BY created_at;
