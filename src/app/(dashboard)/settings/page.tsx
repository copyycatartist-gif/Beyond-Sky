import { createClient } from '@/lib/supabase/server'
import { SettingsForm } from '@/components/settings/settings-form'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const supabase = await createClient()

  // Fetch all business settings from DB
  const { data: settings } = await supabase
    .from('settings')
    .select('*')
    .order('key', { ascending: true })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Business Rules & Settings</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Configurable loan parameters, fees, terms, and escalation thresholds
        </p>
      </div>

      <SettingsForm initialSettings={settings || []} />
    </div>
  )
}
