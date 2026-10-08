-- Monthly repayment option + disbursement cohorts.
-- Weekly loans keep the existing 13-week / interest_multiplier path.
-- Monthly loans store a flat rate (7/10/15/30%) and a 1–6 month term.
-- interest_multiplier = 1 + rate, and weekly_installment holds the installment
-- amount for both products so existing repayment code keeps working.

ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS payment_frequency TEXT NOT NULL DEFAULT 'weekly',
  ADD COLUMN IF NOT EXISTS term_months INTEGER,
  ADD COLUMN IF NOT EXISTS interest_rate NUMERIC(6,4);

ALTER TABLE public.loans DROP CONSTRAINT IF EXISTS loans_payment_frequency_check;
ALTER TABLE public.loans
  ADD CONSTRAINT loans_payment_frequency_check
  CHECK (payment_frequency IN ('weekly', 'monthly'));

ALTER TABLE public.loans DROP CONSTRAINT IF EXISTS loans_monthly_terms_check;
ALTER TABLE public.loans
  ADD CONSTRAINT loans_monthly_terms_check
  CHECK (
    payment_frequency = 'weekly'
    OR (
      payment_frequency = 'monthly'
      AND term_months BETWEEN 1 AND 6
      AND interest_rate IN (0.07, 0.10, 0.15, 0.30)
    )
  );

-- Disbursement cohorts can exceed the old 15-member solidarity cap.
ALTER TABLE public.groups DROP CONSTRAINT IF EXISTS groups_max_members_check;
ALTER TABLE public.groups
  ADD CONSTRAINT groups_max_members_check
  CHECK (max_members > 0 AND max_members <= 500);

ALTER TABLE public.groups DROP CONSTRAINT IF EXISTS groups_group_type_check;
ALTER TABLE public.groups
  ADD CONSTRAINT groups_group_type_check
  CHECK (group_type IS NULL OR group_type IN ('solidarity', 'individual', 'cooperative', 'disbursement'));

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS cohort_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_cohort_key
  ON public.groups (cohort_key)
  WHERE cohort_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.compute_loan_amounts()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_fee_pct       NUMERIC;
  v_sec_pct       NUMERIC;
  v_risk_pct      NUMERIC;
  v_multiplier    NUMERIC;
  v_term          INTEGER;
  v_daily_inc     NUMERIC;
  v_weekly_inc    NUMERIC;
  v_monthly_inc   NUMERIC;
  v_ratio         NUMERIC;
  v_threshold     NUMERIC;
  v_cycle         INTEGER;
  v_prev_amt      NUMERIC;
  v_rate          NUMERIC;
BEGIN
  v_sec_pct  := COALESCE(NEW.security_deposit_pct, public.get_setting_numeric('security_deposit_percentage'), 0.10);
  v_fee_pct  := COALESCE(NEW.processing_fee_pct, public.get_setting_numeric('processing_fee_percentage'), 0.01);
  v_risk_pct := COALESCE(NEW.loan_risk_fund_pct, public.get_setting_numeric('loan_risk_fund_percentage'), 0.01);

  SELECT COUNT(*), COALESCE(MAX(principal), 0.00)
  INTO v_cycle, v_prev_amt
  FROM public.loans
  WHERE client_id = NEW.client_id AND status IN ('closed', 'active', 'refinanced');

  NEW.cycle_number         := COALESCE(NEW.cycle_number, v_cycle + 1, 1);
  NEW.previous_loan_amount := COALESCE(NEW.previous_loan_amount, v_prev_amt, 0.00);

  NEW.security_deposit_pct    := v_sec_pct;
  NEW.security_deposit_amount := ROUND(NEW.principal * v_sec_pct, 2);
  NEW.processing_fee_pct      := v_fee_pct;
  NEW.processing_fee_amount   := ROUND(NEW.principal * v_fee_pct, 2);
  NEW.loan_risk_fund_pct      := v_risk_pct;
  NEW.loan_risk_fund_amount   := ROUND(NEW.principal * v_risk_pct, 2);
  NEW.fee_amount              := NEW.processing_fee_amount;
  NEW.total_deductions        := NEW.security_deposit_amount + NEW.processing_fee_amount + NEW.loan_risk_fund_amount;
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

  SELECT COALESCE(daily_business_income, 0.00)
  INTO v_daily_inc
  FROM public.clients
  WHERE id = NEW.client_id;

  v_weekly_inc := v_daily_inc * 7;
  v_monthly_inc := v_daily_inc * 26;
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
    NEW.eligibility_flag := 'ineligible';
  ELSIF v_ratio <= v_threshold THEN
    NEW.eligibility_flag := 'eligible';
  ELSIF v_ratio <= v_threshold * 1.5 THEN
    NEW.eligibility_flag := 'caution';
  ELSE
    NEW.eligibility_flag := 'ineligible';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_repayment_schedule()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_i       INTEGER;
  v_due     DATE;
  v_status  public.installment_status;
  v_count   INTEGER;
BEGIN
  IF OLD.status <> 'approved' OR NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;

  IF NEW.disbursement_date IS NULL THEN
    RAISE EXCEPTION 'disbursement_date must be set when activating a loan';
  END IF;

  DELETE FROM public.repayment_schedule WHERE loan_id = NEW.id;

  v_count := CASE
    WHEN COALESCE(NEW.payment_frequency, 'weekly') = 'monthly'
      THEN COALESCE(NEW.term_months, NEW.term_weeks, 1)
    ELSE COALESCE(NEW.term_weeks, 13)
  END;

  FOR v_i IN 1 .. v_count LOOP
    IF COALESCE(NEW.payment_frequency, 'weekly') = 'monthly' THEN
      v_due := (NEW.disbursement_date + (v_i || ' months')::interval)::date;
    ELSE
      v_due := NEW.disbursement_date + (v_i * 7);
    END IF;

    IF v_due < CURRENT_DATE THEN
      v_status := 'overdue'::public.installment_status;
    ELSE
      v_status := 'upcoming'::public.installment_status;
    END IF;

    INSERT INTO public.repayment_schedule (
      loan_id, installment_number, due_date, expected_amount, status
    ) VALUES (
      NEW.id, v_i, v_due, NEW.weekly_installment, v_status
    );
  END LOOP;

  RETURN NEW;
END;
$$;
