-- Registration no longer collects daily income, guarantor Ghana Card, or relationship.
-- Existing values stay. New rows may leave these columns empty.
-- Loans are not marked ineligible solely because income was not collected.

ALTER TABLE public.clients ALTER COLUMN daily_business_income DROP NOT NULL;
ALTER TABLE public.clients ALTER COLUMN guarantor_national_id DROP NOT NULL;
ALTER TABLE public.clients ALTER COLUMN guarantor_relationship DROP NOT NULL;

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

  SELECT daily_business_income
  INTO v_daily_inc
  FROM public.clients
  WHERE id = NEW.client_id;

  IF v_daily_inc IS NULL OR v_daily_inc <= 0 THEN
    NEW.declared_weekly_income := NULL;
    NEW.eligibility_ratio := NULL;
    NEW.eligibility_flag := NULL;
  ELSE
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
