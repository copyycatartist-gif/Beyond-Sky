// Supabase Edge Function: daily-overdue-job
// Runs daily via pg_cron or HTTP schedule

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const appUrl = Deno.env.get('NEXT_PUBLIC_APP_URL') ?? 'http://localhost:3000'

    // Call our server endpoint to execute all business checks and SMS dispatches
    const cronResponse = await fetch(`${appUrl}/api/cron/daily-loan-check`, {
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
    })

    const result = await cronResponse.json()

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
