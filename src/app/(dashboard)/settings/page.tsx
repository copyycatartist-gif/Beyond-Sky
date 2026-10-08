import { createClient } from '@/lib/supabase/server'
import { requirePageRoles } from '@/lib/page-access'
import { SettingsForm } from '@/components/settings/settings-form'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  await requirePageRoles(['manager', 'accountant_admin'])
  const supabase = await createClient()

  // Fetch all business settings from DB
  const { data: settings } = await supabase
    .from('settings')
    .select('*')
    .order('key', { ascending: true })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Business settings</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Weekly terms, loan size, and the income note shown to approvers. Monthly rates stay on the application.
        </p>
      </div>

      <SettingsForm initialSettings={settings || []} />
    </div>
  )
}
