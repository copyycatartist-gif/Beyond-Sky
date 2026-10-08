import type { SupabaseClient } from '@supabase/supabase-js'

function accraParts(input: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Accra',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(input)
  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value)
  return { year: pick('year'), month: pick('month'), day: pick('day') }
}

/** Monday of the Ghana calendar week that contains this date, as YYYY-MM-DD. */
function accraMonday(year: number, month: number, day: number) {
  const utc = new Date(Date.UTC(year, month - 1, day))
  const weekday = utc.getUTCDay()
  const shift = weekday === 0 ? -6 : 1 - weekday
  utc.setUTCDate(utc.getUTCDate() + shift)
  return utc.toISOString().slice(0, 10)
}

export function disbursementCohort(disbursedOn: Date, frequency: 'weekly' | 'monthly') {
  const when = Number.isNaN(disbursedOn.getTime()) ? new Date() : disbursedOn
  const { year, month, day } = accraParts(when)

  if (frequency === 'monthly') {
    const label = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-GB', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    })
    return {
      key: `month:${year}-${String(month).padStart(2, '0')}`,
      name: `Disbursement ${label}`,
      meetingDay: null as string | null,
    }
  }

  const monday = accraMonday(year, month, day)
  const label = new Date(`${monday}T12:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
    return {
      key: `week:${monday}`,
      name: `Disbursement week of ${label}`,
      meetingDay: null as string | null,
    }
}

/** Find or create the disbursement cohort and add the client. Throws if it cannot. */
export async function assignDisbursementGroup(
  admin: SupabaseClient,
  input: {
    clientId: string
    loanId: string
    frequency: 'weekly' | 'monthly'
    disbursedOn: string
    actorId: string
  }
): Promise<{ groupId: string; addedMember: boolean }> {
  const when = new Date(`${input.disbursedOn.slice(0, 10)}T12:00:00Z`)
  const cohort = disbursementCohort(
    Number.isNaN(when.getTime()) ? new Date() : when,
    input.frequency
  )

  const { data: clientRow, error: clientLookupError } = await admin
    .from('clients')
    .select('branch')
    .eq('id', input.clientId)
    .maybeSingle()

  if (clientLookupError) {
    throw new Error(clientLookupError.message || 'Could not read the client branch')
  }

  const clientBranch = String((clientRow as { branch?: string | null } | null)?.branch || '').trim() || null

  const { data: existing, error: lookupError } = await admin
    .from('groups')
    .select('id, branch')
    .eq('cohort_key', cohort.key)
    .maybeSingle()

  if (lookupError) {
    throw new Error(lookupError.message || 'Could not look up the disbursement group')
  }

  const existingGroup = existing as { id: string; branch: string | null } | null
  let groupId = existingGroup?.id

  if (groupId && clientBranch && !String(existingGroup?.branch || '').trim()) {
    const { error: branchError } = await admin
      .from('groups')
      .update({ branch: clientBranch } as never)
      .eq('id', groupId)
    if (branchError) {
      throw new Error(branchError.message || 'Could not record the branch on the disbursement group')
    }
  }

  if (!groupId) {
    const { data: created, error } = await admin
      .from('groups')
      .insert({
        name: cohort.name,
        group_type: 'disbursement',
        status: 'active',
        max_members: 500,
        cohort_key: cohort.key,
        area: 'Disbursement cohort',
        branch: clientBranch,
        created_by: input.actorId,
      } as never)
      .select('id')
      .single()

    if (error || !created) {
      const raced = await admin
        .from('groups')
        .select('id')
        .eq('cohort_key', cohort.key)
        .maybeSingle()
      groupId = (raced.data as { id: string } | null)?.id
      if (!groupId) {
        throw new Error(error?.message || 'Could not create the disbursement group')
      }
    } else {
      groupId = (created as { id: string }).id
    }
  }

  const { data: member, error: memberLookupError } = await admin
    .from('group_members')
    .select('id')
    .eq('group_id', groupId)
    .eq('client_id', input.clientId)
    .is('date_left', null)
    .maybeSingle()

  if (memberLookupError) {
    throw new Error(memberLookupError.message || 'Could not check group membership')
  }

  if (member) {
    const { error: linkError } = await admin
      .from('loans')
      .update({ group_id: groupId } as never)
      .eq('id', input.loanId)
    if (linkError) throw new Error(linkError.message || 'Could not attach the loan to the group')
    return { groupId, addedMember: false }
  }

  const { error: memberError } = await admin.from('group_members').insert({
    group_id: groupId,
    client_id: input.clientId,
    date_joined: input.disbursedOn.slice(0, 10),
    role: 'member',
  } as never)

  if (memberError) {
    throw new Error(memberError.message || 'Could not add the client to the disbursement group')
  }

  const { error: linkError } = await admin
    .from('loans')
    .update({ group_id: groupId } as never)
    .eq('id', input.loanId)
  if (linkError) {
    await admin
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('client_id', input.clientId)
      .is('date_left', null)
    throw new Error(linkError.message || 'Could not attach the loan to the group')
  }

  return { groupId, addedMember: true }
}
