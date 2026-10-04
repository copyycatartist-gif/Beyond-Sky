-- Migration 016: Remove test users, clean seed data, install first-user-is-admin trigger
-- Run this in Supabase SQL Editor.
-- This replaces the test user system with standard production-ready auth.

-- =====================================================================
-- 1. Temporarily disable deletion-blocking & audit triggers for cleanup
-- =====================================================================
ALTER TABLE public.transactions DISABLE TRIGGER transactions_no_delete;
ALTER TABLE public.transactions DISABLE TRIGGER transactions_no_update;
ALTER TABLE public.transactions DISABLE TRIGGER transactions_apply_repayment;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_log_no_delete') THEN
    ALTER TABLE public.audit_log DISABLE TRIGGER audit_log_no_delete;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_log_no_update') THEN
    ALTER TABLE public.audit_log DISABLE TRIGGER audit_log_no_update;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_loans') THEN
    ALTER TABLE public.loans DISABLE TRIGGER audit_loans;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_clients') THEN
    ALTER TABLE public.clients DISABLE TRIGGER audit_clients;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_users') THEN
    ALTER TABLE public.users DISABLE TRIGGER audit_users;
  END IF;
END $$;

-- Clear audit logs or detach test user references
UPDATE public.audit_log
SET changed_by = NULL
WHERE changed_by IN (
  '11111111-0000-0000-0000-000000000001',
  '11111111-0000-0000-0000-000000000002',
  '11111111-0000-0000-0000-000000000003',
  '11111111-0000-0000-0000-000000000004'
);

-- =====================================================================
-- 2. Remove test user dependent data (in FK order)
-- =====================================================================
DELETE FROM public.transactions
WHERE recorded_by IN (
  '11111111-0000-0000-0000-000000000001',
  '11111111-0000-0000-0000-000000000002',
  '11111111-0000-0000-0000-000000000003',
  '11111111-0000-0000-0000-000000000004'
);

DELETE FROM public.repayment_schedule
WHERE loan_id IN (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000002',
  'aaaaaaaa-0000-0000-0000-000000000003',
  'aaaaaaaa-0000-0000-0000-000000000004'
);

DELETE FROM public.loans
WHERE id IN (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000002',
  'aaaaaaaa-0000-0000-0000-000000000003',
  'aaaaaaaa-0000-0000-0000-000000000004'
);

DELETE FROM public.group_members
WHERE group_id IN (
  '22222222-0000-0000-0000-000000000001',
  '22222222-0000-0000-0000-000000000002'
);

DELETE FROM public.groups
WHERE id IN (
  '22222222-0000-0000-0000-000000000001',
  '22222222-0000-0000-0000-000000000002'
);

DELETE FROM public.clients
WHERE created_by IN (
  '11111111-0000-0000-0000-000000000001',
  '11111111-0000-0000-0000-000000000002',
  '11111111-0000-0000-0000-000000000003',
  '11111111-0000-0000-0000-000000000004'
);

DELETE FROM public.users
WHERE id IN (
  '11111111-0000-0000-0000-000000000001',
  '11111111-0000-0000-0000-000000000002',
  '11111111-0000-0000-0000-000000000003',
  '11111111-0000-0000-0000-000000000004'
);

-- =====================================================================
-- 3. Remove test users from auth schema
-- =====================================================================
DELETE FROM auth.identities
WHERE provider_id IN (
  'officer@test.local',
  'manager@test.local',
  'supervisor@test.local',
  'admin@test.local'
);

DELETE FROM auth.users
WHERE email IN (
  'officer@test.local',
  'manager@test.local',
  'supervisor@test.local',
  'admin@test.local'
);

-- =====================================================================
-- 4. Re-enable all triggers
-- =====================================================================
ALTER TABLE public.transactions ENABLE TRIGGER transactions_no_delete;
ALTER TABLE public.transactions ENABLE TRIGGER transactions_no_update;
ALTER TABLE public.transactions ENABLE TRIGGER transactions_apply_repayment;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_log_no_delete') THEN
    ALTER TABLE public.audit_log ENABLE TRIGGER audit_log_no_delete;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_log_no_update') THEN
    ALTER TABLE public.audit_log ENABLE TRIGGER audit_log_no_update;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_loans') THEN
    ALTER TABLE public.loans ENABLE TRIGGER audit_loans;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_clients') THEN
    ALTER TABLE public.clients ENABLE TRIGGER audit_clients;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_users') THEN
    ALTER TABLE public.users ENABLE TRIGGER audit_users;
  END IF;
END $$;

-- =====================================================================
-- 5. Reset client sequence
-- =====================================================================
SELECT setval('public.client_sequence', 1, false);

-- =====================================================================
-- 6. Upgrade handle_new_user:
--    - First user ever → accountant_admin (super admin with all permissions)
--    - Subsequent users → role from metadata, or loan_officer default
-- =====================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role    public.user_role := 'loan_officer';
  v_name    TEXT;
  v_count   INTEGER;
BEGIN
  v_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));

  -- Count existing profiles BEFORE this insert
  SELECT COUNT(*) INTO v_count FROM public.users;

  IF v_count = 0 THEN
    -- First user ever — automatically promote to accountant_admin (Super Admin)
    v_role := 'accountant_admin';
  ELSE
    -- Try to use the role from metadata, fall back to loan_officer
    BEGIN
      IF NEW.raw_user_meta_data->>'role' IS NOT NULL
         AND NEW.raw_user_meta_data->>'role' <> '' THEN
        v_role := (NEW.raw_user_meta_data->>'role')::public.user_role;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_role := 'loan_officer';
    END;
  END IF;

  INSERT INTO public.users (id, full_name, email, role, is_active)
  VALUES (NEW.id, v_name, NEW.email, v_role, true)
  ON CONFLICT (id) DO UPDATE SET
    full_name  = EXCLUDED.full_name,
    email      = EXCLUDED.email,
    updated_at = NOW();

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block auth even if profile sync fails
  RETURN NEW;
END;
$$;

-- =====================================================================
-- 7. Ensure the trigger is attached to auth.users
-- =====================================================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================================
-- 8. Schema permissions (idempotent — safe to re-run)
-- =====================================================================
GRANT USAGE ON SCHEMA public
  TO postgres, anon, authenticated, service_role, supabase_auth_admin;
GRANT ALL ON ALL TABLES IN SCHEMA public
  TO postgres, anon, authenticated, service_role, supabase_auth_admin;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public
  TO postgres, anon, authenticated, service_role, supabase_auth_admin;
GRANT ALL ON ALL ROUTINES IN SCHEMA public
  TO postgres, anon, authenticated, service_role, supabase_auth_admin;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role, supabase_auth_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role, supabase_auth_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON ROUTINES TO postgres, anon, authenticated, service_role, supabase_auth_admin;

-- =====================================================================
-- 9. Verification
-- =====================================================================
SELECT
  'auth.users'    AS tbl, COUNT(*) AS rows FROM auth.users
UNION ALL SELECT
  'public.users'  AS tbl, COUNT(*) AS rows FROM public.users
UNION ALL SELECT
  'clients'       AS tbl, COUNT(*) AS rows FROM public.clients
UNION ALL SELECT
  'groups'        AS tbl, COUNT(*) AS rows FROM public.groups
UNION ALL SELECT
  'loans'         AS tbl, COUNT(*) AS rows FROM public.loans;
