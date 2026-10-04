-- Migration 017: Physical Application Form & Contract Terms Schema Expansion
-- Incorporates all fields from the official 2-Page Beyond Sky Microcredit Application Form

-- 1. Create Marital Status enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'marital_status') THEN
    CREATE TYPE public.marital_status AS ENUM (
      'married',
      'unmarried',
      'abandoned',
      'divorced',
      'widow'
    );
  END IF;
END $$;

-- 2. Expand Clients Table
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS branch TEXT DEFAULT 'Makola Branch',
  ADD COLUMN IF NOT EXISTS area TEXT DEFAULT 'Central Area',
  ADD COLUMN IF NOT EXISTS spouse_or_father_name TEXT,
  ADD COLUMN IF NOT EXISTS age INTEGER,
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS monthly_income NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS residential_address TEXT,
  ADD COLUMN IF NOT EXISTS permanent_address TEXT,
  ADD COLUMN IF NOT EXISTS business_address TEXT,
  ADD COLUMN IF NOT EXISTS marital_status public.marital_status DEFAULT 'married',
  ADD COLUMN IF NOT EXISTS religion TEXT,
  ADD COLUMN IF NOT EXISTS place_of_worship TEXT,
  ADD COLUMN IF NOT EXISTS religious_leader_name TEXT,
  ADD COLUMN IF NOT EXISTS religious_leader_phone TEXT,
  -- Detailed Guarantor Info
  ADD COLUMN IF NOT EXISTS guarantor_gender TEXT DEFAULT 'male',
  ADD COLUMN IF NOT EXISTS guarantor_account_number TEXT,
  ADD COLUMN IF NOT EXISTS guarantor_occupation TEXT,
  ADD COLUMN IF NOT EXISTS guarantor_employer TEXT,
  ADD COLUMN IF NOT EXISTS guarantor_dob DATE,
  ADD COLUMN IF NOT EXISTS guarantor_residential_address TEXT,
  ADD COLUMN IF NOT EXISTS guarantor_religion TEXT,
  ADD COLUMN IF NOT EXISTS guarantor_place_of_worship TEXT;

-- 3. Expand Groups Table
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS branch TEXT DEFAULT 'Makola Branch',
  ADD COLUMN IF NOT EXISTS area TEXT DEFAULT 'Central Area',
  ADD COLUMN IF NOT EXISTS meeting_day TEXT DEFAULT 'Monday',
  ADD COLUMN IF NOT EXISTS meeting_place TEXT DEFAULT 'Makola Market Shed';

-- 4. Expand Loans Table with Contract & Security Deductions
ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS cycle_number INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS previous_loan_amount NUMERIC(12,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS monthly_interest_rate NUMERIC(6,2) DEFAULT 12.16,
  ADD COLUMN IF NOT EXISTS security_deposit_pct NUMERIC(6,4) DEFAULT 0.10,
  ADD COLUMN IF NOT EXISTS security_deposit_amount NUMERIC(12,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS processing_fee_pct NUMERIC(6,4) DEFAULT 0.01,
  ADD COLUMN IF NOT EXISTS processing_fee_amount NUMERIC(12,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS loan_risk_fund_pct NUMERIC(6,4) DEFAULT 0.01,
  ADD COLUMN IF NOT EXISTS loan_risk_fund_amount NUMERIC(12,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS total_deductions NUMERIC(12,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS net_disbursement_amount NUMERIC(12,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS penal_interest_rate NUMERIC(6,2) DEFAULT 5.00,
  ADD COLUMN IF NOT EXISTS agreement_town TEXT DEFAULT 'Accra',
  ADD COLUMN IF NOT EXISTS agreement_district TEXT DEFAULT 'Accra Metropolitan',
  ADD COLUMN IF NOT EXISTS agreement_region TEXT DEFAULT 'Greater Accra';

-- 5. Insert new settings for Contract Terms
INSERT INTO public.settings (key, value, description) VALUES
  ('security_deposit_percentage', '0.10', 'Security deposit rate held as collateral (10%)'),
  ('processing_fee_percentage', '0.01', 'Loan processing fee rate (1%)'),
  ('loan_risk_fund_percentage', '0.01', 'Loan risk insurance fund rate (1%)'),
  ('penal_rate_monthly', '0.05', 'Default penal rate per month (5%)'),
  ('default_branch', 'Makola Branch', 'Default operating branch')
ON CONFLICT (key) DO UPDATE SET
  description = EXCLUDED.description;

-- 6. Update compute_loan_amounts trigger to calculate full contract deductions
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
  v_ratio         NUMERIC;
  v_threshold     NUMERIC;
  v_cycle         INTEGER;
  v_prev_amt      NUMERIC;
BEGIN
  -- Read rates from settings or fallback to defaults
  v_sec_pct    := COALESCE(NEW.security_deposit_pct, public.get_setting_numeric('security_deposit_percentage'), 0.10);
  v_fee_pct    := COALESCE(NEW.processing_fee_pct, public.get_setting_numeric('processing_fee_percentage'), 0.01);
  v_risk_pct   := COALESCE(NEW.loan_risk_fund_pct, public.get_setting_numeric('loan_risk_fund_percentage'), 0.01);
  v_multiplier := COALESCE(NEW.interest_multiplier, public.get_setting_numeric('interest_multiplier'), 1.365);
  v_term       := COALESCE(NEW.term_weeks, public.get_setting_int('term_weeks'), 13);

  -- Determine cycle number and previous loan amount automatically
  SELECT COUNT(*), COALESCE(MAX(principal), 0.00)
  INTO v_cycle, v_prev_amt
  FROM public.loans
  WHERE client_id = NEW.client_id AND status IN ('closed', 'active', 'refinanced');

  NEW.cycle_number         := COALESCE(NEW.cycle_number, v_cycle + 1, 1);
  NEW.previous_loan_amount := COALESCE(NEW.previous_loan_amount, v_prev_amt, 0.00);

  -- Snapshot settings into loan row
  NEW.interest_multiplier        := v_multiplier;
  NEW.term_weeks                 := v_term;
  NEW.security_deposit_pct       := v_sec_pct;
  NEW.security_deposit_amount    := ROUND(NEW.principal * v_sec_pct, 2);
  NEW.processing_fee_pct         := v_fee_pct;
  NEW.processing_fee_amount      := ROUND(NEW.principal * v_fee_pct, 2);
  NEW.loan_risk_fund_pct         := v_risk_pct;
  NEW.loan_risk_fund_amount      := ROUND(NEW.principal * v_risk_pct, 2);
  NEW.fee_amount                 := NEW.processing_fee_amount; -- backwards compatibility
  
  -- Total deductions = 10% security + 1% fee + 1% risk fund (12%)
  NEW.total_deductions           := NEW.security_deposit_amount + NEW.processing_fee_amount + NEW.loan_risk_fund_amount;
  NEW.net_disbursement_amount    := NEW.principal - NEW.total_deductions;
  NEW.amount_disbursed_to_client := NEW.net_disbursement_amount;

  NEW.total_repayable            := ROUND(NEW.principal * v_multiplier, 2);
  NEW.weekly_installment         := ROUND(NEW.total_repayable / v_term, 2);

  -- Eligibility calculation
  SELECT COALESCE(daily_business_income, monthly_income / 30.0, 0.00)
  INTO v_daily_inc
  FROM public.clients
  WHERE id = NEW.client_id;

  v_weekly_inc := v_daily_inc * 7;
  NEW.declared_weekly_income := v_weekly_inc;

  IF v_weekly_inc > 0 THEN
    v_ratio     := ROUND(NEW.weekly_installment / v_weekly_inc, 4);
    v_threshold := COALESCE(public.get_setting_numeric('eligibility_income_ratio'), 0.30);
    NEW.eligibility_ratio := v_ratio;

    IF v_ratio <= v_threshold THEN
      NEW.eligibility_flag := 'eligible';
    ELSIF v_ratio <= v_threshold * 1.5 THEN
      NEW.eligibility_flag := 'caution';
    ELSE
      NEW.eligibility_flag := 'ineligible';
    END IF;
  ELSE
    NEW.eligibility_ratio := NULL;
    NEW.eligibility_flag  := 'ineligible';
  END IF;

  RETURN NEW;
END;
$$;
