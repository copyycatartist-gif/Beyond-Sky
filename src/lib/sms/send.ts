import { createAdminClient } from '@/lib/supabase/admin'
import { getSmsProvider } from './factory'
import { SMS_TEMPLATES, type SmsTemplateKey } from './types'

interface SendSmsOptions {
  clientId?: string
  loanId?: string
  phone: string
  messageType: SmsTemplateKey
  message: string
}

export async function sendSms(options: SendSmsOptions): Promise<{ success: boolean; error?: string }> {
  try {
    const provider = getSmsProvider()
    const result = await provider.send({
      to: options.phone,
      message: options.message,
    })

    // Log to Supabase sms_log via admin client
    try {
      const supabase = createAdminClient()
      await supabase.from('sms_log').insert({
        client_id: options.clientId || null,
        loan_id: options.loanId || null,
        message_type: options.messageType,
        phone: options.phone,
        message_body: options.message,
        status: result.success ? 'sent' : 'failed',
        provider: provider.name,
        provider_response: (result.providerResponse ?? {}) as any,
        sent_at: new Date().toISOString(),
      })
    } catch (dbErr) {
      console.error('[SMS Log DB Error]', dbErr)
    }

    return { success: result.success, error: result.error }
  } catch (err: any) {
    console.error('[SMS Dispatch Error]', err)
    return { success: false, error: err?.message || 'Unknown SMS error' }
  }
}

export async function sendTemplatedSms<K extends SmsTemplateKey>(
  phone: string,
  templateKey: K,
  params: Parameters<typeof SMS_TEMPLATES[K]>,
  meta?: { clientId?: string; loanId?: string }
) {
  const templateFn = SMS_TEMPLATES[templateKey] as (...args: any[]) => string
  const message = templateFn(...params)

  return sendSms({
    phone,
    messageType: templateKey,
    message,
    ...meta,
  })
}
