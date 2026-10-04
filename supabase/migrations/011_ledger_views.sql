-- Migration 011: Derived SQL views — ledger and portfolio analytics

-- ============================================================
-- VIEW: client_ledger_summary
-- Derived purely from the transactions table. Never maintained
-- as a separate table — cannot drift from source of truth.
-- ============================================================
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

  -- Total disbursed (debit, type=disbursement)
  COALESCE(SUM(t.amount) FILTER (
    WHERE t.type = 'disbursement' AND t.direction = 'debit'
  ), 0) AS total_disbursed,

  -- Total fees collected
  COALESCE(SUM(t.amount) FILTER (
    WHERE t.type = 'fee' AND t.direction = 'credit'
  ), 0) AS total_fees_collected,

  -- Total repayments received (excluding reversals of reversals)
  COALESCE(SUM(t.amount) FILTER (
    WHERE t.type = 'repayment' AND t.direction = 'credit'
  ), 0) AS total_repaid,

  -- Net reversals (reversal rows are debit corrections)
  COALESCE(SUM(t.amount) FILTER (
    WHERE t.type = 'reversal'
  ), 0) AS total_reversals,

  -- Outstanding balance = total_repayable - net repaid + reversals
  l.total_repayable
    - COALESCE(SUM(t.amount) FILTER (
        WHERE t.type = 'repayment' AND t.direction = 'credit'
      ), 0)
    + COALESCE(SUM(t.amount) FILTER (
        WHERE t.type = 'reversal'
      ), 0)
  AS outstanding_balance

FROM public.transactions t
JOIN public.clients c ON c.id = t.client_id
JOIN public.loans l ON l.id = t.loan_id
GROUP BY
  t.client_id, c.account_number, c.full_name,
  t.loan_id, l.loan_number, l.principal,
  l.total_repayable, l.weekly_installment, l.term_weeks,
  l.disbursement_date, l.status;

-- ============================================================
-- VIEW: portfolio_summary
-- High-level totals for management dashboard.
-- ============================================================
CREATE OR REPLACE VIEW public.portfolio_summary AS
SELECT
  COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'active')  AS active_loans,
  COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'closed')  AS closed_loans,
  COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'defaulted') AS defaulted_loans,
  COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'pending') AS pending_approvals,

  COALESCE(SUM(t.amount) FILTER (
    WHERE t.type = 'disbursement' AND t.direction = 'debit'
  ), 0) AS total_disbursed,

  COALESCE(SUM(t.amount) FILTER (
    WHERE t.type = 'repayment' AND t.direction = 'credit'
  ), 0) AS total_collected,

  COALESCE(SUM(t.amount) FILTER (
    WHERE t.type = 'fee' AND t.direction = 'credit'
  ), 0) AS total_fees,

  -- Total outstanding (across all active loans)
  COALESCE(SUM(rs.expected_amount - rs.paid_amount) FILTER (
    WHERE rs.status IN ('upcoming', 'partially_paid', 'overdue')
      AND l.status = 'active'
  ), 0) AS total_outstanding

FROM public.loans l
LEFT JOIN public.transactions t ON t.loan_id = l.id
LEFT JOIN public.repayment_schedule rs ON rs.loan_id = l.id;

-- ============================================================
-- VIEW: par_report (Portfolio At Risk)
-- PAR = value of loans with at least one installment overdue /
--       total outstanding portfolio
-- Computes PAR 1, PAR 7, and PAR 30 (days overdue buckets)
-- ============================================================
CREATE OR REPLACE VIEW public.par_report AS
WITH overdue_loans AS (
  SELECT
    rs.loan_id,
    MAX(CURRENT_DATE - rs.due_date) AS max_days_overdue,
    SUM(rs.expected_amount - rs.paid_amount) AS overdue_balance
  FROM public.repayment_schedule rs
  JOIN public.loans l ON l.id = rs.loan_id
  WHERE rs.status IN ('overdue', 'partially_paid')
    AND l.status = 'active'
    AND rs.due_date < CURRENT_DATE
  GROUP BY rs.loan_id
),
total_portfolio AS (
  SELECT
    COALESCE(SUM(rs.expected_amount - rs.paid_amount), 0) AS total_outstanding
  FROM public.repayment_schedule rs
  JOIN public.loans l ON l.id = rs.loan_id
  WHERE rs.status NOT IN ('paid', 'defaulted')
    AND l.status = 'active'
)
SELECT
  tp.total_outstanding,
  COALESCE(SUM(ol.overdue_balance) FILTER (WHERE ol.max_days_overdue >= 1),  0) AS par1_amount,
  COALESCE(SUM(ol.overdue_balance) FILTER (WHERE ol.max_days_overdue >= 7),  0) AS par7_amount,
  COALESCE(SUM(ol.overdue_balance) FILTER (WHERE ol.max_days_overdue >= 30), 0) AS par30_amount,
  CASE WHEN tp.total_outstanding > 0
    THEN ROUND(COALESCE(SUM(ol.overdue_balance) FILTER (WHERE ol.max_days_overdue >= 1), 0) / tp.total_outstanding * 100, 2)
    ELSE 0
  END AS par1_pct,
  CASE WHEN tp.total_outstanding > 0
    THEN ROUND(COALESCE(SUM(ol.overdue_balance) FILTER (WHERE ol.max_days_overdue >= 7), 0) / tp.total_outstanding * 100, 2)
    ELSE 0
  END AS par7_pct,
  CASE WHEN tp.total_outstanding > 0
    THEN ROUND(COALESCE(SUM(ol.overdue_balance) FILTER (WHERE ol.max_days_overdue >= 30), 0) / tp.total_outstanding * 100, 2)
    ELSE 0
  END AS par30_pct
FROM total_portfolio tp
CROSS JOIN (SELECT SUM(overdue_balance) FROM overdue_loans) AS _
LEFT JOIN overdue_loans ol ON TRUE
GROUP BY tp.total_outstanding;

-- ============================================================
-- VIEW: weekly_collection_performance
-- Expected vs actual repayments by week
-- ============================================================
CREATE OR REPLACE VIEW public.weekly_collection_performance AS
SELECT
  date_trunc('week', rs.due_date)::DATE AS week_start,
  COUNT(DISTINCT rs.loan_id) AS loans_due,
  SUM(rs.expected_amount) AS expected_amount,
  SUM(rs.paid_amount) AS collected_amount,
  SUM(rs.expected_amount - rs.paid_amount) AS gap,
  CASE WHEN SUM(rs.expected_amount) > 0
    THEN ROUND(SUM(rs.paid_amount) / SUM(rs.expected_amount) * 100, 2)
    ELSE 0
  END AS collection_rate_pct
FROM public.repayment_schedule rs
JOIN public.loans l ON l.id = rs.loan_id
WHERE l.status IN ('active', 'closed', 'defaulted')
GROUP BY date_trunc('week', rs.due_date)
ORDER BY week_start DESC;

-- ============================================================
-- VIEW: overdue_clients
-- All clients with at least one overdue installment
-- ============================================================
CREATE OR REPLACE VIEW public.overdue_clients AS
SELECT
  c.id AS client_id,
  c.account_number,
  c.full_name,
  c.phone_number,
  c.status AS client_status,
  l.id AS loan_id,
  l.loan_number,
  l.status AS loan_status,
  COUNT(rs.id) AS overdue_installments,
  SUM(rs.expected_amount - rs.paid_amount) AS total_arrears,
  MIN(rs.due_date) AS oldest_overdue_date,
  MAX(CURRENT_DATE - rs.due_date) AS max_days_overdue,
  u.full_name AS loan_officer_name
FROM public.clients c
JOIN public.loans l ON l.client_id = c.id AND l.status IN ('active', 'defaulted')
JOIN public.repayment_schedule rs ON rs.loan_id = l.id
  AND rs.status IN ('overdue', 'partially_paid')
  AND rs.due_date < CURRENT_DATE
JOIN public.users u ON u.id = l.submitted_by
GROUP BY c.id, c.account_number, c.full_name, c.phone_number, c.status,
         l.id, l.loan_number, l.status, u.full_name
ORDER BY max_days_overdue DESC;
