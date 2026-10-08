-- Branch is part of a client's personal information, so an empty branch
-- lowers the profile score the same way a missing phone or address does.

CREATE OR REPLACE FUNCTION public.compute_profile_completeness(client_row public.clients)
RETURNS SMALLINT AS $$
DECLARE
  total_fields INT := 21;
  filled INT := 0;
BEGIN
  IF client_row.full_name IS NOT NULL AND client_row.full_name != '' THEN filled := filled + 1; END IF;
  IF client_row.phone_number IS NOT NULL AND client_row.phone_number != '' THEN filled := filled + 1; END IF;
  IF client_row.national_id IS NOT NULL AND client_row.national_id != '' THEN filled := filled + 1; END IF;
  IF client_row.spouse_or_father_name IS NOT NULL AND client_row.spouse_or_father_name != '' THEN filled := filled + 1; END IF;
  IF client_row.age IS NOT NULL THEN filled := filled + 1; END IF;
  IF client_row.date_of_birth IS NOT NULL THEN filled := filled + 1; END IF;
  IF client_row.branch IS NOT NULL AND client_row.branch != '' THEN filled := filled + 1; END IF;
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

UPDATE public.clients
SET profile_completeness = public.compute_profile_completeness(clients);
