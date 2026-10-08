import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { sendTemplatedSms } from '@/lib/sms/send'
import { formatDate } from '@/lib/utils'
import { claimIdempotency, completeIdempotency, releaseIdempotency } from '@/lib/idempotency'
import { accraToday, overpaymentError, paymentDateError } from '@/lib/payments/guards'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    const role = profile?.role
    if (role !== 'supervisor' && role !== 'manager' && role !== 'accountant_admin') {
      return NextResponse.json(
        { error: 'Forbidden: Only supervisors, managers, or admins can record repayments' },
        { status: 403 }
      )
    }

    const { loanId, amount, method, momoReference, transactionDate, idempotencyKey } = await request.json()

    if (!loanId || !amount || amount <= 0 || !method) {
      return NextResponse.json({ error: 'Invalid repayment payload' }, { status: 400 })
    }

    const date = transactionDate || accraToday()
    const dateError = paymentDateError(date)
    if (dateError) {
      return NextResponse.json({ error: dateError }, { status: 400 })
    }

    const adminClient = createAdminClient()
    const claim = await claimIdempotency(
      adminClient,
      user.id,
      idempotencyKey || request.headers.get('Idempotency-Key')
    )
    if (claim.state === 'replay') {
      return NextResponse.json(claim.body, { status: claim.status })
    }
    if (claim.state === 'busy') {
      return NextResponse.json(
        { error: 'This payment is already being recorded. Wait a moment and refresh.' },
        { status: 409 }
      )
    }

    if (method === 'momo' && (!momoReference || !momoReference.trim())) {
      if (claim.state === 'claimed') await releaseIdempotency(adminClient, claim.id)
      return NextResponse.json({ error: 'MoMo reference is mandatory for MoMo transactions' }, { status: 400 })
    }

    // 1. Fetch loan and client details
    const { data: loan, error: loanErr } = await adminClient
      .from('loans')
      .select(`
        *,
        clients (id, full_name, phone_number, account_number)
      `)
      .eq('id', loanId)
      .single()

    if (loanErr || !loan) {
      if (claim.state === 'claimed') await releaseIdempotency(adminClient, claim.id)
      return NextResponse.json({ error: 'Loan not found' }, { status: 404 })
    }

    if (loan.status !== 'active' && loan.status !== 'defaulted') {
      if (claim.state === 'claimed') await releaseIdempotency(adminClient, claim.id)
      return NextResponse.json(
        { error: `Cannot record repayment for loan in '${loan.status}' status` },
        { status: 400 }
      )
    }

    const { data: before } = await adminClient
      .from('client_ledger_summary')
      .select('outstanding_balance')
      .eq('loan_id', loan.id)
      .maybeSingle()
    const outstanding = before
      ? Number(before.outstanding_balance)
      : Number(loan.total_repayable)
    const tooMuch = overpaymentError(parseFloat(amount), outstanding)
    if (tooMuch) {
      if (claim.state === 'claimed') await releaseIdempotency(adminClient, claim.id)
      return NextResponse.json({ error: tooMuch }, { status: 400 })
    }

    // 2. Insert into append-only transactions table (credit)
    // The Postgres trigger `transactions_apply_repayment` will automatically execute FIFO application
    // to repayment_schedule rows and update loan status to 'closed' if paid in full!
    const { data: tx, error: txErr } = await adminClient
      .from('transactions')
      .insert({
        loan_id: loan.id,
        client_id: loan.client_id,
        type: 'repayment',
        amount: parseFloat(amount),
        direction: 'credit',
        method: method,
        momo_reference: method === 'momo' ? momoReference.trim() : null,
        recorded_by: user.id,
        transaction_date: date,
      })
      .select()
      .single()

    if (txErr) {
      if (claim.state === 'claimed') await releaseIdempotency(adminClient, claim.id)
      throw txErr
    }

    // 3. Compute remaining balance after repayment for SMS notification
    const { data: summary } = await adminClient
      .from('client_ledger_summary')
      .select('outstanding_balance')
      .eq('loan_id', loan.id)
      .single()

    const remainingBal = Math.max(0, Number(summary?.outstanding_balance) || 0)
    const paidAmount = parseFloat(amount)
    const loanFullyPaid = remainingBal <= 0.009

    // 4. Send Confirmation SMS (and payoff SMS when the loan is cleared)
    if (loan.clients?.phone_number) {
      try {
        await sendTemplatedSms(
          loan.clients.phone_number,
          'confirmation',
          [loan.clients.full_name, paidAmount, remainingBal, loan.loan_number, formatDate(date)],
          { clientId: loan.client_id, loanId: loan.id }
        )

        if (loanFullyPaid) {
          await sendTemplatedSms(
            loan.clients.phone_number,
            'loan_closed',
            [loan.clients.full_name, loan.loan_number, paidAmount],
            { clientId: loan.client_id, loanId: loan.id }
          )
        }
      } catch (smsErr) {
        console.error('[Repayment SMS Error]', smsErr)
      }
    }

    const responseBody = {
      success: true,
      message: loanFullyPaid
        ? `Repayment of GHS ${paidAmount.toFixed(2)} recorded. Loan ${loan.loan_number} is now fully paid.`
        : `Repayment of GHS ${paidAmount.toFixed(2)} recorded successfully via ${method.toUpperCase()}. Remaining balance: GHS ${remainingBal.toFixed(2)}.`,
      remainingBalance: remainingBal,
      loanClosed: loanFullyPaid,
    }
    if (claim.state === 'claimed') {
      await completeIdempotency(adminClient, claim.id, 200, responseBody)
    }
    return NextResponse.json(responseBody)
  } catch (err: any) {
    console.error('[Repayment Recording Error]', err)
    return NextResponse.json({ error: err.message || 'Failed to record repayment' }, { status: 500 })
  }
}
