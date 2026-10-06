import { createClient } from '@/lib/supabase/server'

/**
 * Authorize the daily loan-check job.
 * Accepts either:
 *  - CRON_SECRET via Authorization: Bearer <secret> or x-cron-secret header
 *  - A signed-in manager / supervisor / super admin (manual UI runs)
 */
export async function authorizeCronRequest(
  request: Request
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const secret = process.env.CRON_SECRET?.trim()
  const authHeader = request.headers.get('authorization')
  const cronHeader = request.headers.get('x-cron-secret')

  if (secret) {
    if (authHeader === `Bearer ${secret}` || cronHeader === secret) {
      return { ok: true }
    }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (
      profile &&
      ['manager', 'supervisor', 'accountant_admin'].includes(profile.role)
    ) {
      return { ok: true }
    }

    return { ok: false, status: 403, error: 'Forbidden: staff authorization required' }
  }

  // No secret configured and no session: allow only outside production for local stub testing
  if (!secret && process.env.NODE_ENV !== 'production') {
    return { ok: true }
  }

  return {
    ok: false,
    status: 401,
    error: 'Unauthorized: provide CRON_SECRET or sign in as manager+',
  }
}
