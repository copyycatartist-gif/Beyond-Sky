import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { clientId, title, description, dueDate } = await request.json()

  if (!clientId || !title?.trim() || !dueDate) {
    return NextResponse.json({ error: 'clientId, title, and dueDate are required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('client_tasks')
    .insert({
      client_id: clientId,
      title: title.trim(),
      description: description?.trim() || null,
      due_date: dueDate,
      assigned_to: user.id,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { taskId, status } = await request.json()

  if (!taskId || !status) {
    return NextResponse.json({ error: 'taskId and status are required' }, { status: 400 })
  }

  const update: any = { status }
  if (status === 'completed') {
    update.completed_at = new Date().toISOString()
  }

  const { data, error } = await supabase
    .from('client_tasks')
    .update(update)
    .eq('id', taskId)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
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

  const { data, error } = await supabase
    .from('client_tasks')
    .select('*')
    .eq('client_id', clientId)
    .order('due_date', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
