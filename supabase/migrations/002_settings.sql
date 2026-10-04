-- Migration 002: Settings table for configurable business rules
-- All business-rule constants are stored here and read at runtime.
-- Never hard-code these values in application logic.

CREATE TABLE IF NOT EXISTS public.settings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key           TEXT NOT NULL UNIQUE,
  value         TEXT NOT NULL,
  description   TEXT,
  updated_by    UUID REFERENCES auth.users(id),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger: auto-update updated_at on any row change
CREATE TRIGGER settings_updated_at
  BEFORE UPDATE ON public.settings
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

-- Default business rules
INSERT INTO public.settings (key, value, description) VALUES
  ('interest_multiplier',       '1.365',  'Flat-rate multiplier applied to principal: total_repayable = principal × interest_multiplier'),
  ('fee_percentage',            '0.05',   'Processing fee as a decimal fraction of principal (0.05 = 5%)'),
  ('max_group_size',            '15',     'Maximum number of active members allowed in a single group'),
  ('term_weeks',                '13',     'Default loan term in weekly installments'),
  ('min_loan_amount',           '1000',   'Minimum loan principal in GHS'),
  ('max_loan_amount',           '5000',   'Maximum loan principal in GHS'),
  ('weeks_to_defaulter_status', '2',      'Consecutive missed weekly installments before a client is flagged as defaulted'),
  ('eligibility_income_ratio',  '0.30',   'Weekly installment must not exceed this fraction of the client''s declared weekly income (weekly_income = daily_income × 7)'),
  ('sms_reminder_days_before',  '1',      'Days before a due date to send a reminder SMS')
ON CONFLICT (key) DO NOTHING;

-- Helper function to read a setting value as NUMERIC
CREATE OR REPLACE FUNCTION public.get_setting_numeric(p_key TEXT)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT value::NUMERIC FROM public.settings WHERE key = p_key LIMIT 1;
$$;

-- Helper function to read a setting value as INTEGER
CREATE OR REPLACE FUNCTION public.get_setting_int(p_key TEXT)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT value::INTEGER FROM public.settings WHERE key = p_key LIMIT 1;
$$;

-- Helper function to read a setting value as TEXT
CREATE OR REPLACE FUNCTION public.get_setting_text(p_key TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT value FROM public.settings WHERE key = p_key LIMIT 1;
$$;
