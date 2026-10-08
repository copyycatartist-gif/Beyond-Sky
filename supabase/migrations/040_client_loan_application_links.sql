-- A staff member can send one client a private link to apply for a loan.
-- The link is not a login. The client still has to match their account number
-- and phone, then enter a code sent to that phone.

ALTER TYPE public.sms_message_type ADD VALUE IF NOT EXISTS 'application_link';
ALTER TYPE public.sms_message_type ADD VALUE IF NOT EXISTS 'application_code';

CREATE TABLE IF NOT EXISTS public.loan_application_links (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id          UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  created_by         UUID NOT NULL REFERENCES public.users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at         TIMESTAMPTZ NOT NULL,
  used_at            TIMESTAMPTZ,
  revoked_at         TIMESTAMPTZ,
  otp_hash           TEXT,
  otp_expires_at     TIMESTAMPTZ,
  otp_attempts       INTEGER NOT NULL DEFAULT 0,
  otp_sends          INTEGER NOT NULL DEFAULT 0,
  otp_sent_at        TIMESTAMPTZ,
  session_hash       TEXT,
  session_expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_loan_application_links_client
  ON public.loan_application_links (client_id, created_at DESC);

ALTER TABLE public.loan_application_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.loan_application_links FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
