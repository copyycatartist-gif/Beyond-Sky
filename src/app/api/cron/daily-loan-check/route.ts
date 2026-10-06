import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { sendTemplatedSms } from '@/lib/sms/send'
import { formatDate } from '@/lib/utils'
import { authorizeCronRequest } from '@/lib/cron/authorize'

/**
 * Daily Loan Check Cron Endpoint
 * Triggered by an external scheduler (Authorization: Bearer CRON_SECRET)
 * or manually by a signed-in manager / supervisor / super admin.
 *
 * Actions:
 * 1. Send upcoming-installment reminder SMS (sms_reminder_days_before).
 * 2. Flag overdue installments.
 * 3. Escalate loans/clients to defaulted after consecutive misses.
 * 4. Dispatch overdue & defaulter SMS alerts.
 */
export async function GET(request: Request) {
  try {
    const access = await authorizeCronRequest(request)
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status })
    }

    const adminClient = createAdminClient()
    const today = new Date().toISOString().split('T')[0]
    const todayStart = `${today}T00:00:00.000Z`

    // ---- Settings ----
    const [{ data: thresholdRow }, { data: reminderDaysRow }] = await Promise.all([
      adminClient.from('settings').select('value').eq('key', 'weeks_to_defaulter_status').maybeSingle(),
      adminClient.from('settings').select('value').eq('key', 'sms_reminder_days_before').maybeSingle(),
    ])

    const defaulterThreshold = parseInt(thresholdRow?.value || '2', 10)
    const reminderDaysBefore = Math.max(0, parseInt(reminderDaysRow?.value || '1', 10))

    // Due date that should receive a reminder today
    const reminderDueDate = new Date(`${today}T00:00:00.000Z`)
    reminderDueDate.setUTCDate(reminderDueDate.getUTCDate() + reminderDaysBefore)
    const reminderDueDateStr = reminderDueDate.toISOString().split('T')[0]

    let reminderSmsCount = 0

    // 1. Upcoming installment reminders
    const { data: upcomingInstallments, error: reminderErr } = await adminClient
      .from('repayment_schedule')
      .select(`
        id, loan_id, due_date, expected_amount, status,
        loans!inner (
          id, loan_number, status, client_id,
          clients (id, full_name, phone_number)
        )
      `)
      .eq('due_date', reminderDueDateStr)
      .eq('status', 'upcoming')

    if (reminderErr) throw reminderErr

    for (const row of upcomingInstallments || []) {
      const loan = row.loans as any
      if (!loan || loan.status !== 'active') continue
      const client = loan?.clients
      if (!client?.phone_number) continue

      // Skip if a reminder was already logged today for this loan
      const { data: alreadySent } = await adminClient
        .from('sms_log')
        .select('id')
        .eq('loan_id', loan.id)
        .eq('message_type', 'reminder')
        .gte('sent_at', todayStart)
        .limit(1)

      if (alreadySent && alreadySent.length > 0) continue

      await sendTemplatedSms(
        client.phone_number,
        'reminder',
        [
          client.full_name,
          Number(row.expected_amount),
          formatDate(row.due_date),
          loan.loan_number,
        ],
        { clientId: loan.client_id, loanId: loan.id }
      )
      reminderSmsCount++
    }

    // 2. Mark overdue repayment schedule rows
    const { data: updatedOverdueRows, error: overdueErr } = await adminClient
      .from('repayment_schedule')
      .update({ status: 'overdue' })
      .lt('due_date', today)
      .in('status', ['upcoming', 'partially_paid'])
      .select('id, loan_id, expected_amount, paid_amount, due_date')

    if (overdueErr) throw overdueErr

    // 3. Scan active loans for consecutive missed installments
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
    let escalationSmsCount = 0

    for (const loan of activeLoans || []) {
      const schedule = (loan.repayment_schedule || []).sort(
        (a: any, b: any) => a.installment_number - b.installment_number
      )

      let consecutiveMisses = 0
      let maxConsecutive = 0
      let totalArrears = 0

      for (const row of schedule) {
        if (
          row.due_date < today &&
          (row.status === 'overdue' || Number(row.paid_amount) < Number(row.expected_amount))
        ) {
          consecutiveMisses++
          totalArrears += Number(row.expected_amount) - Number(row.paid_amount)
          if (consecutiveMisses > maxConsecutive) maxConsecutive = consecutiveMisses
        } else if (row.status === 'paid') {
          consecutiveMisses = 0
        }
      }

      if (maxConsecutive >= defaulterThreshold && loan.status === 'active') {
        await adminClient.from('loans').update({ status: 'defaulted' }).eq('id', loan.id)
        await adminClient.from('clients').update({ status: 'defaulted' }).eq('id', loan.client_id)
        newlyDefaultedCount++

        if (loan.clients?.phone_number) {
          await sendTemplatedSms(
            loan.clients.phone_number,
            'defaulter',
            [loan.clients.full_name, totalArrears, loan.loan_number],
            { clientId: loan.client_id, loanId: loan.id }
          )
          escalationSmsCount++
        }
      } else if (maxConsecutive === 1 && loan.status === 'active') {
        if (loan.clients?.phone_number) {
          const earliestOverdue = schedule.find(
            (s: any) =>
              s.due_date < today &&
              (s.status === 'overdue' || Number(s.paid_amount) < Number(s.expected_amount))
          )
          const daysOverdue = earliestOverdue
            ? Math.max(
                1,
                Math.floor(
                  (new Date(`${today}T00:00:00Z`).getTime() -
                    new Date(`${earliestOverdue.due_date}T00:00:00Z`).getTime()) /
                    86400000
                )
              )
            : 7

          // Avoid spamming: one overdue SMS per loan per day
          const { data: alreadyOverdueSms } = await adminClient
            .from('sms_log')
            .select('id')
            .eq('loan_id', loan.id)
            .eq('message_type', 'overdue')
            .gte('sent_at', todayStart)
            .limit(1)

          if (!alreadyOverdueSms?.length) {
            await sendTemplatedSms(
              loan.clients.phone_number,
              'overdue',
              [loan.clients.full_name, totalArrears, daysOverdue, loan.loan_number],
              { clientId: loan.client_id, loanId: loan.id }
            )
            escalationSmsCount++
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      reminderDueDate: reminderDueDateStr,
      reminderSmsSent: reminderSmsCount,
      overdueInstallmentsFlagged: updatedOverdueRows?.length || 0,
      newlyDefaultedLoans: newlyDefaultedCount,
      escalationSmsSent: escalationSmsCount,
      notificationsSent: reminderSmsCount + escalationSmsCount,
    })
  } catch (err: any) {
    console.error('[Daily Loan Check Job Error]', err)
    return NextResponse.json({ error: err.message || 'Job execution failed' }, { status: 500 })
  }
}
