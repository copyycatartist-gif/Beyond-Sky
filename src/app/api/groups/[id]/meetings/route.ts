import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ error: 'Group meetings are no longer used.' }, { status: 410 })
}

export async function POST() {
  return NextResponse.json({ error: 'Group meetings are no longer used.' }, { status: 410 })
}
