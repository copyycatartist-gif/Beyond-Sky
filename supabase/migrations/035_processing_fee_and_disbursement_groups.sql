-- Processing fee is 5% by default and comes from business settings.
-- Security deposit and the risk fund stay at zero.
-- Solidarity groups and meeting records are removed. Disbursement groups stay.

CREATE OR REPLACE FUNCTION public.compute_loan_amounts()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_multiplier    NUMERIC;
  v_term          INTEGER;
  v_monthly_inc   NUMERIC;
  v_weekly_inc    NUMERIC;
  v_ratio         NUMERIC;
  v_threshold     NUMERIC;
  v_cycle         INTEGER;
  v_prev_amt      NUMERIC;
  v_rate          NUMERIC;
  v_fee_pct       NUMERIC;
BEGIN
  -- Rate, term, installment, and any historical deduction lock once the loan leaves pending.
  -- Cash actually sent can still be written at disbursement.
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM 'pending' THEN
    NEW.principal := OLD.principal;
    NEW.payment_frequency := OLD.payment_frequency;
    NEW.interest_rate := OLD.interest_rate;
    NEW.interest_multiplier := OLD.interest_multiplier;
    NEW.term_weeks := OLD.term_weeks;
    NEW.term_months := OLD.term_months;
    NEW.total_repayable := OLD.total_repayable;
    NEW.weekly_installment := OLD.weekly_installment;
    NEW.security_deposit_pct := OLD.security_deposit_pct;
    NEW.security_deposit_amount := OLD.security_deposit_amount;
    NEW.processing_fee_pct := OLD.processing_fee_pct;
    NEW.processing_fee_amount := OLD.processing_fee_amount;
    NEW.loan_risk_fund_pct := OLD.loan_risk_fund_pct;
    NEW.loan_risk_fund_amount := OLD.loan_risk_fund_amount;
    NEW.fee_amount := OLD.fee_amount;
    NEW.total_deductions := OLD.total_deductions;
    NEW.net_disbursement_amount := OLD.net_disbursement_amount;
    NEW.declared_weekly_income := OLD.declared_weekly_income;
    NEW.eligibility_ratio := OLD.eligibility_ratio;
    NEW.eligibility_flag := OLD.eligibility_flag;
    RETURN NEW;
  END IF;

  SELECT COUNT(*), COALESCE(MAX(principal), 0.00)
  INTO v_cycle, v_prev_amt
  FROM public.loans
  WHERE client_id = NEW.client_id AND status IN ('closed', 'active', 'refinanced');

  NEW.cycle_number         := COALESCE(NEW.cycle_number, v_cycle + 1, 1);
  NEW.previous_loan_amount := COALESCE(NEW.previous_loan_amount, v_prev_amt, 0.00);

  v_fee_pct := COALESCE(
    public.get_setting_numeric('processing_fee_percentage'),
    public.get_setting_numeric('fee_percentage'),
    0.05
  );
  IF v_fee_pct IS NULL OR v_fee_pct < 0 THEN
    v_fee_pct := 0;
  END IF;

  NEW.security_deposit_pct    := 0;
  NEW.security_deposit_amount := 0;
  NEW.processing_fee_pct      := v_fee_pct;
  NEW.processing_fee_amount   := ROUND(NEW.principal * v_fee_pct, 2);
  NEW.loan_risk_fund_pct      := 0;
  NEW.loan_risk_fund_amount   := 0;
  NEW.fee_amount              := NEW.processing_fee_amount;
  NEW.total_deductions        := NEW.processing_fee_amount;
  NEW.net_disbursement_amount := NEW.principal - NEW.total_deductions;
  NEW.amount_disbursed_to_client := NEW.net_disbursement_amount;

  IF COALESCE(NEW.payment_frequency, 'weekly') = 'monthly' THEN
    v_rate := NEW.interest_rate;
    IF v_rate IS NULL OR v_rate NOT IN (0.07, 0.10, 0.15, 0.30) THEN
      v_rate := 0.10;
    END IF;
    v_term := COALESCE(NEW.term_months, 1);
    IF v_term < 1 THEN v_term := 1; END IF;
    IF v_term > 6 THEN v_term := 6; END IF;

    NEW.payment_frequency   := 'monthly';
    NEW.interest_rate       := v_rate;
    NEW.term_months         := v_term;
    NEW.term_weeks          := v_term;
    NEW.interest_multiplier := 1 + v_rate;
    NEW.total_repayable     := ROUND(NEW.principal * NEW.interest_multiplier, 2);
    NEW.weekly_installment  := ROUND(NEW.total_repayable / v_term, 2);
  ELSE
    v_multiplier := COALESCE(NEW.interest_multiplier, public.get_setting_numeric('interest_multiplier'), 1.365);
    v_term       := COALESCE(NULLIF(NEW.term_weeks, 0), public.get_setting_int('term_weeks'), 13);
    IF v_term < 1 THEN v_term := 13; END IF;

    NEW.payment_frequency   := 'weekly';
    NEW.term_months         := NULL;
    NEW.interest_rate       := NULL;
    NEW.interest_multiplier := v_multiplier;
    NEW.term_weeks          := v_term;
    NEW.total_repayable     := ROUND(NEW.principal * v_multiplier, 2);
    NEW.weekly_installment  := ROUND(NEW.total_repayable / v_term, 2);
  END IF;

  SELECT monthly_income
  INTO v_monthly_inc
  FROM public.clients
  WHERE id = NEW.client_id;

  IF v_monthly_inc IS NULL OR v_monthly_inc <= 0 THEN
    NEW.declared_weekly_income := NULL;
    NEW.eligibility_ratio := NULL;
    NEW.eligibility_flag := NULL;
  ELSE
    v_weekly_inc := ROUND(v_monthly_inc * 12 / 52, 2);
    NEW.declared_weekly_income := v_weekly_inc;
    v_threshold := COALESCE(public.get_setting_numeric('eligibility_income_ratio'), 0.30);

    IF NEW.payment_frequency = 'monthly' AND v_monthly_inc > 0 THEN
      v_ratio := ROUND(NEW.weekly_installment / v_monthly_inc, 4);
    ELSIF v_weekly_inc > 0 THEN
      v_ratio := ROUND(NEW.weekly_installment / v_weekly_inc, 4);
    ELSE
      v_ratio := NULL;
    END IF;

    NEW.eligibility_ratio := v_ratio;
    IF v_ratio IS NULL THEN
      NEW.eligibility_flag := NULL;
    ELSIF v_ratio <= v_threshold THEN
      NEW.eligibility_flag := 'eligible';
    ELSIF v_ratio <= v_threshold * 1.5 THEN
      NEW.eligibility_flag := 'caution';
    ELSE
      NEW.eligibility_flag := 'ineligible';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


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

  IF v_loan.previous_loan_id IS NOT NULL THEN
    SELECT COALESCE(outstanding_balance, 0) INTO v_old_balance
    FROM public.client_ledger_summary
    WHERE loan_id = v_loan.previous_loan_id;

    v_old_balance := GREATEST(0, COALESCE(v_old_balance, 0));
  END IF;

  v_fee := COALESCE(v_loan.processing_fee_amount, v_loan.fee_amount, 0);
  v_net_to_client := GREATEST(0, v_loan.principal - v_fee - v_old_balance);

  UPDATE public.loans
     SET status = 'active',
         disbursement_date = v_today,
         amount_disbursed_to_client = v_net_to_client
   WHERE id = v_loan.id;

  INSERT INTO public.transactions
    (loan_id, client_id, type, amount, direction, method, momo_reference, recorded_by, transaction_date)
  VALUES
    (v_loan.id, v_loan.client_id, 'disbursement', v_net_to_client, 'debit',
     p_payment_method, CASE WHEN p_payment_method = 'momo' THEN btrim(p_momo_reference) END,
     p_actor, v_today);

  IF v_fee > 0 THEN
    INSERT INTO public.transactions
      (loan_id, client_id, type, amount, direction, method, recorded_by, transaction_date)
    VALUES
      (v_loan.id, v_loan.client_id, 'fee', v_fee, 'credit', p_payment_method, p_actor, v_today);
  END IF;

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


GRANT EXECUTE ON FUNCTION public.disburse_loan(UUID, TEXT, TEXT, UUID) TO authenticated, service_role;

UPDATE public.settings
SET value = '0.05',
    description = 'Processing fee taken from the principal before cash is paid out. 0.05 means 5%.'
WHERE key IN ('processing_fee_percentage', 'fee_percentage');

INSERT INTO public.settings (key, value, description)
SELECT 'processing_fee_percentage', '0.05', 'Processing fee taken from the principal before cash is paid out. 0.05 means 5%.'
WHERE NOT EXISTS (SELECT 1 FROM public.settings WHERE key = 'processing_fee_percentage');

UPDATE public.settings
SET value = '0',
    description = 'Unused. No security deposit is taken.'
WHERE key = 'security_deposit_percentage';

UPDATE public.settings
SET value = '0',
    description = 'Unused. No loan risk fund is taken.'
WHERE key = 'loan_risk_fund_percentage';

ALTER TABLE public.loans DISABLE TRIGGER loans_compute_amounts;

UPDATE public.loans
SET security_deposit_pct = 0,
    security_deposit_amount = 0,
    processing_fee_pct = COALESCE(public.get_setting_numeric('processing_fee_percentage'), 0.05),
    processing_fee_amount = ROUND(principal * COALESCE(public.get_setting_numeric('processing_fee_percentage'), 0.05), 2),
    loan_risk_fund_pct = 0,
    loan_risk_fund_amount = 0,
    fee_amount = ROUND(principal * COALESCE(public.get_setting_numeric('processing_fee_percentage'), 0.05), 2),
    total_deductions = ROUND(principal * COALESCE(public.get_setting_numeric('processing_fee_percentage'), 0.05), 2),
    net_disbursement_amount = principal - ROUND(principal * COALESCE(public.get_setting_numeric('processing_fee_percentage'), 0.05), 2),
    amount_disbursed_to_client = principal - ROUND(principal * COALESCE(public.get_setting_numeric('processing_fee_percentage'), 0.05), 2)
WHERE status IN ('pending', 'approved');

ALTER TABLE public.loans ENABLE TRIGGER loans_compute_amounts;

DELETE FROM public.meeting_attendance;
DELETE FROM public.group_meetings;

UPDATE public.loans
SET group_id = NULL
WHERE group_id IN (
  SELECT id FROM public.groups WHERE COALESCE(group_type, '') <> 'disbursement'
);

DELETE FROM public.group_members
WHERE group_id IN (
  SELECT id FROM public.groups WHERE COALESCE(group_type, '') <> 'disbursement'
);

DELETE FROM public.groups
WHERE COALESCE(group_type, '') <> 'disbursement';

UPDATE public.groups
SET meeting_day = NULL,
    meeting_place = NULL
WHERE group_type = 'disbursement';

NOTIFY pgrst, 'reload schema';
