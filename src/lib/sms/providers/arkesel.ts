import type { SmsProvider, SmsSendRequest, SmsSendResult } from '../types'

/**
 * Arkesel SMS Gateway implementation (Ghana REST API)
 * Docs: https://developers.arkesel.com/
 */
export class ArkeselProvider implements SmsProvider {
  readonly name = 'arkesel'
  private readonly apiKey: string
  private readonly senderId: string
  private readonly baseUrl = 'https://sms.arkesel.com/api/v2/sms/send'

  constructor() {
    this.apiKey = process.env.ARKESEL_API_KEY || ''
    this.senderId = process.env.ARKESEL_SENDER_ID || 'BeyondSkyMC'
  }

  async send(request: SmsSendRequest): Promise<SmsSendResult> {
    if (!this.apiKey) {
      return {
        success: false,
        providerResponse: { error: 'ARKESEL_API_KEY not set' },
        error: 'ARKESEL_API_KEY is missing in environment variables',
      }
    }

    const payload = {
      sender: request.sender || this.senderId,
      message: request.message,
      recipients: [this.normalizePhone(request.to)],
    }

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      const data = (await response.json()) as Record<string, unknown>

      if (!response.ok || data.status === 'error') {
        return {
          success: false,
          providerResponse: data,
          error: (data.message as string) || `HTTP ${response.status}`,
        }
      }

      return {
        success: true,
        messageId: (data.data as { id?: string })?.id,
        providerResponse: data,
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Network error'
      return {
        success: false,
        providerResponse: { error },
        error,
      }
    }
  }

  private normalizePhone(phone: string): string {
    const digits = phone.replace(/\D/g, '')
    if (digits.startsWith('233')) return `+${digits}`
    if (digits.startsWith('0')) return `+233${digits.slice(1)}`
    return `+${digits}`
  }
}
