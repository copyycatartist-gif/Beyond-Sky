import type { SupabaseClient } from '@supabase/supabase-js'

export function disbursementCohort(disbursedOn: Date, frequency: 'weekly' | 'monthly') {
  if (frequency === 'monthly') {
    const year = disbursedOn.getFullYear()
    const month = disbursedOn.getMonth()
    const label = disbursedOn.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    return {
      key: `month:${year}-${String(month + 1).padStart(2, '0')}`,
      name: `Disbursement ${label}`,
      meetingDay: null as string | null,
    }
  }

  const date = new Date(disbursedOn)
  const day = date.getDay() || 7
  date.setDate(date.getDate() - day + 1)
  const year = date.getFullYear()
  const start = new Date(year, 0, 1)
  const week = Math.ceil(((date.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7)
  const label = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  return {
    key: `week:${year}-W${String(week).padStart(2, '0')}`,
    name: `Disbursement week of ${label}`,
    meetingDay: 'Monday',
  }
}

/** Find or create the disbursement cohort and add the client. */
export async function assignDisbursementGroup(
  admin: SupabaseClient,
  input: {
    clientId: string
    loanId: string
    frequency: 'weekly' | 'monthly'
    disbursedOn: string
    actorId: string
  }
) {
  const when = new Date(input.disbursedOn)
  const cohort = disbursementCohort(
    Number.isNaN(when.getTime()) ? new Date() : when,
    input.frequency
  )

  const { data: existing } = await admin
    .from('groups')
    .select('id')
    .eq('cohort_key', cohort.key)
    .maybeSingle()

  let groupId = (existing as { id: string } | null)?.id

  if (!groupId) {
    const { data: created, error } = await admin
      .from('groups')
      .insert({
        name: cohort.name,
        group_type: 'disbursement',
        status: 'active',
        max_members: 500,
        cohort_key: cohort.key,
        meeting_day: cohort.meetingDay,
        area: 'Disbursement cohort',
        created_by: input.actorId,
      } as never)
      .select('id')
      .single()
    if (error || !created) {
      console.error('[disbursement cohort]', error?.message)
      return
    }
    groupId = (created as { id: string }).id
  }

  const { data: member } = await admin
    .from('group_members')
    .select('id')
    .eq('group_id', groupId)
    .eq('client_id', input.clientId)
    .is('date_left', null)
    .maybeSingle()

  if (member) return

  const { error: memberError } = await admin.from('group_members').insert({
    group_id: groupId,
    client_id: input.clientId,
    date_joined: input.disbursedOn,
    role: 'member',
  } as never)

  if (memberError) {
    console.error('[disbursement cohort member]', memberError.message)
  }

  await admin.from('loans').update({ group_id: groupId } as never).eq('id', input.loanId)
}
