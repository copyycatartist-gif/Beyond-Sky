// Supabase Edge Function: daily-overdue-job
// Runs daily via pg_cron or HTTP schedule and calls the Next.js cron endpoint.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

serve(async (_req) => {
  try {
    const appUrl = Deno.env.get('NEXT_PUBLIC_APP_URL') ?? 'http://localhost:3000'
    const cronSecret = Deno.env.get('CRON_SECRET') ?? ''

    const headers: Record<string, string> = {}
    if (cronSecret) {
      headers['Authorization'] = `Bearer ${cronSecret}`
      headers['x-cron-secret'] = cronSecret
    }

    const cronResponse = await fetch(`${appUrl.replace(/\/$/, '')}/api/cron/daily-loan-check`, {
      headers,
    })

    const result = await cronResponse.json()

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
      status: cronResponse.ok ? 200 : cronResponse.status,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
