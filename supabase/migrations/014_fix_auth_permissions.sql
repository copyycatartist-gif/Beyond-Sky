-- Migration 014: Fix Auth permissions & link identities for seed users
-- Run this in the Supabase SQL Editor.
-- Safe to run multiple times.

-- =====================================================================
-- 1. Grant schema permissions to GoTrue (supabase_auth_admin)
--    This fixes "Database error querying schema" and "Database error
--    checking email" errors on every login / createUser attempt.
-- =====================================================================
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role, supabase_auth_admin;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role, supabase_auth_admin;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role, supabase_auth_admin;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role, supabase_auth_admin;

-- Ensure future tables also get these grants automatically
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role, supabase_auth_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role, supabase_auth_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON ROUTINES TO postgres, anon, authenticated, service_role, supabase_auth_admin;

-- =====================================================================
-- 2. Ensure auth.users rows have valid GoTrue password hashes + metadata
-- =====================================================================
UPDATE auth.users
SET
  aud = 'authenticated',
  role = 'authenticated',
  encrypted_password = crypt('TestPass123!', gen_salt('bf')),
  email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
  confirmation_token = '',
  recovery_token = '',
  raw_app_meta_data = '{"provider":"email","providers":["email"]}',
  raw_user_meta_data = jsonb_build_object(
    'full_name', CASE email
      WHEN 'officer@test.local'    THEN 'Ama Osei'
      WHEN 'manager@test.local'    THEN 'Kwame Mensah'
      WHEN 'supervisor@test.local' THEN 'Efua Asante'
      ELSE 'Kofi Boateng'
    END,
    'role', CASE email
      WHEN 'officer@test.local'    THEN 'loan_officer'
      WHEN 'manager@test.local'    THEN 'manager'
      WHEN 'supervisor@test.local' THEN 'supervisor'
      ELSE 'accountant_admin'
    END
  ),
  is_super_admin = false,
  updated_at = NOW()
WHERE email IN (
  'officer@test.local',
  'manager@test.local',
  'supervisor@test.local',
  'admin@test.local'
);

-- =====================================================================
-- 3. Add missing auth.identities rows (GoTrue requires these for
--    email/password authentication to work)
-- =====================================================================
INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
)
SELECT
  au.id,                   -- identity id = user id (standard for email provider)
  au.id,                   -- user_id
  jsonb_build_object(
    'sub',            au.id::text,
    'email',          au.email,
    'email_verified', true,
    'phone_verified', false
  ),
  'email',
  au.email,                -- provider_id = email for email provider
  NOW(),
  NOW(),
  NOW()
FROM auth.users au
WHERE au.email IN (
  'officer@test.local',
  'manager@test.local',
  'supervisor@test.local',
  'admin@test.local'
)
ON CONFLICT (provider, provider_id) DO UPDATE
  SET
    identity_data = EXCLUDED.identity_data,
    updated_at = NOW();

-- =====================================================================
-- 4. Recreate handle_new_user as SECURITY DEFINER with error handling
-- =====================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role public.user_role := 'loan_officer';
  v_name TEXT;
BEGIN
  v_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email);

  BEGIN
    IF NEW.raw_user_meta_data->>'role' IS NOT NULL
       AND NEW.raw_user_meta_data->>'role' <> '' THEN
      v_role := (NEW.raw_user_meta_data->>'role')::public.user_role;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_role := 'loan_officer';
  END;

  INSERT INTO public.users (id, full_name, email, role)
  VALUES (NEW.id, v_name, NEW.email, v_role)
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email     = EXCLUDED.email;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never abort auth.users insertion even if profile sync fails
  RETURN NEW;
END;
$$;

-- =====================================================================
-- 5. Verify — confirm identities and users are in sync
-- =====================================================================
SELECT
  au.email,
  au.encrypted_password IS NOT NULL AS has_password,
  au.email_confirmed_at IS NOT NULL AS email_confirmed,
  ai.provider_id IS NOT NULL        AS has_identity,
  pu.role                           AS profile_role
FROM auth.users au
LEFT JOIN auth.identities ai ON ai.user_id = au.id AND ai.provider = 'email'
LEFT JOIN public.users pu   ON pu.id = au.id
WHERE au.email IN (
  'officer@test.local',
  'manager@test.local',
  'supervisor@test.local',
  'admin@test.local'
)
ORDER BY au.email;
