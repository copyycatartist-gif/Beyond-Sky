-- Migration 008: Transactions — append-only ledger

CREATE TYPE public.transaction_type AS ENUM (
  'disbursement',  -- loan paid out to client
  'repayment',     -- payment received from client
  'fee',           -- processing fee collected
  'reversal'       -- corrective entry referencing the original
);

CREATE TYPE public.transaction_direction AS ENUM (
  'debit',   -- money going out (disbursement)
  'credit'   -- money coming in (repayment, fee)
);

CREATE TYPE public.payment_method AS ENUM (
  'cash',
  'momo'
);

CREATE TABLE IF NOT EXISTS public.transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id           UUID NOT NULL REFERENCES public.loans(id),
  client_id         UUID NOT NULL REFERENCES public.clients(id),
  type              public.transaction_type NOT NULL,
  amount            NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  direction         public.transaction_direction NOT NULL,
  method            public.payment_method NOT NULL DEFAULT 'cash',
  momo_reference    TEXT,                          -- required when method = 'momo'
  recorded_by       UUID NOT NULL REFERENCES public.users(id),
  transaction_date  DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Reversal chain
  reversal_of       UUID REFERENCES public.transactions(id),
  reversal_reason   TEXT,

  -- Immutable audit fields
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT transactions_momo_ref CHECK (
    method <> 'momo' OR (momo_reference IS NOT NULL AND momo_reference <> '')
  ),
  CONSTRAINT transactions_reversal_needs_reason CHECK (
    type <> 'reversal' OR (reversal_of IS NOT NULL AND reversal_reason IS NOT NULL AND reversal_reason <> '')
  )
);

-- IMPORTANT: No updated_at column — this table is insert-only.
-- No triggers that modify rows after insert are permitted.

CREATE INDEX IF NOT EXISTS idx_transactions_loan ON public.transactions(loan_id);
CREATE INDEX IF NOT EXISTS idx_transactions_client ON public.transactions(client_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON public.transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON public.transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_recorded_by ON public.transactions(recorded_by);

-- ============================================================
-- Enforce append-only: prevent UPDATE and DELETE at the
-- database function level (RLS will also enforce this,
-- but a trigger provides an additional hard stop).
-- ============================================================
CREATE OR REPLACE FUNCTION public.prevent_transaction_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'transactions table is append-only. Corrections must be new rows with type=reversal.'
  USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER transactions_no_update
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_transaction_modification();

CREATE TRIGGER transactions_no_delete
  BEFORE DELETE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_transaction_modification();

-- ============================================================
-- FIFO repayment application function
-- Called when a new 'repayment' transaction is inserted.
-- Applies payment amount to oldest unpaid installment(s) first,
-- carrying forward any overpayment to the next installment.
-- ============================================================
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
BEGIN
  -- Only process repayments (not disbursements, fees, or reversals)
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

    UPDATE public.repayment_schedule
    SET
      paid_amount = v_new_paid,
      status = (CASE
        WHEN v_new_paid >= expected_amount THEN 'paid'
        WHEN v_new_paid > 0               THEN 'partially_paid'
        ELSE status::TEXT
      END)::public.installment_status
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

CREATE TRIGGER transactions_apply_repayment
  AFTER INSERT ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_repayment_fifo();
