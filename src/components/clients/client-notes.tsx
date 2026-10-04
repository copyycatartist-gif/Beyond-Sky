'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StickyNote, Plus, Loader2 } from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface Note {
  id: string
  note_text: string
  created_at: string
  users?: { full_name: string } | null
}

export function ClientNotes({ clientId, initialNotes }: { clientId: string; initialNotes: Note[] }) {
  const router = useRouter()
  const [notes, setNotes] = useState(initialNotes)
  const [showForm, setShowForm] = useState(false)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  const addNote = async () => {
    if (!text.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/clients/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, noteText: text.trim() }),
      })
      if (res.ok) {
        const newNote = await res.json()
        setNotes(prev => [newNote, ...prev])
        setText('')
        setShowForm(false)
        router.refresh()
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-bold uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
            <StickyNote className="h-4 w-4 text-amber-500" />
            Officer Notes & Memos
          </CardTitle>
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowForm(!showForm)}>
            <Plus className="h-3 w-3" />
            Add
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        {showForm && (
          <div className="space-y-2 p-3 bg-amber-50/50 rounded-lg border border-amber-100">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Write a note about this client..."
              className="w-full h-20 rounded-md border border-gray-200 bg-white px-3 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-amber-300"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setShowForm(false); setText('') }}>
                Cancel
              </Button>
              <Button size="sm" className="h-7 text-xs bg-amber-600 hover:bg-amber-700" onClick={addNote} disabled={saving || !text.trim()}>
                {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Save Note
              </Button>
            </div>
          </div>
        )}

        {notes.length === 0 && !showForm ? (
          <p className="text-gray-400 italic">No notes recorded yet.</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {notes.map(note => (
              <div key={note.id} className="p-2.5 bg-gray-50 rounded-lg border border-gray-100">
                <p className="text-gray-700">{note.note_text}</p>
                <p className="text-[10px] text-gray-400 mt-1">
                  {note.users?.full_name || 'Staff'} • {formatDate(note.created_at, 'dd MMM yyyy, HH:mm')}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
