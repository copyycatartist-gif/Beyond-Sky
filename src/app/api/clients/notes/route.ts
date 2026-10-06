import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canSeeSuperAdmin } from '@/lib/roles'

function hideSuperAdminAuthors(notes: any, viewerRole: string | null | undefined) {
  if (canSeeSuperAdmin(viewerRole) || !Array.isArray(notes)) return notes
  return notes.map((note) => {
    if (note?.users?.role === 'accountant_admin') {
      return { ...note, users: { full_name: 'Staff' } }
    }
    return note
  })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { clientId, noteText } = await request.json()

  if (!clientId || !noteText?.trim()) {
    return NextResponse.json({ error: 'clientId and noteText are required' }, { status: 400 })
  }

  const { data: viewer } = await supabase.from('users').select('role').eq('id', user.id).single()

  const { data, error } = await supabase
    .from('client_notes')
    .insert({
      client_id: clientId,
      note_text: noteText.trim(),
      created_by: user.id,
    })
    .select('*, users:created_by(full_name, role)')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const [visible] = hideSuperAdminAuthors([data], viewer?.role)
  return NextResponse.json(visible)
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const clientId = request.nextUrl.searchParams.get('clientId')
  if (!clientId) {
    return NextResponse.json({ error: 'clientId is required' }, { status: 400 })
  }

  const { data: viewer } = await supabase.from('users').select('role').eq('id', user.id).single()

  const { data, error } = await supabase
    .from('client_notes')
    .select('*, users:created_by(full_name, role)')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(hideSuperAdminAuthors(data, viewer?.role))
}
