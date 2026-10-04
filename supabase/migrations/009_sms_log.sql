-- Migration 009: SMS log

CREATE TYPE public.sms_message_type AS ENUM (
  'reminder',    -- sent before due date
  'confirmation', -- sent after repayment recorded
  'approval',    -- sent when loan approved
  'disbursement', -- sent when loan disbursed
  'overdue',     -- sent when installment is overdue
  'defaulter'    -- sent when client is flagged as defaulted
);

CREATE TYPE public.sms_status AS ENUM (
  'sent',
  'failed',
  'pending'
);

CREATE TABLE IF NOT EXISTS public.sms_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         UUID REFERENCES public.clients(id),
  loan_id           UUID REFERENCES public.loans(id),
  message_type      public.sms_message_type NOT NULL,
  phone             TEXT NOT NULL,
  message_body      TEXT NOT NULL,
  status            public.sms_status NOT NULL DEFAULT 'pending',
  provider          TEXT NOT NULL DEFAULT 'arkesel',
  provider_response JSONB,
  sent_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- This table is also append-only (SMS sends are historical records)
CREATE OR REPLACE FUNCTION public.prevent_sms_log_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'sms_log is append-only' USING ERRCODE = '42501';
  END IF;
  -- Allow UPDATE only for updating status/provider_response (not the message content)
  IF TG_OP = 'UPDATE' THEN
    IF OLD.message_body <> NEW.message_body OR OLD.phone <> NEW.phone THEN
      RAISE EXCEPTION 'sms_log message content is immutable' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sms_log_no_delete
  BEFORE DELETE ON public.sms_log
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_sms_log_modification();

CREATE TRIGGER sms_log_immutable_content
  BEFORE UPDATE ON public.sms_log
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_sms_log_modification();

CREATE INDEX IF NOT EXISTS idx_sms_log_client ON public.sms_log(client_id);
CREATE INDEX IF NOT EXISTS idx_sms_log_status ON public.sms_log(status);
CREATE INDEX IF NOT EXISTS idx_sms_log_sent_at ON public.sms_log(sent_at DESC);
