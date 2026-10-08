-- The loan ledger shows weekly Sunday terms and monthly Sunday terms.
-- Guarantors are people on the client file, not a second account number.

CREATE OR REPLACE VIEW public.client_ledger_summary AS
SELECT
  t.client_id,
  c.account_number,
  c.full_name,
  t.loan_id,
  l.loan_number,
  l.principal,
  l.total_repayable,
  l.weekly_installment,
  l.term_weeks,
  l.disbursement_date,
  l.status AS loan_status,
  COALESCE(SUM(t.amount) FILTER (
    WHERE t.type = 'disbursement' AND t.direction = 'debit'
  ), 0) AS total_disbursed,
  COALESCE(SUM(t.amount) FILTER (
    WHERE t.type = 'fee' AND t.direction = 'credit'
  ), 0) AS total_fees_collected,
  COALESCE(SUM(t.amount) FILTER (
    WHERE t.type = 'repayment' AND t.direction = 'credit'
  ), 0) AS total_repaid,
  COALESCE(SUM(t.amount) FILTER (
    WHERE t.type = 'reversal'
  ), 0) AS total_reversals,
  l.total_repayable
    - COALESCE(SUM(t.amount) FILTER (
        WHERE t.type = 'repayment' AND t.direction = 'credit'
      ), 0)
    + COALESCE(SUM(t.amount) FILTER (
        WHERE t.type = 'reversal'
      ), 0)
  AS outstanding_balance,
  COALESCE(l.payment_frequency, 'weekly') AS payment_frequency,
  l.term_months
FROM public.transactions t
JOIN public.clients c ON c.id = t.client_id
JOIN public.loans l ON l.id = t.loan_id
GROUP BY
  t.client_id, c.account_number, c.full_name,
  t.loan_id, l.loan_number, l.principal,
  l.total_repayable, l.weekly_installment, l.term_weeks,
  l.disbursement_date, l.status, l.payment_frequency, l.term_months;

ALTER VIEW public.client_ledger_summary SET (security_invoker = true);
REVOKE ALL ON public.client_ledger_summary FROM anon;
GRANT SELECT ON public.client_ledger_summary TO authenticated;

ALTER TABLE public.clients DROP COLUMN IF EXISTS guarantor_account_number;
