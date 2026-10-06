-- Hide super admin profiles from every other role, let managers
-- administer staff, and clear imported operational data.
-- Staff accounts, roles, and business settings are left in place.

-- ============================================================
-- Staff visibility and manager administration
-- ============================================================

DROP POLICY IF EXISTS "users_select_authenticated" ON public.users;

CREATE POLICY "users_select_authenticated"
  ON public.users FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR role IS DISTINCT FROM 'accountant_admin'
    OR public.user_has_role('accountant_admin')
  );

DROP POLICY IF EXISTS "users_manage_manager" ON public.users;

CREATE POLICY "users_manage_manager"
  ON public.users FOR ALL
  TO authenticated
  USING (
    public.user_has_role('manager')
    AND role IS DISTINCT FROM 'accountant_admin'
  )
  WITH CHECK (
    public.user_has_role('manager')
    AND role IS DISTINCT FROM 'accountant_admin'
  );

-- ============================================================
-- Clear imported clients, loans, groups, and related records
-- ============================================================

ALTER TABLE public.transactions DISABLE TRIGGER USER;
ALTER TABLE public.sms_log DISABLE TRIGGER USER;
ALTER TABLE public.audit_log DISABLE TRIGGER USER;
ALTER TABLE public.loans DISABLE TRIGGER USER;
ALTER TABLE public.clients DISABLE TRIGGER USER;
ALTER TABLE public.repayment_schedule DISABLE TRIGGER USER;
ALTER TABLE public.group_members DISABLE TRIGGER USER;
ALTER TABLE public.groups DISABLE TRIGGER USER;

DELETE FROM public.meeting_attendance;
DELETE FROM public.group_meetings;
DELETE FROM public.group_waitlist;
DELETE FROM public.group_documents;
DELETE FROM public.group_notes;
DELETE FROM public.group_members;
DELETE FROM public.sms_log;
DELETE FROM public.transactions WHERE reversal_of IS NOT NULL;
DELETE FROM public.transactions;
DELETE FROM public.repayment_schedule;
UPDATE public.loans SET previous_loan_id = NULL, group_id = NULL;
DELETE FROM public.loans;
DELETE FROM public.client_notes;
DELETE FROM public.client_tasks;
UPDATE public.groups SET leader_id = NULL;
DELETE FROM public.clients;
DELETE FROM public.groups;

DELETE FROM public.audit_log
WHERE table_name IN ('clients', 'loans', 'transactions');

DO $$
BEGIN
  DELETE FROM storage.objects
  WHERE bucket_id IN ('client-photos', 'group-documents');
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

ALTER TABLE public.transactions ENABLE TRIGGER USER;
ALTER TABLE public.sms_log ENABLE TRIGGER USER;
ALTER TABLE public.audit_log ENABLE TRIGGER USER;
ALTER TABLE public.loans ENABLE TRIGGER USER;
ALTER TABLE public.clients ENABLE TRIGGER USER;
ALTER TABLE public.repayment_schedule ENABLE TRIGGER USER;
ALTER TABLE public.group_members ENABLE TRIGGER USER;
ALTER TABLE public.groups ENABLE TRIGGER USER;

ALTER SEQUENCE public.client_sequence RESTART WITH 1;
ALTER SEQUENCE public.group_sequence RESTART WITH 1;

REFRESH MATERIALIZED VIEW public.group_stats;
