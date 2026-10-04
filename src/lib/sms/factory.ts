import type { SmsProvider } from './types'
import { ArkeselProvider } from './providers/arkesel'
import { StubProvider } from './providers/stub'

let _instance: SmsProvider | null = null

export function getSmsProvider(): SmsProvider {
  if (_instance) return _instance

  const providerName = (process.env.SMS_PROVIDER || 'stub').toLowerCase()

  switch (providerName) {
    case 'arkesel':
      _instance = new ArkeselProvider()
      break
    case 'stub':
    default:
      _instance = new StubProvider()
      break
  }

  return _instance
}

export function resetSmsProvider(): void {
  _instance = null
}
