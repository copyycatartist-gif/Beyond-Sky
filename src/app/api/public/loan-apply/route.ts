import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { rateLimit, getRateLimitHeaders } from '@/lib/rate-limit'
import { isValidGhanaPhone, sanitizeInput } from '@/lib/sanitize'
import { sendTemplatedSms } from '@/lib/sms/send'
import { claimIdempotency, completeIdempotency, releaseIdempotency } from '@/lib/idempotency'
import {
  CODE_MINUTES,
  MAX_CODE_ATTEMPTS,
  MAX_CODE_SENDS,
  SESSION_MINUTES,
  accountKey,
  clientApplyBlock,
  hashesMatch,
  linkState,
  loadApplicationLink,
  loanOfferSettings,
  newCode,
  newSession,
  phoneKey,
  sha256,
} from '@/lib/loans/application-link'

function clientIp(request: Request) {
  return (request.headers.get('x-forwarded-for') || 'local').split(',')[0].trim().slice(0, 80)
}

function limited(key: string, maxRequests: number) {
  const rl = rateLimit(key, { maxRequests, windowMs: 10 * 60_000 })
  return { rl, headers: getRateLimitHeaders(rl) }
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') || ''
  const gate = limited(`apply-status:${token.slice(0, 36)}:${clientIp(request)}`, 30)
  if (!gate.rl.success) {
    return NextResponse.json({ error: 'Too many requests. Wait and try again.' }, { status: 429, headers: gate.headers })
  }
  const admin = createAdminClient()
  const link = await loadApplicationLink(admin, token)
  return NextResponse.json({ state: linkState(link) }, { headers: gate.headers })
}

export async function POST(request: Request) {
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const token = sanitizeInput(String(body.token || ''))
  const step = String(body.step || '')
  const ip = clientIp(request)
  const gate = limited(`apply:${step}:${token.slice(0, 36)}:${ip}`, step === 'submit' ? 8 : 12)
  if (!gate.rl.success) {
    return NextResponse.json({ error: 'Too many attempts. Wait and try again.' }, { status: 429, headers: gate.headers })
  }

  const admin = createAdminClient()
  const link = await loadApplicationLink(admin, token)
  const state = linkState(link)
  if (state !== 'open') {
    const message = state === 'used'
      ? 'This application link has already been used.'
      : state === 'expired'
        ? 'This application link has expired. Ask staff for a new one.'
        : 'This application link is not valid.'
    return NextResponse.json({ error: message }, { status: 410, headers: gate.headers })
  }

  const client = link.clients
  if (step === 'code') return sendCode(admin, link, client, body, gate.headers)
  if (step === 'confirm') return confirmCode(admin, link, client, body, gate.headers)
  if (step === 'submit') return submitApplication(admin, link, client, body, gate.headers)
  return NextResponse.json({ error: 'Unknown step' }, { status: 400, headers: gate.headers })
}

async function sendCode(admin: ReturnType<typeof createAdminClient>, link: any, client: any, body: any, headers: HeadersInit) {
  const account = accountKey(sanitizeInput(String(body.accountNumber || '')))
  const phone = sanitizeInput(String(body.phone || ''))
  if (!account || !isValidGhanaPhone(phone)) {
    return NextResponse.json({ error: 'Enter the account number and a Ghana phone number.' }, { status: 400, headers })
  }
  const accountOk = accountKey(client.account_number) === account
  const phoneOk = phoneKey(client.phone_number) === phoneKey(phone) && phoneKey(phone).length === 9
  if (!accountOk || !phoneOk) {
    return NextResponse.json({ error: 'The account number or phone does not match this link.' }, { status: 401, headers })
  }

  const blocked = await clientApplyBlock(admin, client)
  if (blocked) return NextResponse.json({ error: blocked }, { status: 409, headers })

  if (Number(link.otp_sends) >= MAX_CODE_SENDS) {
    return NextResponse.json({ error: 'Too many codes were sent. Ask staff for a new link.' }, { status: 429, headers })
  }
  if (link.otp_sent_at && Date.now() - new Date(link.otp_sent_at).getTime() < 60_000) {
    return NextResponse.json({ error: 'A code was just sent. Wait a minute before asking for another.' }, { status: 429, headers })
  }

  const code = newCode()
  const expires = new Date(Date.now() + CODE_MINUTES * 60_000).toISOString()
  const { error } = await admin
    .from('loan_application_links' as any)
    .update({
      otp_hash: sha256(`${link.id}:${code}`),
      otp_expires_at: expires,
      otp_attempts: 0,
      otp_sends: Number(link.otp_sends || 0) + 1,
      otp_sent_at: new Date().toISOString(),
      session_hash: null,
      session_expires_at: null,
    } as never)
    .eq('id', link.id)
  if (error) return NextResponse.json({ error: 'Could not send a code.' }, { status: 500, headers })

  const sms = await sendTemplatedSms(client.phone_number, 'application_code', [client.full_name, code], {
    clientId: client.id,
  })
  if (!sms.success) {
    return NextResponse.json({ error: 'The code could not be sent by text. Try again in a minute.' }, { status: 502, headers })
  }
  return NextResponse.json({ sent: true }, { headers })
}

async function confirmCode(admin: ReturnType<typeof createAdminClient>, link: any, client: any, body: any, headers: HeadersInit) {
  const code = sanitizeInput(String(body.code || '')).replace(/\D/g, '')
  if (code.length !== 6) {
    return NextResponse.json({ error: 'Enter the 6-digit code from the text message.' }, { status: 400, headers })
  }
  if (!link.otp_hash || !link.otp_expires_at || new Date(link.otp_expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: 'That code has expired. Request a new one.' }, { status: 401, headers })
  }
  if (Number(link.otp_attempts) >= MAX_CODE_ATTEMPTS) {
    return NextResponse.json({ error: 'Too many wrong codes. Request a new one.' }, { status: 429, headers })
  }

  const matches = hashesMatch(link.otp_hash, `${link.id}:${code}`)
  if (!matches) {
    await admin
      .from('loan_application_links' as any)
      .update({ otp_attempts: Number(link.otp_attempts || 0) + 1 } as never)
      .eq('id', link.id)
    return NextResponse.json({ error: 'That code is not correct.' }, { status: 401, headers })
  }

  const blocked = await clientApplyBlock(admin, client)
  if (blocked) return NextResponse.json({ error: blocked }, { status: 409, headers })

  const session = newSession()
  const sessionExpires = new Date(Date.now() + SESSION_MINUTES * 60_000).toISOString()
  await admin
    .from('loan_application_links' as any)
    .update({
      session_hash: sha256(session),
      session_expires_at: sessionExpires,
      otp_hash: null,
    } as never)
    .eq('id', link.id)

  const offer = await loanOfferSettings(admin)
  return NextResponse.json({
    session,
    clientName: client.full_name,
    offer,
  }, { headers })
}

async function submitApplication(admin: ReturnType<typeof createAdminClient>, link: any, client: any, body: any, headers: HeadersInit) {
  const session = sanitizeInput(String(body.session || ''))
  if (!link.session_hash || !link.session_expires_at || new Date(link.session_expires_at).getTime() <= Date.now() || !hashesMatch(link.session_hash, session)) {
    return NextResponse.json({ error: 'Confirm the text code again before submitting.' }, { status: 401, headers })
  }

  const blocked = await clientApplyBlock(admin, client)
  if (blocked) return NextResponse.json({ error: blocked }, { status: 409, headers })

  const offer = await loanOfferSettings(admin)
  const principal = Number(body.principal)
  if (!Number.isFinite(principal) || principal < offer.minLoan || principal > offer.maxLoan) {
    return NextResponse.json({
      error: `The amount must be between GHS ${offer.minLoan} and GHS ${offer.maxLoan}.`,
    }, { status: 400, headers })
  }

  const frequency = body.paymentFrequency === 'monthly' ? 'monthly' : 'weekly'
  const monthlyRates = [0.07, 0.1, 0.15, 0.3]
  let termMonths: number | null = null
  let interestRate: number | null = null
  if (frequency === 'monthly') {
    termMonths = Number(body.termMonths)
    interestRate = Number(body.interestRate)
    if (!Number.isInteger(termMonths) || termMonths < 1 || termMonths > 6) {
      return NextResponse.json({ error: 'Choose 1 to 6 months.' }, { status: 400, headers })
    }
    if (!monthlyRates.includes(interestRate)) {
      return NextResponse.json({ error: 'Choose 7%, 10%, 15%, or 30%.' }, { status: 400, headers })
    }
  }

  const claim = await claimIdempotency(admin, link.created_by, `client-apply:${link.id}`)
  if (claim.state === 'replay') {
    return NextResponse.json(claim.body, { status: claim.status, headers })
  }
  if (claim.state === 'busy') {
    return NextResponse.json({ error: 'This application is already being submitted.' }, { status: 409, headers })
  }

  const payload: Record<string, unknown> = {
    client_id: client.id,
    principal,
    status: 'pending',
    submitted_by: link.created_by,
    payment_frequency: frequency,
    agreement_town: 'Accra',
    agreement_district: 'Accra Metropolitan',
    agreement_region: 'Greater Accra',
  }
  if (frequency === 'monthly') {
    payload.term_months = termMonths
    payload.interest_rate = interestRate
    payload.term_weeks = termMonths
  } else {
    payload.term_weeks = offer.termWeeks
  }

  const { data: loan, error } = await admin
    .from('loans' as any)
    .insert(payload as never)
    .select('id, loan_number')
    .single()

  if (error || !loan) {
    if (claim.state === 'claimed') await releaseIdempotency(admin, claim.id)
    const message = /active loan/i.test(error?.message || '')
      ? 'This client already has a loan that is being repaid.'
      : error?.message || 'The application could not be saved.'
    return NextResponse.json({ error: message }, { status: 409, headers })
  }

  await admin
    .from('loan_application_links' as any)
    .update({
      used_at: new Date().toISOString(),
      session_hash: null,
      otp_hash: null,
    } as never)
    .eq('id', link.id)

  const result = {
    loanNumber: (loan as any).loan_number,
    message: 'Your application has been received. Staff will approve or reject it.',
  }
  if (claim.state === 'claimed') await completeIdempotency(admin, claim.id, 200, result)
  return NextResponse.json(result, { headers })
}
