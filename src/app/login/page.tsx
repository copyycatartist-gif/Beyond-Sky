import { LoginForm } from '@/components/auth/login-form'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) redirect('/dashboard')

  const errorMessages: Record<string, string> = {
    no_profile: 'Your user profile could not be found. Please contact an administrator.',
    auth_callback_failed: 'Authentication failed. Please try again.',
  }

  const errorMessage = searchParams.error ? errorMessages[searchParams.error] ?? 'An error occurred.' : null

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-white shadow-lg shadow-blue-500/30 mb-4 border border-blue-400/30 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.jpg" alt="Beyond Sky Micro-Credit logo" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight leading-tight">Beyond Sky Micro-Credit Enterprise</h1>
          <p className="text-blue-200/80 text-xs mt-1.5 font-medium">Loan Management System & Staff Portal</p>
        </div>
        {errorMessage && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/20 border border-red-400/30 text-red-200 text-sm text-center">
            {errorMessage}
          </div>
        )}
        <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl p-8 border border-white/20">
          <LoginForm />
        </div>
        <p className="text-center text-xs text-slate-400 mt-6 font-normal">
          © {new Date().getFullYear()} Beyond Sky Micro-Credit Enterprise. Authorized staff only.
        </p>
      </div>
    </div>
  )
}
