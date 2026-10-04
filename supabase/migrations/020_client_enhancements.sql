-- Migration 020: Client enhancements
-- Adds: notes, tier, watchlist, emergency contact, dormancy, consent, data completeness

-- 0. Required extension for trigram GIN indexes below (gin_trgm_ops)
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- 1. New columns on clients table
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS tier TEXT CHECK (tier IN ('bronze', 'silver', 'gold', 'platinum')) DEFAULT 'bronze',
  ADD COLUMN IF NOT EXISTS is_watchlisted BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS watchlist_reason TEXT,
  ADD COLUMN IF NOT EXISTS watchlisted_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS watchlisted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_relationship TEXT,
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS is_dormant BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS data_protection_consent BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS consent_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS id_document_url TEXT,
  ADD COLUMN IF NOT EXISTS profile_completeness SMALLINT DEFAULT 0;

-- 2. Client notes history table (append-only memo log)
CREATE TABLE IF NOT EXISTS public.client_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  note_text TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.client_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read client notes"
  ON public.client_notes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Staff can insert client notes"
  ON public.client_notes FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 3. Follow-up tasks table
CREATE TABLE IF NOT EXISTS public.client_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE NOT NULL,
  status TEXT CHECK (status IN ('pending', 'completed', 'cancelled')) DEFAULT 'pending',
  assigned_to UUID REFERENCES auth.users(id),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE public.client_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read tasks"
  ON public.client_tasks FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Staff can manage tasks"
  ON public.client_tasks FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 4. Index for search performance
CREATE INDEX IF NOT EXISTS idx_clients_full_name_trgm ON public.clients USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON public.clients (phone_number);
CREATE INDEX IF NOT EXISTS idx_clients_national_id ON public.clients (national_id);
CREATE INDEX IF NOT EXISTS idx_clients_status ON public.clients (status);
CREATE INDEX IF NOT EXISTS idx_clients_branch ON public.clients (branch);
CREATE INDEX IF NOT EXISTS idx_clients_tier ON public.clients (tier);
CREATE INDEX IF NOT EXISTS idx_clients_last_activity ON public.clients (last_activity_at);
CREATE INDEX IF NOT EXISTS idx_client_notes_client ON public.client_notes (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_tasks_client ON public.client_tasks (client_id, status);

-- 5. Function to compute profile completeness
CREATE OR REPLACE FUNCTION public.compute_profile_completeness(client_row public.clients)
RETURNS SMALLINT AS $$
DECLARE
  total_fields INT := 20;
  filled INT := 0;
BEGIN
  IF client_row.full_name IS NOT NULL AND client_row.full_name != '' THEN filled := filled + 1; END IF;
  IF client_row.phone_number IS NOT NULL AND client_row.phone_number != '' THEN filled := filled + 1; END IF;
  IF client_row.national_id IS NOT NULL AND client_row.national_id != '' THEN filled := filled + 1; END IF;
  IF client_row.spouse_or_father_name IS NOT NULL AND client_row.spouse_or_father_name != '' THEN filled := filled + 1; END IF;
  IF client_row.age IS NOT NULL THEN filled := filled + 1; END IF;
  IF client_row.date_of_birth IS NOT NULL THEN filled := filled + 1; END IF;
  IF client_row.residential_address IS NOT NULL AND client_row.residential_address != '' THEN filled := filled + 1; END IF;
  IF client_row.permanent_address IS NOT NULL AND client_row.permanent_address != '' THEN filled := filled + 1; END IF;
  IF client_row.business_address IS NOT NULL AND client_row.business_address != '' THEN filled := filled + 1; END IF;
  IF client_row.business_type IS NOT NULL AND client_row.business_type != '' THEN filled := filled + 1; END IF;
  IF client_row.market_location IS NOT NULL AND client_row.market_location != '' THEN filled := filled + 1; END IF;
  IF client_row.monthly_income IS NOT NULL THEN filled := filled + 1; END IF;
  IF client_row.religion IS NOT NULL AND client_row.religion != '' THEN filled := filled + 1; END IF;
  IF client_row.place_of_worship IS NOT NULL AND client_row.place_of_worship != '' THEN filled := filled + 1; END IF;
  IF client_row.religious_leader_name IS NOT NULL AND client_row.religious_leader_name != '' THEN filled := filled + 1; END IF;
  IF client_row.religious_leader_phone IS NOT NULL AND client_row.religious_leader_phone != '' THEN filled := filled + 1; END IF;
  IF client_row.guarantor_name IS NOT NULL AND client_row.guarantor_name != '' THEN filled := filled + 1; END IF;
  IF client_row.guarantor_phone IS NOT NULL AND client_row.guarantor_phone != '' THEN filled := filled + 1; END IF;
  IF client_row.guarantor_national_id IS NOT NULL AND client_row.guarantor_national_id != '' THEN filled := filled + 1; END IF;
  IF client_row.guarantor_residential_address IS NOT NULL AND client_row.guarantor_residential_address != '' THEN filled := filled + 1; END IF;

  RETURN ROUND((filled::NUMERIC / total_fields) * 100)::SMALLINT;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 6. Trigger to auto-compute profile completeness on insert/update
CREATE OR REPLACE FUNCTION public.set_profile_completeness()
RETURNS TRIGGER AS $$
BEGIN
  NEW.profile_completeness := public.compute_profile_completeness(NEW);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_profile_completeness ON public.clients;
CREATE TRIGGER trg_profile_completeness
  BEFORE INSERT OR UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.set_profile_completeness();

-- 7. Trigger to update last_activity_at on loan/repayment events
CREATE OR REPLACE FUNCTION public.update_client_last_activity()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.clients SET last_activity_at = NOW() WHERE id = NEW.client_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_loan_activity ON public.loans;
CREATE TRIGGER trg_loan_activity
  AFTER INSERT OR UPDATE ON public.loans
  FOR EACH ROW
  EXECUTE FUNCTION public.update_client_last_activity();

DROP TRIGGER IF EXISTS trg_transaction_activity ON public.transactions;
CREATE TRIGGER trg_transaction_activity
  AFTER INSERT ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_client_last_activity();

-- 8. Dormancy check function (called by cron)
CREATE OR REPLACE FUNCTION public.mark_dormant_clients(days_inactive INT DEFAULT 90)
RETURNS INT AS $$
DECLARE
  affected INT;
BEGIN
  UPDATE public.clients
  SET is_dormant = TRUE
  WHERE status = 'active'
    AND is_dormant = FALSE
    AND last_activity_at < NOW() - (days_inactive || ' days')::INTERVAL;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Backfill profile completeness for existing clients
UPDATE public.clients SET profile_completeness = public.compute_profile_completeness(clients);

-- 10. Tier computation function based on loan cycles
CREATE OR REPLACE FUNCTION public.compute_client_tier(p_client_id UUID)
RETURNS TEXT AS $$
DECLARE
  closed_loans INT;
  defaulted_loans INT;
BEGIN
  SELECT COUNT(*) INTO closed_loans FROM public.loans
    WHERE client_id = p_client_id AND status = 'closed';
  SELECT COUNT(*) INTO defaulted_loans FROM public.loans
    WHERE client_id = p_client_id AND status = 'defaulted';

  IF defaulted_loans > 0 THEN RETURN 'bronze'; END IF;
  IF closed_loans >= 5 THEN RETURN 'platinum'; END IF;
  IF closed_loans >= 3 THEN RETURN 'gold'; END IF;
  IF closed_loans >= 1 THEN RETURN 'silver'; END IF;
  RETURN 'bronze';
END;
$$ LANGUAGE plpgsql STABLE;
