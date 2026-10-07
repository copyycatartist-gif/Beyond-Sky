import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUserProfile } from '@/lib/supabase/auth'
import { canDeleteClients } from '@/lib/roles'

/**
 * DELETE /api/clients/[id]
 * Permanently remove a client. Restricted to manager / super admin.
 * Blocked when the client has any loan history (FK on loans.client_id).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const profile = await getCurrentUserProfile()
  if (!profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!canDeleteClients(profile.role)) {
    return NextResponse.json(
      { error: 'Forbidden: Only a manager or super admin can delete clients' },
      { status: 403 }
    )
  }

  const clientId = params.id
  if (!clientId) {
    return NextResponse.json({ error: 'Client id is required' }, { status: 400 })
  }

  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id, full_name, account_number')
    .eq('id', clientId)
    .maybeSingle()

  if (clientError || !client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  const { count: loanCount, error: loanError } = await supabase
    .from('loans')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)

  if (loanError) {
    return NextResponse.json({ error: loanError.message }, { status: 500 })
  }

  if ((loanCount || 0) > 0) {
    return NextResponse.json(
      {
        error:
          'Cannot delete a client with loan history. Archive them instead, or close/remove loans first.',
      },
      { status: 409 }
    )
  }

  // Clear optional FKs that may not cascade (leader refs, etc.)
  await admin.from('groups').update({ leader_id: null }).eq('leader_id', clientId)

  const { error: deleteError } = await admin.from('clients').delete().eq('id', clientId)
  if (deleteError) {
    console.error('[DELETE /api/clients/[id]]', deleteError.message)
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  await admin.from('audit_log').insert({
    table_name: 'clients',
    record_id: clientId,
    action: 'DELETE',
    changed_by: profile.id,
    old_values: {
      full_name: client.full_name,
      account_number: client.account_number,
    },
    new_values: null,
  })

  return NextResponse.json({
    success: true,
    message: `${client.full_name} was permanently deleted.`,
  })
}
