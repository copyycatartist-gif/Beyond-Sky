import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserProfile } from '@/lib/supabase/auth'

const TRANSFER_ROLES = ['manager', 'supervisor', 'accountant_admin']

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const profile = await getCurrentUserProfile()

  if (!profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!TRANSFER_ROLES.includes(profile.role)) {
    return NextResponse.json(
      { error: 'Forbidden: Only manager, supervisor or accountant_admin can transfer clients' },
      { status: 403 }
    )
  }

  const { clientId, newBranch, reason } = await request.json()

  if (!clientId) {
    return NextResponse.json({ error: 'clientId is required' }, { status: 400 })
  }

  if (!newBranch || typeof newBranch !== 'string') {
    return NextResponse.json({ error: 'newBranch is required' }, { status: 400 })
  }

  // Fetch current branch for the audit trail
  const { data: client, error: fetchError } = await supabase
    .from('clients')
    .select('id, branch')
    .eq('id', clientId)
    .single()

  if (fetchError || !client) {
    if (fetchError?.code === 'PGRST116') {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }
    return NextResponse.json(
      { error: fetchError?.message ?? 'Client not found' },
      { status: fetchError ? 500 : 404 }
    )
  }

  const previousBranch = client.branch

  const { error: updateError } = await supabase
    .from('clients')
    .update({ branch: newBranch })
    .eq('id', clientId)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // Record the transfer in the audit log (column is `changed_by` in public.audit_log)
  const { error: auditError } = await supabase
    .from('audit_log')
    .insert({
      table_name: 'clients',
      record_id: clientId,
      action: 'branch_transfer',
      old_values: { branch: previousBranch },
      new_values: { branch: newBranch, reason: reason ?? null },
      changed_by: profile.id,
    })

  if (auditError) {
    return NextResponse.json({ error: auditError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, previousBranch })
}
