-- Migration 021: Add archive columns to clients
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES auth.users(id);

-- Index for filtering archived clients
CREATE INDEX IF NOT EXISTS idx_clients_archived ON public.clients(archived_at) WHERE archived_at IS NOT NULL;

-- ============================================================
-- Support for the branch-transfer audit entry
-- ============================================================

-- Allow the custom 'branch_transfer' action (original CHECK only permitted INSERT/UPDATE/DELETE)
ALTER TABLE public.audit_log DROP CONSTRAINT IF EXISTS audit_log_action_check;
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_action_check
  CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'branch_transfer'));

-- audit_log previously had no INSERT policy (rows came only from SECURITY DEFINER triggers).
-- Allow privileged roles to write transfer audit entries directly from the API.
DROP POLICY IF EXISTS "audit_log_insert_privileged" ON public.audit_log;
CREATE POLICY "audit_log_insert_privileged"
  ON public.audit_log FOR INSERT
  TO authenticated
  WITH CHECK (public.user_has_role('manager', 'supervisor', 'accountant_admin'));

-- ============================================================
-- Supervisor needs UPDATE access on clients for archive/transfer
-- (the original policy only allowed loan_officer/manager/accountant_admin)
-- ============================================================
DROP POLICY IF EXISTS "clients_update_loan_officer" ON public.clients;
CREATE POLICY "clients_update_loan_officer"
  ON public.clients FOR UPDATE
  TO authenticated
  USING (
    (public.user_has_role('loan_officer') AND created_by = auth.uid())
    OR public.user_has_role('manager', 'supervisor', 'accountant_admin')
  )
  WITH CHECK (
    (public.user_has_role('loan_officer') AND created_by = auth.uid())
    OR public.user_has_role('manager', 'supervisor', 'accountant_admin')
  );
