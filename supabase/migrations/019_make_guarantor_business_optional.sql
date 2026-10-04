-- Migration 019: Make guarantor_business optional
-- Now that migration 017 added the more granular guarantor_occupation and
-- guarantor_employer columns, the original guarantor_business field is
-- redundant and can be made nullable so that CSV imports without that
-- specific column still succeed.

ALTER TABLE public.clients
  ALTER COLUMN guarantor_business SET DEFAULT 'Trader / Business';

ALTER TABLE public.clients
  ALTER COLUMN guarantor_business DROP NOT NULL;

-- Backfill any existing rows that might have an empty string (just in case)
UPDATE public.clients
   SET guarantor_business = COALESCE(NULLIF(TRIM(guarantor_business), ''), guarantor_occupation, guarantor_employer, 'Trader / Business')
 WHERE guarantor_business IS NULL OR TRIM(guarantor_business) = '';
