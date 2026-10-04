import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserProfile } from '@/lib/supabase/auth'

const ALLOWED_ROLES = ['manager', 'supervisor', 'accountant_admin']

// Client fields that may be copied from the duplicate onto the primary record
// during a merge (mirrors the whitelist used by /api/clients/update).
const MERGEABLE_FIELDS = [
  'full_name', 'phone_number', 'national_id', 'spouse_or_father_name',
  'age', 'date_of_birth', 'marital_status', 'residential_address',
  'permanent_address', 'business_address', 'business_type', 'market_location',
  'daily_business_income', 'monthly_income', 'religion', 'place_of_worship',
  'religious_leader_name', 'religious_leader_phone', 'branch', 'area',
  'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relationship',
  'notes',
]

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const profile = await getCurrentUserProfile()
    if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
      return NextResponse.json(
        { error: 'Forbidden: Only managers, supervisors, or admins can merge client records' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { primaryId, duplicateId, fieldSelections } = body as {
      primaryId?: string
      duplicateId?: string
      fieldSelections?: Record<string, 'primary' | 'duplicate'>
    }

    if (!primaryId || !duplicateId) {
      return NextResponse.json(
        { error: 'primaryId and duplicateId are required' },
        { status: 400 }
      )
    }
    if (primaryId === duplicateId) {
      return NextResponse.json(
        { error: 'Cannot merge a client into itself' },
        { status: 400 }
      )
    }
    if (!fieldSelections || typeof fieldSelections !== 'object') {
      return NextResponse.json(
        { error: 'fieldSelections is required' },
        { status: 400 }
      )
    }

    // Validate both clients exist
    const { data: primaryClient, error: primaryError } = await supabase
      .from('clients')
      .select('*')
      .eq('id', primaryId)
      .single()

    if (primaryError || !primaryClient) {
      return NextResponse.json({ error: 'Primary client not found' }, { status: 404 })
    }

    const { data: duplicateClient, error: duplicateError } = await supabase
      .from('clients')
      .select('*')
      .eq('id', duplicateId)
      .single()

    if (duplicateError || !duplicateClient) {
      return NextResponse.json({ error: 'Duplicate client not found' }, { status: 404 })
    }

    // Build the update payload: for each mergeable field the user chose to
    // keep from the duplicate, copy that value onto the primary record.
    const updates: Record<string, unknown> = {}
    for (const field of MERGEABLE_FIELDS) {
      if (fieldSelections[field] === 'duplicate') {
        updates[field] = (duplicateClient as Record<string, unknown>)[field] ?? null
      }
    }

    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabase
        .from('clients')
        .update(updates as never)
        .eq('id', primaryId)

      if (updateError) {
        return NextResponse.json(
          { error: `Failed to update primary client: ${updateError.message}` },
          { status: 500 }
        )
      }
    }

    // Reassign related records from the duplicate to the primary
    const relatedTables = ['loans', 'transactions', 'group_members'] as const
    for (const table of relatedTables) {
      const { error } = await supabase
        .from(table)
        .update({ client_id: primaryId } as never)
        .eq('client_id', duplicateId)

      if (error) {
        return NextResponse.json(
          { error: `Failed to reassign ${table}: ${error.message}` },
          { status: 500 }
        )
      }
    }

    // Audit log entry (best-effort: never fail the merge because of logging)
    const { error: auditError } = await supabase.from('audit_log').insert({
      table_name: 'clients',
      record_id: primaryId,
      action: 'merge',
      old_values: {},
      new_values: {
        merged_from: duplicateId,
        fieldSelections,
        performed_by: profile.id,
      },
      changed_by: profile.id,
    } as never)

    if (auditError) {
      console.error('[clients/merge] audit_log insert failed:', auditError.message)
    }

    // Soft-delete the duplicate record
    const { error: archiveError } = await supabase
      .from('clients')
      .update({
        status: 'inactive',
        archived_at: new Date().toISOString(),
      } as never)
      .eq('id', duplicateId)

    if (archiveError) {
      return NextResponse.json(
        { error: `Failed to archive duplicate client: ${archiveError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[clients/merge] unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
