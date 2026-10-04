import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { sendTemplatedSms } from '@/lib/sms/send'
import { rateLimit, getRateLimitHeaders } from '@/lib/rate-limit'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify role is manager or accountant_admin
    const { data: profile } = await supabase
      .from('users')
      .select('role, full_name')
      .eq('id', user.id)
      .single()

    if (!profile || (profile.role !== 'manager' && profile.role !== 'accountant_admin')) {
      return NextResponse.json(
        { error: 'Forbidden: Only managers can approve or reject loans' },
        { status: 403 }
      )
    }

    // Rate limiting: 20 approval decisions per minute per user
    const limit = rateLimit(`loans:approve:${user.id}`, { maxRequests: 20, windowMs: 60000 })
    const rateHeaders = getRateLimitHeaders(limit)
    if (!limit.success) {
      return NextResponse.json(
        { error: 'Too many approval requests. Please try again shortly.' },
        { status: 429, headers: rateHeaders }
      )
    }

    const { loanId, action, rejectionReason } = await request.json()

    if (!loanId || (action !== 'approve' && action !== 'reject')) {
      return NextResponse.json(
        { error: 'Invalid payload' },
        { status: 400, headers: rateHeaders }
      )
    }

    if (action === 'reject' && (!rejectionReason || !rejectionReason.trim())) {
      return NextResponse.json(
        { error: 'Rejection reason is mandatory' },
        { status: 400, headers: rateHeaders }
      )
    }

    const adminClient = createAdminClient()

    // Fetch the loan
    const { data: loanData, error: loanErr } = await adminClient
      .from('loans' as any)
      .select(`
        *,
        clients (id, full_name, phone_number)
      `)
      .eq('id', loanId)
      .single()
    const loan = loanData as any

    if (loanErr || !loan) {
      return NextResponse.json(
        { error: 'Loan not found' },
        { status: 404, headers: rateHeaders }
      )
    }

    // Idempotency: only pending -> approved/rejected is allowed. The
    // state-machine trigger in Postgres is the authoritative backstop.
    if (loan.status !== 'pending') {
      return NextResponse.json(
        { error: `Loan already processed (current status: ${loan.status})` },
        { status: 409, headers: rateHeaders }
      )
    }

    if (action === 'approve') {
      const { error: updateErr } = await (adminClient as any)
        .from('loans')
        .update({
          status: 'approved',
          approved_by: user.id,
          approval_date: new Date().toISOString(),
        })
        .eq('id', loanId)

      if (updateErr) {
        const msg = String(updateErr.message || '')
        if (msg.includes('Illegal loan status transition')) {
          return NextResponse.json(
            { error: `Loan already processed: ${msg}` },
            { status: 409, headers: rateHeaders }
          )
        }
        throw updateErr
      }

      // Send SMS approval notice to client — best-effort, never fails the approval
      try {
        if (loan.clients?.phone_number) {
          await sendTemplatedSms(
            loan.clients.phone_number,
            'approval',
            [loan.clients.full_name, loan.principal, loan.loan_number, loan.weekly_installment],
            { clientId: loan.client_id, loanId: loan.id }
          )
        }
      } catch (smsErr) {
        console.error('[Loan Approval SMS Error]', smsErr)
      }

      return NextResponse.json(
        { success: true, message: 'Loan approved successfully' },
        { headers: rateHeaders }
      )
    } else {
      // Rejection
      const { error: updateErr } = await (adminClient as any)
        .from('loans')
        .update({
          status: 'rejected',
          approved_by: user.id,
          approval_date: new Date().toISOString(),
          rejection_reason: rejectionReason.trim(),
        })
        .eq('id', loanId)

      if (updateErr) {
        const msg = String(updateErr.message || '')
        if (msg.includes('Illegal loan status transition')) {
          return NextResponse.json(
            { error: `Loan already processed: ${msg}` },
            { status: 409, headers: rateHeaders }
          )
        }
        throw updateErr
      }

      return NextResponse.json(
        { success: true, message: 'Loan application rejected' },
        { headers: rateHeaders }
      )
    }
  } catch (err: any) {
    console.error('[Loan Approval Error]', err)
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}
