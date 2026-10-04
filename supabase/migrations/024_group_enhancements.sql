-- Migration 024: Comprehensive Lending Groups enhancements
-- Adds meetings, roles, waitlist, documents, notes, expanded status, group_id on loans

-- 1. Expand group_status enum
ALTER TYPE public.group_status ADD VALUE IF NOT EXISTS 'suspended';
ALTER TYPE public.group_status ADD VALUE IF NOT EXISTS 'dissolved';
ALTER TYPE public.group_status ADD VALUE IF NOT EXISTS 'forming';

-- 2. Add new columns to groups table
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS leader_id UUID REFERENCES public.clients(id);
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS group_type TEXT DEFAULT 'solidarity' CHECK (group_type IN ('solidarity', 'individual', 'cooperative'));
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS formed_at DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES auth.users(id);
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS dissolution_reason TEXT;
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS min_member_tenure_days INT DEFAULT 0;
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS require_guarantor_chain BOOLEAN DEFAULT false;

-- 3. Add role and removal_reason to group_members
ALTER TABLE public.group_members ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'member' CHECK (role IN ('leader', 'treasurer', 'secretary', 'member'));
ALTER TABLE public.group_members ADD COLUMN IF NOT EXISTS removal_reason TEXT;
ALTER TABLE public.group_members ADD COLUMN IF NOT EXISTS removed_by UUID REFERENCES auth.users(id);
ALTER TABLE public.group_members ADD COLUMN IF NOT EXISTS attendance_count INT DEFAULT 0;
ALTER TABLE public.group_members ADD COLUMN IF NOT EXISTS contributions_total NUMERIC(12,2) DEFAULT 0;

-- 4. Group meetings table
CREATE TABLE IF NOT EXISTS public.group_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  meeting_date DATE NOT NULL,
  meeting_place TEXT,
  agenda TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_group_meeting_date UNIQUE (group_id, meeting_date)
);

CREATE INDEX idx_group_meetings_group ON public.group_meetings(group_id, meeting_date DESC);

-- 5. Meeting attendance table
CREATE TABLE IF NOT EXISTS public.meeting_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.group_meetings(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'absent', 'excused', 'late')),
  notes TEXT,
  recorded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_attendance UNIQUE (meeting_id, client_id)
);

CREATE INDEX idx_attendance_meeting ON public.meeting_attendance(meeting_id);
CREATE INDEX idx_attendance_client ON public.meeting_attendance(client_id);

-- 6. Group waitlist table
CREATE TABLE IF NOT EXISTS public.group_waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  priority INT DEFAULT 0,
  date_added TIMESTAMPTZ DEFAULT now(),
  added_by UUID REFERENCES auth.users(id),
  notes TEXT,
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'promoted', 'expired', 'removed')),
  CONSTRAINT unique_waitlist_entry UNIQUE (group_id, client_id)
);

CREATE INDEX idx_waitlist_group ON public.group_waitlist(group_id, priority DESC, date_added ASC);

-- 7. Group documents table
CREATE TABLE IF NOT EXISTS public.group_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  document_type TEXT DEFAULT 'other' CHECK (document_type IN ('constitution', 'minutes', 'photo', 'agreement', 'other')),
  file_url TEXT NOT NULL,
  file_size INT,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_group_documents_group ON public.group_documents(group_id);

-- 8. Group notes table
CREATE TABLE IF NOT EXISTS public.group_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_group_notes_group ON public.group_notes(group_id, created_at DESC);

-- 9. Add group_id to loans table (optional link)
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES public.groups(id);
CREATE INDEX IF NOT EXISTS idx_loans_group ON public.loans(group_id) WHERE group_id IS NOT NULL;

-- 10. RLS policies for new tables
ALTER TABLE public.group_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_notes ENABLE ROW LEVEL SECURITY;

-- group_meetings policies
CREATE POLICY "group_meetings_select" ON public.group_meetings FOR SELECT TO authenticated USING (true);
CREATE POLICY "group_meetings_insert" ON public.group_meetings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "group_meetings_update" ON public.group_meetings FOR UPDATE TO authenticated USING (true);
CREATE POLICY "group_meetings_delete" ON public.group_meetings FOR DELETE TO authenticated USING (true);

-- meeting_attendance policies
CREATE POLICY "attendance_select" ON public.meeting_attendance FOR SELECT TO authenticated USING (true);
CREATE POLICY "attendance_insert" ON public.meeting_attendance FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "attendance_update" ON public.meeting_attendance FOR UPDATE TO authenticated USING (true);

-- group_waitlist policies
CREATE POLICY "waitlist_select" ON public.group_waitlist FOR SELECT TO authenticated USING (true);
CREATE POLICY "waitlist_insert" ON public.group_waitlist FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "waitlist_update" ON public.group_waitlist FOR UPDATE TO authenticated USING (true);
CREATE POLICY "waitlist_delete" ON public.group_waitlist FOR DELETE TO authenticated USING (true);

-- group_documents policies
CREATE POLICY "documents_select" ON public.group_documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "documents_insert" ON public.group_documents FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "documents_delete" ON public.group_documents FOR DELETE TO authenticated USING (true);

-- group_notes policies
CREATE POLICY "notes_select" ON public.group_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "notes_insert" ON public.group_notes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "notes_delete" ON public.group_notes FOR DELETE TO authenticated USING (true);

-- 11. Function: auto-deactivate empty groups
CREATE OR REPLACE FUNCTION public.check_group_empty()
RETURNS TRIGGER AS $$
DECLARE
  active_count INT;
BEGIN
  SELECT COUNT(*) INTO active_count
  FROM public.group_members
  WHERE group_id = OLD.group_id AND date_left IS NULL;

  IF active_count = 0 THEN
    UPDATE public.groups
    SET status = 'inactive', updated_at = now()
    WHERE id = OLD.group_id AND status = 'active';
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_check_group_empty ON public.group_members;
CREATE TRIGGER trg_check_group_empty
  AFTER UPDATE OF date_left ON public.group_members
  FOR EACH ROW
  WHEN (NEW.date_left IS NOT NULL AND OLD.date_left IS NULL)
  EXECUTE FUNCTION public.check_group_empty();

-- 12. Function: auto-promote from waitlist when slot opens
CREATE OR REPLACE FUNCTION public.promote_from_waitlist()
RETURNS TRIGGER AS $$
DECLARE
  next_client UUID;
  current_count INT;
  max_cap INT;
BEGIN
  SELECT COUNT(*) INTO current_count
  FROM public.group_members
  WHERE group_id = OLD.group_id AND date_left IS NULL;

  SELECT max_members INTO max_cap FROM public.groups WHERE id = OLD.group_id;

  IF current_count < max_cap THEN
    SELECT client_id INTO next_client
    FROM public.group_waitlist
    WHERE group_id = OLD.group_id AND status = 'waiting'
    ORDER BY priority DESC, date_added ASC
    LIMIT 1;

    IF next_client IS NOT NULL THEN
      INSERT INTO public.group_members (group_id, client_id, date_joined)
      VALUES (OLD.group_id, next_client, CURRENT_DATE)
      ON CONFLICT DO NOTHING;

      UPDATE public.group_waitlist
      SET status = 'promoted'
      WHERE group_id = OLD.group_id AND client_id = next_client AND status = 'waiting';
    END IF;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_promote_waitlist ON public.group_members;
CREATE TRIGGER trg_promote_waitlist
  AFTER UPDATE OF date_left ON public.group_members
  FOR EACH ROW
  WHEN (NEW.date_left IS NOT NULL AND OLD.date_left IS NULL)
  EXECUTE FUNCTION public.promote_from_waitlist();

-- 13. Materialized view for group stats
CREATE MATERIALIZED VIEW IF NOT EXISTS public.group_stats AS
SELECT
  g.id,
  g.group_number,
  g.name,
  g.branch,
  g.status,
  g.max_members,
  COUNT(gm.id) FILTER (WHERE gm.date_left IS NULL) AS active_members,
  COUNT(gm.id) FILTER (WHERE gm.date_left IS NOT NULL) AS former_members,
  COUNT(DISTINCT l.id) AS total_loans,
  COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'active') AS active_loans,
  COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'defaulted') AS defaulted_loans,
  COALESCE(SUM(l.principal) FILTER (WHERE l.status IN ('active', 'closed', 'defaulted')), 0) AS total_disbursed,
  COALESCE(SUM(l.total_repayable) FILTER (WHERE l.status IN ('active', 'defaulted')), 0) AS total_outstanding
FROM public.groups g
LEFT JOIN public.group_members gm ON gm.group_id = g.id
LEFT JOIN public.loans l ON l.client_id = gm.client_id AND l.group_id = g.id
GROUP BY g.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_group_stats_id ON public.group_stats(id);

-- 14. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_groups_branch ON public.groups(branch);
CREATE INDEX IF NOT EXISTS idx_groups_status_branch ON public.groups(status, branch);
CREATE INDEX IF NOT EXISTS idx_group_members_client_active ON public.group_members(client_id) WHERE date_left IS NULL;

-- 15. Storage bucket for group documents
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('group-documents', 'group-documents', true, 10485760)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "group_docs_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'group-documents');
CREATE POLICY "group_docs_auth_upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'group-documents' AND auth.role() = 'authenticated');
CREATE POLICY "group_docs_auth_delete" ON storage.objects FOR DELETE USING (bucket_id = 'group-documents' AND auth.role() = 'authenticated');
