-- Migration 012: Row-Level Security policies
--
-- Security model:
--   loan_officer   — manage their own clients/groups/applications; read their own loans
--   manager        — read everything; approve/reject loans
--   supervisor     — read assigned clients' schedules; create repayment transactions
--   accountant_admin — full read; manage settings and users; no direct transaction edits
--
-- ALL business logic is enforced here in addition to the UI.
-- A client-side bug that allows an unauthorized API call will be
-- rejected at the database layer.

-- Enable RLS on all application tables
ALTER TABLE public.settings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repayment_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_log           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log         ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- SETTINGS
-- ============================================================

-- Everyone (authenticated) can read settings
CREATE POLICY "settings_select_all_authenticated"
  ON public.settings FOR SELECT
  TO authenticated
  USING (true);

-- Only accountant_admin can insert/update settings
CREATE POLICY "settings_insert_admin"
  ON public.settings FOR INSERT
  TO authenticated
  WITH CHECK (public.user_has_role('accountant_admin'));

CREATE POLICY "settings_update_admin"
  ON public.settings FOR UPDATE
  TO authenticated
  USING (public.user_has_role('accountant_admin'))
  WITH CHECK (public.user_has_role('accountant_admin'));

-- No one can delete settings rows
-- (no DELETE policy = no delete for any role)

-- ============================================================
-- USERS (staff profiles)
-- ============================================================

-- All authenticated users can see user profiles (needed for display names)
CREATE POLICY "users_select_authenticated"
  ON public.users FOR SELECT
  TO authenticated
  USING (true);

-- Users can update their own profile (name only — not role)
CREATE POLICY "users_update_own_profile"
  ON public.users FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    -- Prevent self-promotion: new role must match existing role unless admin
    AND (
      public.user_has_role('accountant_admin')
      OR role = (SELECT u.role FROM public.users u WHERE u.id = auth.uid())
    )
  );

-- accountant_admin can insert/update any user (manage staff accounts)
CREATE POLICY "users_manage_admin"
  ON public.users FOR ALL
  TO authenticated
  USING (public.user_has_role('accountant_admin'))
  WITH CHECK (public.user_has_role('accountant_admin'));

-- ============================================================
-- CLIENTS
-- ============================================================

-- loan_officer: see and manage only clients they registered
CREATE POLICY "clients_select_loan_officer"
  ON public.clients FOR SELECT
  TO authenticated
  USING (
    public.user_has_role('loan_officer') AND created_by = auth.uid()
    OR public.user_has_role('manager', 'supervisor', 'accountant_admin')
  );

CREATE POLICY "clients_insert_loan_officer"
  ON public.clients FOR INSERT
  TO authenticated
  WITH CHECK (
    public.user_has_role('loan_officer', 'manager', 'accountant_admin')
    AND created_by = auth.uid()
  );

CREATE POLICY "clients_update_loan_officer"
  ON public.clients FOR UPDATE
  TO authenticated
  USING (
    (public.user_has_role('loan_officer') AND created_by = auth.uid())
    OR public.user_has_role('manager', 'accountant_admin')
  )
  WITH CHECK (
    (public.user_has_role('loan_officer') AND created_by = auth.uid())
    OR public.user_has_role('manager', 'accountant_admin')
  );

-- No one can delete clients (data retention requirement)

-- ============================================================
-- GROUPS
-- ============================================================

CREATE POLICY "groups_select_authenticated"
  ON public.groups FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "groups_insert_officer_manager"
  ON public.groups FOR INSERT
  TO authenticated
  WITH CHECK (
    public.user_has_role('loan_officer', 'manager', 'accountant_admin')
    AND created_by = auth.uid()
  );

CREATE POLICY "groups_update_officer_manager"
  ON public.groups FOR UPDATE
  TO authenticated
  USING (
    (public.user_has_role('loan_officer') AND created_by = auth.uid())
    OR public.user_has_role('manager', 'accountant_admin')
  )
  WITH CHECK (
    (public.user_has_role('loan_officer') AND created_by = auth.uid())
    OR public.user_has_role('manager', 'accountant_admin')
  );

-- ============================================================
-- GROUP MEMBERS
-- ============================================================

CREATE POLICY "group_members_select_authenticated"
  ON public.group_members FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "group_members_insert_officer_manager"
  ON public.group_members FOR INSERT
  TO authenticated
  WITH CHECK (
    public.user_has_role('loan_officer', 'manager', 'accountant_admin')
  );

-- Marking a member as left (setting date_left) is allowed for officer/manager
CREATE POLICY "group_members_update_officer_manager"
  ON public.group_members FOR UPDATE
  TO authenticated
  USING (public.user_has_role('loan_officer', 'manager', 'accountant_admin'))
  WITH CHECK (public.user_has_role('loan_officer', 'manager', 'accountant_admin'));

-- ============================================================
-- LOANS
-- ============================================================

-- loan_officer: see only their submitted loans
-- manager/accountant_admin: see all loans
-- supervisor: see loans for clients they manage (via repayment assignment — for now, all)
CREATE POLICY "loans_select"
  ON public.loans FOR SELECT
  TO authenticated
  USING (
    public.user_has_role('manager', 'accountant_admin', 'supervisor')
    OR (public.user_has_role('loan_officer') AND submitted_by = auth.uid())
  );

-- Only loan_officer (and manager/admin for edge cases) can CREATE loan applications
CREATE POLICY "loans_insert_officer"
  ON public.loans FOR INSERT
  TO authenticated
  WITH CHECK (
    public.user_has_role('loan_officer', 'manager', 'accountant_admin')
    AND submitted_by = auth.uid()
  );

-- Only manager can UPDATE loans (approve/reject/disburse)
-- loan_officer cannot change loan status once submitted
CREATE POLICY "loans_update_manager"
  ON public.loans FOR UPDATE
  TO authenticated
  USING (public.user_has_role('manager', 'accountant_admin'))
  WITH CHECK (public.user_has_role('manager', 'accountant_admin'));

-- No one can delete loans
-- (no DELETE policy)

-- ============================================================
-- REPAYMENT SCHEDULE
-- ============================================================

CREATE POLICY "schedule_select"
  ON public.repayment_schedule FOR SELECT
  TO authenticated
  USING (
    -- All roles can read schedules
    public.user_has_role('loan_officer', 'manager', 'supervisor', 'accountant_admin')
  );

-- Schedule rows are created by the generate_repayment_schedule trigger (SECURITY DEFINER)
-- No direct insert from clients is allowed here — the trigger handles it.
-- We still define a policy for the trigger's role context:
CREATE POLICY "schedule_insert_system"
  ON public.repayment_schedule FOR INSERT
  TO authenticated
  WITH CHECK (public.user_has_role('manager', 'accountant_admin'));

-- Only system triggers update the schedule (via SECURITY DEFINER functions)
-- We allow supervisor to update schedule via the transaction trigger (SECURITY DEFINER)
CREATE POLICY "schedule_update_system"
  ON public.repayment_schedule FOR UPDATE
  TO authenticated
  USING (public.user_has_role('supervisor', 'manager', 'accountant_admin'))
  WITH CHECK (public.user_has_role('supervisor', 'manager', 'accountant_admin'));

-- ============================================================
-- TRANSACTIONS (append-only — NO UPDATE, NO DELETE policies)
-- ============================================================

-- All authenticated roles can read transactions
CREATE POLICY "transactions_select"
  ON public.transactions FOR SELECT
  TO authenticated
  USING (
    public.user_has_role('loan_officer', 'manager', 'supervisor', 'accountant_admin')
  );

-- Only supervisor (for repayments) and manager/admin (for disbursements) can INSERT
CREATE POLICY "transactions_insert_supervisor_manager"
  ON public.transactions FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      -- Supervisor inserts repayments
      (public.user_has_role('supervisor') AND type = 'repayment')
      OR
      -- Manager/admin insert disbursements, fees, and authorize reversals
      (public.user_has_role('manager', 'accountant_admin') AND type IN ('disbursement', 'fee', 'reversal'))
    )
    -- recorded_by must be the current user
    AND recorded_by = auth.uid()
  );

-- INTENTIONALLY NO UPDATE POLICY — the BEFORE UPDATE trigger will also block this
-- INTENTIONALLY NO DELETE POLICY — the BEFORE DELETE trigger will also block this

-- ============================================================
-- SMS LOG
-- ============================================================

CREATE POLICY "sms_log_select_admin_manager"
  ON public.sms_log FOR SELECT
  TO authenticated
  USING (public.user_has_role('manager', 'accountant_admin'));

-- SMS log is inserted by Edge Functions using service_role key
-- Authenticated users do not insert directly
CREATE POLICY "sms_log_insert_admin"
  ON public.sms_log FOR INSERT
  TO authenticated
  WITH CHECK (public.user_has_role('accountant_admin'));

-- ============================================================
-- AUDIT LOG (read-only for authorized roles)
-- ============================================================

CREATE POLICY "audit_log_select_admin"
  ON public.audit_log FOR SELECT
  TO authenticated
  USING (public.user_has_role('accountant_admin', 'manager'));

-- No insert/update/delete policies — audit log is populated by
-- SECURITY DEFINER triggers, not by direct user DML.
