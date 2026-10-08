-- disburse_loan passes p_payment_method as text into transactions.method,
-- which is the payment_method enum. Untyped literals cast; a text argument does not.

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
  v_method          public.payment_method;
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

  IF p_payment_method IS NULL OR btrim(p_payment_method) NOT IN ('cash', 'momo') THEN
    RAISE EXCEPTION 'Payment method must be cash or momo'
      USING ERRCODE = '22023';
  END IF;

  v_method := btrim(p_payment_method)::public.payment_method;

  IF v_method = 'momo' AND (p_momo_reference IS NULL OR btrim(p_momo_reference) = '') THEN
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

  -- A full refinance can leave nothing to pay out. amount must be greater than 0.
  IF v_net_to_client > 0 THEN
    INSERT INTO public.transactions
      (loan_id, client_id, type, amount, direction, method, momo_reference, recorded_by, transaction_date)
    VALUES
      (v_loan.id, v_loan.client_id, 'disbursement', v_net_to_client, 'debit',
       v_method, CASE WHEN v_method = 'momo' THEN btrim(p_momo_reference) END,
       p_actor, v_today);
  END IF;

  IF v_fee > 0 THEN
    INSERT INTO public.transactions
      (loan_id, client_id, type, amount, direction, method, recorded_by, transaction_date)
    VALUES
      (v_loan.id, v_loan.client_id, 'fee', v_fee, 'credit', v_method, p_actor, v_today);
  END IF;

  IF v_loan.previous_loan_id IS NOT NULL AND v_old_balance > 0 THEN
    INSERT INTO public.transactions
      (loan_id, client_id, type, amount, direction, method, recorded_by, transaction_date)
    VALUES
      (v_loan.previous_loan_id, v_loan.client_id, 'repayment', v_old_balance, 'credit',
       'cash'::public.payment_method, p_actor, v_today);

    UPDATE public.loans
       SET status = 'refinanced'
     WHERE id = v_loan.previous_loan_id
       AND status = 'active';
  END IF;

  RETURN v_net_to_client;
END;
$$;

NOTIFY pgrst, 'reload schema';
