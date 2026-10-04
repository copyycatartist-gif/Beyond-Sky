import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { sendTemplatedSms } from '@/lib/sms/send'

/**
 * Daily Loan Check Cron Endpoint
 * Can be triggered daily via Vercel Cron or Supabase pg_cron / Edge Function.
 *
 * Actions:
 * 1. Flags overdue installments (due_date < today and balance > 0).
 * 2. Escalates loans and clients to 'defaulted' after >= 2 consecutive missed installments.
 * 3. Dispatches automated SMS alerts for overdue & defaulted clients.
 */
export async function GET(request: Request) {
  try {
    const adminClient = createAdminClient()
    const today = new Date().toISOString().split('T')[0]

    // 1. Fetch threshold from settings
    const { data: thresholdRow } = await adminClient
      .from('settings')
      .select('value')
      .eq('key', 'weeks_to_defaulter_status')
      .single()

    const defaulterThreshold = parseInt(thresholdRow?.value || '2', 10)

    // 2. Mark overdue repayment schedule rows
    const { data: updatedOverdueRows, error: overdueErr } = await adminClient
      .from('repayment_schedule')
      .update({ status: 'overdue' })
      .lt('due_date', today)
      .in('status', ['upcoming', 'partially_paid'])
      .select('id, loan_id, expected_amount, paid_amount, due_date')

    if (overdueErr) throw overdueErr

    // 3. Scan all active loans to check for consecutive missed installments
    const { data: activeLoans, error: loansErr } = await adminClient
      .from('loans')
      .select(`
        id, loan_number, status, client_id,
        clients (id, full_name, phone_number, status),
        repayment_schedule (id, installment_number, due_date, status, expected_amount, paid_amount)
      `)
      .in('status', ['active', 'defaulted'])

    if (loansErr) throw loansErr

    let newlyDefaultedCount = 0
    let smsSentCount = 0

    for (const loan of activeLoans || []) {
      const schedule = (loan.repayment_schedule || []).sort(
        (a: any, b: any) => a.installment_number - b.installment_number
      )

      // Count consecutive overdue installments
      let consecutiveMisses = 0
      let maxConsecutive = 0
      let totalArrears = 0

      for (const row of schedule) {
        if (row.due_date < today && (row.status === 'overdue' || (Number(row.paid_amount) < Number(row.expected_amount)))) {
          consecutiveMisses++
          totalArrears += (Number(row.expected_amount) - Number(row.paid_amount))
          if (consecutiveMisses > maxConsecutive) maxConsecutive = consecutiveMisses
        } else if (row.status === 'paid') {
          consecutiveMisses = 0
        }
      }

      // Check if threshold reached
      if (maxConsecutive >= defaulterThreshold && loan.status === 'active') {
        // Escalate loan and client to 'defaulted'
        await adminClient.from('loans').update({ status: 'defaulted' }).eq('id', loan.id)
        await adminClient.from('clients').update({ status: 'defaulted' }).eq('id', loan.client_id)
        newlyDefaultedCount++

        // Send Defaulter SMS
        if (loan.clients?.phone_number) {
          await sendTemplatedSms(
            loan.clients.phone_number,
            'defaulter',
            [loan.clients.full_name, totalArrears, loan.loan_number],
            { clientId: loan.client_id, loanId: loan.id }
          )
          smsSentCount++
        }
      } else if (maxConsecutive === 1 && loan.status === 'active') {
        // Single missed week — send overdue reminder SMS
        if (loan.clients?.phone_number) {
          const daysOverdue = 7 // roughly 1 week
          await sendTemplatedSms(
            loan.clients.phone_number,
            'overdue',
            [loan.clients.full_name, totalArrears, daysOverdue, loan.loan_number],
            { clientId: loan.client_id, loanId: loan.id }
          )
          smsSentCount++
        }
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      overdueInstallmentsFlagged: updatedOverdueRows?.length || 0,
      newlyDefaultedLoans: newlyDefaultedCount,
      notificationsSent: smsSentCount,
    })
  } catch (err: any) {
    console.error('[Daily Loan Check Job Error]', err)
    return NextResponse.json({ error: err.message || 'Job execution failed' }, { status: 500 })
  }
}
