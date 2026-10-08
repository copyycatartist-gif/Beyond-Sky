import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

export const LINK_DAYS = 7
export const CODE_MINUTES = 10
export const SESSION_MINUTES = 30
export const MAX_CODE_SENDS = 5
export const MAX_CODE_ATTEMPTS = 5

export function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

export function hashesMatch(stored: string | null | undefined, incoming: string) {
  if (!stored) return false
  const left = Buffer.from(stored)
  const right = Buffer.from(sha256(incoming))
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

export function newCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, '0')
}

export function newSession() {
  return randomBytes(32).toString('hex')
}

export function phoneKey(phone: string) {
  const digits = String(phone || '').replace(/\D/g, '')
  return digits.slice(-9)
}

export function accountKey(value: string) {
  return String(value || '').replace(/\s/g, '').toUpperCase()
}

export function applicationUrl(request: Request, token: string) {
  const forwardedHost = request.headers.get('x-forwarded-host')
  const host = forwardedHost || request.headers.get('host') || 'localhost:3000'
  const proto = request.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https')
  return `${proto}://${host}/apply/${token}`
}

type Admin = SupabaseClient

export async function loadApplicationLink(admin: Admin, token: string) {
  const id = String(token || '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const { data, error } = await admin
    .from('loan_application_links' as any)
    .select(`
      id, client_id, created_by, expires_at, used_at, revoked_at,
      otp_hash, otp_expires_at, otp_attempts, otp_sends, otp_sent_at,
      session_hash, session_expires_at,
      clients (id, full_name, account_number, phone_number, status, is_watchlisted, archived_at)
    `)
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return null
  return data as any
}

export function linkState(link: any, now = Date.now()) {
  if (!link) return 'invalid' as const
  if (link.used_at) return 'used' as const
  if (link.revoked_at) return 'invalid' as const
  if (new Date(link.expires_at).getTime() <= now) return 'expired' as const
  return 'open' as const
}

export async function clientApplyBlock(admin: Admin, client: any) {
  if (!client || client.archived_at) return 'This client file is not open for a new loan.'
  if (client.status !== 'active') return 'This client cannot apply while their file is not active.'
  if (client.is_watchlisted) return 'This client is on the watchlist. Staff must review the file before a loan application.'

  const { data: activeLoans } = await admin
    .from('loans' as any)
    .select('id, loan_number')
    .eq('client_id', client.id)
    .eq('status', 'active')
    .limit(1)
  if (activeLoans && activeLoans.length > 0) {
    return 'This client already has a loan that is being repaid. Finish it, or ask staff to refinance it.'
  }

  const { data: openLoans } = await admin
    .from('loans' as any)
    .select('id')
    .eq('client_id', client.id)
    .in('status', ['pending', 'approved'])
    .limit(1)
  if (openLoans && openLoans.length > 0) {
    return 'This client already has a loan waiting for a decision.'
  }

  const { data: memberships, error: memberError } = await admin
    .from('group_members' as any)
    .select('groups(status)')
    .eq('client_id', client.id)
    .is('date_left', null)
  if (memberError) return 'Could not check this client’s group. Try again.'
  const blocked = ((memberships || []) as any[]).some((row) => {
    const status = row.groups?.status
    return status === 'suspended' || status === 'defaulted'
  })
  if (blocked) return 'This client’s group is not open for a new loan.'

  return null
}

export async function loanOfferSettings(admin: Admin) {
  const { data: rows } = await admin.from('settings' as any).select('key, value')
  const map: Record<string, string> = {}
  ;((rows || []) as any[]).forEach((row) => {
    map[row.key] = row.value
  })
  const fee = parseFloat(map.processing_fee_percentage || map.fee_percentage || '0.05')
  return {
    minLoan: parseFloat(map.min_loan_amount || '1000') || 1000,
    maxLoan: parseFloat(map.max_loan_amount || '5000') || 5000,
    interestMultiplier: parseFloat(map.interest_multiplier || '1.365') || 1.365,
    termWeeks: parseInt(map.term_weeks || '13', 10) || 13,
    feePercentage: Number.isFinite(fee) && fee >= 0 ? fee : 0.05,
  }
}
