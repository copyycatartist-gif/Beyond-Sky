-- Migration 022: Phone uniqueness constraint and audit improvements

-- Unique constraint on phone_number (partial - only for non-archived clients)
-- First, find and report duplicates (comment out in production)
-- SELECT phone_number, COUNT(*) FROM public.clients WHERE archived_at IS NULL GROUP BY phone_number HAVING COUNT(*) > 1;

-- Add unique index on phone for active (non-archived) clients
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_phone_unique_active 
  ON public.clients(phone_number) 
  WHERE archived_at IS NULL;

-- Add unique index on national_id for active clients  
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_national_id_unique_active
  ON public.clients(national_id)
  WHERE archived_at IS NULL;

-- Audit log: add a changes_diff JSONB column for structured diffs
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS changes_diff JSONB;

-- Function to auto-compute diff on update
CREATE OR REPLACE FUNCTION public.compute_audit_diff()
RETURNS TRIGGER AS $$
DECLARE
  diff JSONB := '{}'::JSONB;
  key TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    FOR key IN SELECT jsonb_object_keys(to_jsonb(NEW))
    LOOP
      IF to_jsonb(NEW)->>key IS DISTINCT FROM to_jsonb(OLD)->>key THEN
        diff := diff || jsonb_build_object(key, jsonb_build_object('old', to_jsonb(OLD)->key, 'new', to_jsonb(NEW)->key));
      END IF;
    END LOOP;
    NEW.changes_diff := diff;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on audit_log inserts to auto-compute diff if old_values and new_values present
DROP TRIGGER IF EXISTS trg_audit_compute_diff ON public.audit_log;
CREATE TRIGGER trg_audit_compute_diff
  BEFORE INSERT ON public.audit_log
  FOR EACH ROW
  WHEN (NEW.old_values IS NOT NULL AND NEW.new_values IS NOT NULL AND NEW.changes_diff IS NULL)
  EXECUTE FUNCTION public.compute_audit_diff();
