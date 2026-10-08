import type { SupabaseClient } from '@supabase/supabase-js'

type Claim =
  | { state: 'skip' }
  | { state: 'claimed'; id: string }
  | { state: 'replay'; status: number; body: Record<string, unknown> }
  | { state: 'busy' }

function keys(admin: SupabaseClient) {
  return admin.from('idempotency_keys') as any
}

/**
 * Claim a request key stored in the database so a repeated click on another
 * server returns the first result instead of writing a second loan or payment.
 */
export async function claimIdempotency(
  admin: SupabaseClient,
  userId: string,
  rawKey: string | null | undefined
): Promise<Claim> {
  const key = String(rawKey || '').trim().slice(0, 200)
  if (!key) return { state: 'skip' }

  const inserted = await keys(admin)
    .insert({ user_id: userId, idempotency_key: key })
    .select('id')
    .single()

  if (!inserted.error && inserted.data) {
    return { state: 'claimed', id: inserted.data.id as string }
  }

  const code = String(inserted.error?.code || '')
  if (inserted.error && code !== '23505') {
    throw inserted.error
  }

  return readExisting(admin, userId, key)
}

async function readExisting(admin: SupabaseClient, userId: string, key: string): Promise<Claim> {
  const { data } = await keys(admin)
    .select('id, status_code, response, created_at, completed_at')
    .eq('user_id', userId)
    .eq('idempotency_key', key)
    .maybeSingle()

  if (!data) return { state: 'busy' }
  if (data.completed_at && data.response && data.status_code) {
    return { state: 'replay', status: data.status_code as number, body: data.response as Record<string, unknown> }
  }

  const age = Date.now() - new Date(data.created_at).getTime()
  if (age < 90_000) return { state: 'busy' }

  await keys(admin).delete().eq('id', data.id)
  const retry = await keys(admin)
    .insert({ user_id: userId, idempotency_key: key })
    .select('id')
    .single()

  if (!retry.error && retry.data) {
    return { state: 'claimed', id: retry.data.id as string }
  }
  return { state: 'busy' }
}

export async function completeIdempotency(
  admin: SupabaseClient,
  claimId: string,
  status: number,
  body: Record<string, unknown>
) {
  await keys(admin)
    .update({
      status_code: status,
      response: body,
      completed_at: new Date().toISOString(),
    })
    .eq('id', claimId)
}

export async function releaseIdempotency(admin: SupabaseClient, claimId: string) {
  await keys(admin).delete().eq('id', claimId)
}
