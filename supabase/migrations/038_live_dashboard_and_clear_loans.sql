-- The dashboard joined every payment to every Sunday installment, so the
-- totals were the real cash figures multiplied by the length of the schedule.
-- Count each side on its own. Also stop stamping Makola as the branch, and
-- remove the loan book so the office can start from an empty portfolio.

CREATE OR REPLACE VIEW public.portfolio_summary AS
SELECT
  (SELECT COUNT(*) FROM public.loans WHERE status = 'active') AS active_loans,
  (SELECT COUNT(*) FROM public.loans WHERE status = 'closed') AS closed_loans,
  (SELECT COUNT(*) FROM public.loans WHERE status = 'defaulted') AS defaulted_loans,
  (SELECT COUNT(*) FROM public.loans WHERE status = 'pending') AS pending_approvals,
  (SELECT COALESCE(SUM(amount), 0) FROM public.transactions
    WHERE type = 'disbursement' AND direction = 'debit') AS total_disbursed,
  (SELECT COALESCE(SUM(amount), 0) FROM public.transactions
    WHERE type = 'repayment' AND direction = 'credit') AS total_collected,
  (SELECT COALESCE(SUM(amount), 0) FROM public.transactions
    WHERE type = 'fee' AND direction = 'credit') AS total_fees,
  (SELECT COALESCE(SUM(rs.expected_amount - rs.paid_amount), 0)
     FROM public.repayment_schedule rs
     JOIN public.loans l ON l.id = rs.loan_id
    WHERE l.status = 'active'
      AND rs.status IN ('upcoming', 'partially_paid', 'overdue')) AS total_outstanding;

ALTER VIEW public.portfolio_summary SET (security_invoker = true);
REVOKE ALL ON public.portfolio_summary FROM anon;
GRANT SELECT ON public.portfolio_summary TO authenticated;

ALTER TABLE public.clients ALTER COLUMN branch DROP DEFAULT;
ALTER TABLE public.groups ALTER COLUMN branch DROP DEFAULT;
ALTER TABLE public.groups ALTER COLUMN meeting_place DROP DEFAULT;

UPDATE public.clients SET branch = NULL WHERE branch ILIKE '%makola%';
UPDATE public.groups SET branch = NULL WHERE branch ILIKE '%makola%';
UPDATE public.groups SET meeting_place = NULL WHERE meeting_place ILIKE '%makola%';
DELETE FROM public.settings WHERE key = 'default_branch';

ALTER TABLE public.transactions DISABLE TRIGGER USER;
ALTER TABLE public.sms_log DISABLE TRIGGER USER;
ALTER TABLE public.audit_log DISABLE TRIGGER USER;
ALTER TABLE public.loans DISABLE TRIGGER USER;
ALTER TABLE public.repayment_schedule DISABLE TRIGGER USER;
ALTER TABLE public.group_members DISABLE TRIGGER USER;
ALTER TABLE public.groups DISABLE TRIGGER USER;

DELETE FROM public.sms_log WHERE loan_id IS NOT NULL;
DELETE FROM public.transactions WHERE reversal_of IS NOT NULL;
DELETE FROM public.transactions;
DELETE FROM public.repayment_schedule;
UPDATE public.loans SET previous_loan_id = NULL, group_id = NULL;
DELETE FROM public.loans;
DELETE FROM public.idempotency_keys;

DELETE FROM public.group_members
WHERE group_id IN (SELECT id FROM public.groups WHERE group_type = 'disbursement');
DELETE FROM public.groups WHERE group_type = 'disbursement';

DELETE FROM public.audit_log
WHERE table_name IN ('loans', 'transactions', 'repayment_schedule');

ALTER TABLE public.transactions ENABLE TRIGGER USER;
ALTER TABLE public.sms_log ENABLE TRIGGER USER;
ALTER TABLE public.audit_log ENABLE TRIGGER USER;
ALTER TABLE public.loans ENABLE TRIGGER USER;
ALTER TABLE public.repayment_schedule ENABLE TRIGGER USER;
ALTER TABLE public.group_members ENABLE TRIGGER USER;
ALTER TABLE public.groups ENABLE TRIGGER USER;

DO $$
BEGIN
  REFRESH MATERIALIZED VIEW public.group_stats;
EXCEPTION
  WHEN undefined_table THEN
    NULL;
END $$;

NOTIFY pgrst, 'reload schema';
