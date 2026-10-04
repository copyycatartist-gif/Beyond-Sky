import type { SmsProvider, SmsSendRequest, SmsSendResult } from '../types'

/**
 * Stub SMS provider for local testing and offline execution.
 */
export class StubProvider implements SmsProvider {
  readonly name = 'stub'

  async send(request: SmsSendRequest): Promise<SmsSendResult> {
    console.log(`[SMS STUB] To: ${request.to} | Message: ${request.message}`)
    return {
      success: true,
      messageId: `stub-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      providerResponse: {
        stub: true,
        to: request.to,
        message: request.message,
        timestamp: new Date().toISOString(),
      },
    }
  }
}
