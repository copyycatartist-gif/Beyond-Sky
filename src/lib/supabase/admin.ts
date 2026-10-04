import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

// Admin client with service_role key — server-side only.
// NEVER expose this to the browser.
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
