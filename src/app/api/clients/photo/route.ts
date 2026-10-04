import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserProfile } from '@/lib/supabase/auth'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const BUCKET = 'client-photos'

const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const profile = await getCurrentUserProfile()
  if (!profile) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid multipart form data' }, { status: 400 })
  }

  const photo = formData.get('photo')
  const clientId = formData.get('clientId')

  if (!clientId || typeof clientId !== 'string') {
    return NextResponse.json({ error: 'clientId is required' }, { status: 400 })
  }

  if (!(photo instanceof File)) {
    return NextResponse.json({ error: 'photo file is required' }, { status: 400 })
  }

  if (photo.size === 0) {
    return NextResponse.json({ error: 'photo file is empty' }, { status: 400 })
  }

  if (photo.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'Photo must be 5MB or smaller' }, { status: 400 })
  }

  const ext = EXTENSION_BY_TYPE[photo.type]
  if (!ext) {
    return NextResponse.json(
      { error: 'Only JPEG, PNG and WebP images are allowed' },
      { status: 400 }
    )
  }

  // Verify the client exists
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .single()

  if (clientError || !client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  const path = `${clientId}/profile.${ext}`
  const bytes = Buffer.from(await photo.arrayBuffer())

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, {
      contentType: photo.type,
      upsert: true,
    })

  if (uploadError) {
    return NextResponse.json(
      { error: `Failed to upload photo: ${uploadError.message}` },
      { status: 500 }
    )
  }

  const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
  const publicUrl = publicUrlData.publicUrl

  const { error: updateError } = await supabase
    .from('clients')
    .update({ photo_url: publicUrl })
    .eq('id', clientId)

  if (updateError) {
    return NextResponse.json(
      { error: `Photo uploaded but failed to update client: ${updateError.message}` },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true, url: publicUrl })
}
