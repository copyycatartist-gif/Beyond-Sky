-- Saved request keys survive a new server process.
-- Approved loan terms stay put when settings change.
-- An archived phone or Ghana Card cannot be registered again.

CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  status_code integer,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT idempotency_keys_user_key UNIQUE (user_id, idempotency_key)
);

ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.idempotency_keys FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.prevent_reused_client_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_account text;
  v_archived timestamptz;
BEGIN
  SELECT full_name, account_number, archived_at
    INTO v_name, v_account, v_archived
  FROM public.clients
  WHERE id IS DISTINCT FROM NEW.id
    AND (
      (
        regexp_replace(COALESCE(phone_number, ''), '\s', '', 'g')
          = regexp_replace(COALESCE(NEW.phone_number, ''), '\s', '', 'g')
        AND regexp_replace(COALESCE(NEW.phone_number, ''), '\s', '', 'g') <> ''
      )
      OR (
        upper(btrim(COALESCE(national_id, ''))) = upper(btrim(COALESCE(NEW.national_id, '')))
        AND btrim(COALESCE(NEW.national_id, '')) <> ''
      )
    )
  ORDER BY archived_at NULLS LAST
  LIMIT 1;

  IF v_name IS NOT NULL AND v_archived IS NOT NULL THEN
    RAISE EXCEPTION
      'This phone or Ghana Card belongs to archived client % (%). Restore that account instead of creating a new one.',
      v_name, v_account
      USING ERRCODE = '23505';
  END IF;

  IF v_name IS NOT NULL THEN
    RAISE EXCEPTION
      'This phone or Ghana Card is already used by % (%).',
      v_name, v_account
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clients_prevent_reused_identity ON public.clients;
CREATE TRIGGER clients_prevent_reused_identity
  BEFORE INSERT OR UPDATE OF phone_number, national_id
  ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_reused_client_identity();

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
  v_monthly_inc   NUMERIC;
  v_weekly_inc    NUMERIC;
  v_ratio         NUMERIC;
  v_threshold     NUMERIC;
  v_cycle         INTEGER;
  v_prev_amt      NUMERIC;
  v_rate          NUMERIC;
BEGIN
  -- Rate, term, installment, and fees lock once the loan leaves pending.
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
