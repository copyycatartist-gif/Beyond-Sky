/**
 * SMS Provider abstraction layer.
 * All SMS providers implement this interface.
 */

export interface SmsSendRequest {
  to: string        // Phone number (e.g. 0241234567 or +233241234567)
  message: string   // UTF-8 text
  sender?: string   // Sender ID override
}

export interface SmsSendResult {
  success: boolean
  messageId?: string
  providerResponse: unknown
  error?: string
}

export interface SmsProvider {
  readonly name: string
  send(request: SmsSendRequest): Promise<SmsSendResult>
}

export const SMS_TEMPLATES = {
  /** Sent 1 day before installment due date */
  reminder: (clientName: string, amount: number, dueDate: string, loanNumber: string) =>
    `Dear ${clientName}, your installment of GHS ${amount.toFixed(2)} for loan ${loanNumber} is due on ${dueDate}. Please pay promptly. Beyond Sky Micro-Credit Enterprise.`,

  /** Sent immediately after repayment is recorded */
  confirmation: (clientName: string, amount: number, balance: number, loanNumber: string, date: string) =>
    `Dear ${clientName}, we received GHS ${amount.toFixed(2)} on ${date} for loan ${loanNumber}. Remaining balance: GHS ${balance.toFixed(2)}. Beyond Sky Micro-Credit Enterprise.`,

  /** Sent when loan application is approved */
  approval: (clientName: string, amount: number, loanNumber: string, weeklyInstallment: number) =>
    `Dear ${clientName}, your loan ${loanNumber} for GHS ${amount.toFixed(2)} has been APPROVED. Weekly installment: GHS ${weeklyInstallment.toFixed(2)}. Beyond Sky Micro-Credit Enterprise.`,

  /** Sent when loan is disbursed */
  disbursement: (clientName: string, amountReceived: number, loanNumber: string, firstDueDate: string) =>
    `Dear ${clientName}, GHS ${amountReceived.toFixed(2)} has been disbursed for loan ${loanNumber}. First weekly payment due: ${firstDueDate}. Beyond Sky Micro-Credit Enterprise.`,

  /** Sent when installment becomes overdue */
  overdue: (clientName: string, amount: number, daysOverdue: number, loanNumber: string) =>
    `Dear ${clientName}, your installment of GHS ${amount.toFixed(2)} for loan ${loanNumber} is ${daysOverdue} day(s) overdue. Please pay to avoid default. Beyond Sky Micro-Credit Enterprise.`,

  /** Sent when client is flagged as defaulted */
  defaulter: (clientName: string, totalArrears: number, loanNumber: string) =>
    `Dear ${clientName}, loan ${loanNumber} is in DEFAULT. Arrears: GHS ${totalArrears.toFixed(2)}. Please contact Beyond Sky Micro-Credit Enterprise office immediately.`,
} as const

export type SmsTemplateKey = keyof typeof SMS_TEMPLATES
