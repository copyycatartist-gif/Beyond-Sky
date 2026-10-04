-- Migration 026: Loan integrity — atomic disbursement, status state machine, constraints
-- Consolidates the fee/deduction model so the disbursement net-cash figure uses the
-- authoritative 12% total_deductions (not the legacy 1% fee_amount), and makes the
-- multi-step disbursement write atomic via a single SECURITY DEFINER RPC.

-- ============================================================
-- 1. Constraints (#99)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'loans_term_weeks_positive'
  ) THEN
    ALTER TABLE public.loans
      ADD CONSTRAINT loans_term_weeks_positive CHECK (term_weeks > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'loans_deductions_non_negative'
  ) THEN
    ALTER TABLE public.loans
      ADD CONSTRAINT loans_deductions_non_negative CHECK (total_deductions >= 0);
  END IF;
END $$;

-- ============================================================
-- 2. Status state-machine guard (#100)
-- Only legal loan_status transitions are permitted. Same-status
-- no-op updates are always allowed.
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_loan_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- No status change: allow (e.g. editing other fields)
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF (OLD.status, NEW.status) IN (
    ('pending',    'approved'),
    ('pending',    'rejected'),
    ('approved',   'active'),      -- disbursement
    ('approved',   'rejected'),
    ('approved',   'pending'),     -- revoke approval back to review
    ('active',     'closed'),
    ('active',     'defaulted'),
    ('active',     'refinanced'),
    ('defaulted',  'closed'),
    ('defaulted',  'active')       -- reinstatement after arrears cleared
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Illegal loan status transition: % -> %', OLD.status, NEW.status
    USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS loans_status_transition ON public.loans;
CREATE TRIGGER loans_status_transition
  BEFORE UPDATE ON public.loans
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_loan_status_transition();

-- ============================================================
-- 3. Atomic disbursement RPC (#81, #82, #84, #97)
-- Runs the whole disbursement in ONE transaction:
--   * validates the loan is 'approved'
--   * computes net cash = principal - total_deductions - refinance_balance
--   * activates the loan (fires generate_repayment_schedule)
--   * posts the disbursement debit + processing-fee credit
--   * nets off and marks the previous loan 'refinanced' (errors checked)
-- Returns the net amount disbursed to the client.
-- ============================================================
CREATE OR REPLACE FUNCTION public.disburse_loan(
  p_loan_id        UUID,
  p_payment_method TEXT DEFAULT 'cash',
  p_momo_reference TEXT DEFAULT NULL,
  p_actor          UUID DEFAULT auth.uid()
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_loan            public.loans%ROWTYPE;
  v_old_balance     NUMERIC(12,2) := 0;
  v_net_to_client   NUMERIC(12,2);
  v_fee             NUMERIC(12,2);
  v_today           DATE := CURRENT_DATE;
BEGIN
  SELECT * INTO v_loan FROM public.loans WHERE id = p_loan_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loan not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_loan.status <> 'approved' THEN
    RAISE EXCEPTION 'Loan must be approved to disburse (current: %)', v_loan.status
      USING ERRCODE = '22023';
  END IF;

  IF p_payment_method = 'momo' AND (p_momo_reference IS NULL OR btrim(p_momo_reference) = '') THEN
    RAISE EXCEPTION 'MoMo reference is required for mobile-money disbursement'
      USING ERRCODE = '22023';
  END IF;

  -- Refinancing: outstanding balance on the linked previous loan
  IF v_loan.previous_loan_id IS NOT NULL THEN
    SELECT COALESCE(outstanding_balance, 0) INTO v_old_balance
    FROM public.client_ledger_summary
    WHERE loan_id = v_loan.previous_loan_id;

    v_old_balance := GREATEST(0, COALESCE(v_old_balance, 0));
  END IF;

  -- Authoritative deductions: prefer stored total_deductions, recompute if absent
  v_fee := COALESCE(v_loan.processing_fee_amount, v_loan.fee_amount, 0);
  v_net_to_client := GREATEST(
    0,
    v_loan.principal - COALESCE(v_loan.total_deductions, v_fee) - v_old_balance
  );

  -- Activate the loan (AFTER UPDATE trigger builds the repayment schedule)
  UPDATE public.loans
     SET status = 'active',
         disbursement_date = v_today,
         amount_disbursed_to_client = v_net_to_client
   WHERE id = v_loan.id;

  -- Disbursement debit (cash out to client)
  INSERT INTO public.transactions
    (loan_id, client_id, type, amount, direction, method, momo_reference, recorded_by, transaction_date)
  VALUES
    (v_loan.id, v_loan.client_id, 'disbursement', v_net_to_client, 'debit',
     p_payment_method, CASE WHEN p_payment_method = 'momo' THEN btrim(p_momo_reference) END,
     p_actor, v_today);

  -- Processing-fee credit (revenue recognised immediately)
  IF v_fee > 0 THEN
    INSERT INTO public.transactions
      (loan_id, client_id, type, amount, direction, method, recorded_by, transaction_date)
    VALUES
      (v_loan.id, v_loan.client_id, 'fee', v_fee, 'credit', p_payment_method, p_actor, v_today);
  END IF;

  -- Refinancing close-out (previously unchecked — now errors propagate & roll back)
  IF v_loan.previous_loan_id IS NOT NULL AND v_old_balance > 0 THEN
    INSERT INTO public.transactions
      (loan_id, client_id, type, amount, direction, method, recorded_by, transaction_date)
    VALUES
      (v_loan.previous_loan_id, v_loan.client_id, 'repayment', v_old_balance, 'credit',
       'cash', p_actor, v_today);

    UPDATE public.loans
       SET status = 'refinanced'
     WHERE id = v_loan.previous_loan_id
       AND status = 'active';
  END IF;

  RETURN v_net_to_client;
END;
$$;

-- Only the service role / authenticated managers should invoke it; RLS on the
-- underlying tables still applies to direct writes. Grant to authenticated.
GRANT EXECUTE ON FUNCTION public.disburse_loan(UUID, TEXT, TEXT, UUID) TO authenticated;

-- ============================================================
-- 4. Loan status transition audit action allowance
-- audit_log.action CHECK only permits INSERT/UPDATE/DELETE, which the
-- generic trigger already satisfies; no change needed here.
-- ============================================================
