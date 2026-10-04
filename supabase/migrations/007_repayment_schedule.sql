-- Migration 007: Repayment schedule

CREATE TYPE public.installment_status AS ENUM (
  'upcoming',       -- not yet due
  'paid',           -- fully paid
  'partially_paid', -- partially paid
  'overdue',        -- past due date, not fully paid
  'defaulted'       -- part of a defaulted loan
);

CREATE TABLE IF NOT EXISTS public.repayment_schedule (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id             UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  installment_number  INTEGER NOT NULL CHECK (installment_number BETWEEN 1 AND 52),
  due_date            DATE NOT NULL,
  expected_amount     NUMERIC(12,2) NOT NULL,   -- weekly_installment, fixed
  paid_amount         NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  balance             NUMERIC(12,2) GENERATED ALWAYS AS (expected_amount - paid_amount) STORED,
  status              public.installment_status NOT NULL DEFAULT 'upcoming',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_loan_installment UNIQUE (loan_id, installment_number),
  CONSTRAINT repayment_paid_amount_cap CHECK (paid_amount >= 0)
);

CREATE TRIGGER repayment_schedule_updated_at
  BEFORE UPDATE ON public.repayment_schedule
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

CREATE INDEX IF NOT EXISTS idx_schedule_loan ON public.repayment_schedule(loan_id);
CREATE INDEX IF NOT EXISTS idx_schedule_due_date ON public.repayment_schedule(due_date);
CREATE INDEX IF NOT EXISTS idx_schedule_status ON public.repayment_schedule(status);

-- ============================================================
-- Generate repayment schedule rows when a loan is disbursed
-- (loan.status changes from 'approved' to 'active')
-- ============================================================
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

  DELETE FROM public.repayment_schedule WHERE loan_id = NEW.id;

  FOR v_i IN 1 .. NEW.term_weeks LOOP
    v_due := NEW.disbursement_date + (v_i * 7);
    IF v_due < CURRENT_DATE THEN
      v_status := 'overdue'::public.installment_status;
    ELSE
      v_status := 'upcoming'::public.installment_status;
    END IF;

    INSERT INTO public.repayment_schedule (
      loan_id, installment_number, due_date, expected_amount, status
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

CREATE TRIGGER loans_generate_schedule
  AFTER UPDATE ON public.loans
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_repayment_schedule();
