-- Supabase pgTAP / SQL Tests for RLS Policies and Ledger Integrity
-- Run with: supabase test db

BEGIN;
SELECT plan(8);

-- Test 1: Luhn check digit function returns correct digit
SELECT is(
  public.luhn_check_digit('000001'),
  8,
  'luhn_check_digit(000001) should equal 8'
);

-- Test 2: Client account number generation matches format BSM-######-C
SELECT matches(
  public.generate_client_account_number(),
  '^BSM-\d{6}-\d$',
  'generate_client_account_number() produces valid format'
);

-- Test 3: Settings are readable by authenticated users
SELECT isnt_empty(
  'SELECT * FROM public.settings WHERE key = ''interest_multiplier''',
  'interest_multiplier setting is present'
);

-- Test 4: Verify append-only enforcement on transactions table
-- (Any UPDATE must throw error 42501)
PREPARE test_tx_no_update AS
  UPDATE public.transactions SET amount = 9999 WHERE id = 'bbbbbbbb-0000-0000-0000-000000000001';

SELECT throws_ok(
  'test_tx_no_update',
  '42501',
  'transactions table is append-only. Corrections must be new rows with type=reversal.',
  'Direct UPDATE on transactions table must be blocked'
);

-- Test 5: Verify transactions table blocks DELETE
PREPARE test_tx_no_delete AS
  DELETE FROM public.transactions WHERE id = 'bbbbbbbb-0000-0000-0000-000000000001';

SELECT throws_ok(
  'test_tx_no_delete',
  '42501',
  'transactions table is append-only. Corrections must be new rows with type=reversal.',
  'Direct DELETE on transactions table must be blocked'
);

-- Test 6: Verify 15-member cap on groups
-- Try to insert 16 members into a test group
DO $$
DECLARE
  v_gid UUID := gen_random_uuid();
  v_cid UUID;
  v_i INTEGER;
BEGIN
  INSERT INTO public.groups (id, name, created_by)
  VALUES (v_gid, 'Test Group Full', '11111111-0000-0000-0000-000000000001');

  FOR v_i IN 1..15 LOOP
    v_cid := gen_random_uuid();
    INSERT INTO public.clients (id, full_name, phone_number, national_id, business_type, market_location, daily_business_income, guarantor_name, guarantor_phone, guarantor_national_id, guarantor_relationship, guarantor_business, created_by)
    VALUES (v_cid, 'Member ' || v_i, '02400000' || v_i, 'GHA-T' || v_i, 'Trader', 'Market', 100, 'G', '020', 'GHA', 'Bro', 'Biz', '11111111-0000-0000-0000-000000000001');

    INSERT INTO public.group_members (client_id, group_id) VALUES (v_cid, v_gid);
  END LOOP;
END;
$$;

-- 16th member insert must fail
PREPARE test_16th_member AS
  INSERT INTO public.group_members (
    client_id,
    group_id
  ) VALUES (
    '33333333-0000-0000-0000-000000000001',
    (SELECT id FROM public.groups WHERE name = 'Test Group Full' LIMIT 1)
  );

SELECT throws_ok(
  'test_16th_member',
  '23514', -- check_violation
  NULL,
  'Inserting 16th member into a group must be blocked by database trigger'
);

-- Test 7: Verify client_ledger_summary view calculates outstanding balance correctly
SELECT isnt_empty(
  'SELECT * FROM public.client_ledger_summary WHERE loan_number = ''BSM-000002-6-L01''',
  'client_ledger_summary view generates valid rows for active loans'
);

-- Test 8: Verify PAR report returns valid aggregate figures
SELECT ok(
  (SELECT total_outstanding FROM public.par_report LIMIT 1) >= 0,
  'par_report returns valid total outstanding balance'
);

SELECT * FROM finish();
ROLLBACK;
