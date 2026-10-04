-- Migration 018: Fix Disbursement Installment Status Type Cast Error
-- Resolves: column "status" is of type installment_status but expression is of type text
-- Run this in your Supabase SQL Editor.

-- 1. Create an implicit cast from text to installment_status so Postgres never rejects text assignments
CREATE OR REPLACE FUNCTION public.cast_text_to_installment_status(val text)
RETURNS public.installment_status AS $$
BEGIN
  RETURN val::public.installment_status;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_cast c
    JOIN pg_type s ON c.castsource = s.oid
    JOIN pg_type t ON c.casttarget = t.oid
    WHERE s.typname = 'text' AND t.typname = 'installment_status'
  ) THEN
    CREATE CAST (text AS public.installment_status)
    WITH FUNCTION public.cast_text_to_installment_status(text)
    AS IMPLICIT;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Fallback if cast already exists or system permissions prevent global cast
  NULL;
END $$;

-- 2. Upgrade generate_repayment_schedule trigger function with strictly-typed enum variable
CREATE OR REPLACE FUNCTION public.generate_repayment_schedule()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_i           INTEGER;
  v_due         DATE;
  v_status      public.installment_status;
BEGIN
  -- Only fire when transitioning to 'active' (i.e., disbursement)
  IF OLD.status <> 'approved' OR NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;

  IF NEW.disbursement_date IS NULL THEN
    RAISE EXCEPTION 'disbursement_date must be set when activating a loan';
  END IF;

  -- Clear any pre-existing schedule rows for this loan to avoid primary key conflicts
  DELETE FROM public.repayment_schedule WHERE loan_id = NEW.id;

  FOR v_i IN 1 .. NEW.term_weeks LOOP
    v_due := NEW.disbursement_date + (v_i * 7);

    IF v_due < CURRENT_DATE THEN
      v_status := 'overdue'::public.installment_status;
    ELSE
      v_status := 'upcoming'::public.installment_status;
    END IF;

    INSERT INTO public.repayment_schedule (
      loan_id,
      installment_number,
      due_date,
      expected_amount,
      status
    ) VALUES (
      NEW.id,
      v_i,
      v_due,
      NEW.weekly_installment,
      v_status
    );
  END LOOP;

  RETURN NEW;
END;
$$;

-- 3. Upgrade apply_repayment_fifo trigger function with strictly-typed enum variable
CREATE OR REPLACE FUNCTION public.apply_repayment_fifo()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_remaining     NUMERIC;
  v_schedule_row  RECORD;
  v_apply         NUMERIC;
  v_new_paid      NUMERIC;
  v_balance       NUMERIC;
  v_status        public.installment_status;
BEGIN
  -- Only process repayments
  IF NEW.type <> 'repayment' THEN
    RETURN NEW;
  END IF;

  v_remaining := NEW.amount;

  -- Walk installments in ascending order (FIFO: oldest first)
  FOR v_schedule_row IN
    SELECT id, expected_amount, paid_amount, status
    FROM   public.repayment_schedule
    WHERE  loan_id = NEW.loan_id
      AND  status NOT IN ('paid', 'defaulted')
    ORDER BY installment_number ASC
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_balance  := v_schedule_row.expected_amount - v_schedule_row.paid_amount;
    v_apply    := LEAST(v_remaining, v_balance);
    v_new_paid := v_schedule_row.paid_amount + v_apply;
    v_remaining := v_remaining - v_apply;

    IF v_new_paid >= v_schedule_row.expected_amount THEN
      v_status := 'paid'::public.installment_status;
    ELSIF v_new_paid > 0 THEN
      v_status := 'partially_paid'::public.installment_status;
    ELSE
      v_status := v_schedule_row.status;
    END IF;

    UPDATE public.repayment_schedule
    SET
      paid_amount = v_new_paid,
      status = v_status
    WHERE id = v_schedule_row.id;
  END LOOP;

  -- Check if all installments are paid — if so, close the loan
  IF NOT EXISTS (
    SELECT 1 FROM public.repayment_schedule
    WHERE loan_id = NEW.loan_id
      AND status NOT IN ('paid')
  ) THEN
    UPDATE public.loans SET status = 'closed' WHERE id = NEW.loan_id;
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Re-attach triggers to be 100% sure they are active
DROP TRIGGER IF EXISTS loans_generate_schedule ON public.loans;
CREATE TRIGGER loans_generate_schedule
  AFTER UPDATE ON public.loans
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_repayment_schedule();

DROP TRIGGER IF EXISTS transactions_apply_repayment ON public.transactions;
CREATE TRIGGER transactions_apply_repayment
  AFTER INSERT ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_repayment_fifo();
