'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'
import { formatDate } from '@/lib/utils'
import { StickyNote, Loader2, Trash2, Send, User } from 'lucide-react'

export interface GroupNoteRow {
  id: string
  content: string
  created_by: string | null
  created_at: string
  author_name?: string | null
}

interface GroupNotesTabProps {
  groupId: string
  notes: GroupNoteRow[]
  currentUserId: string | null
  canManage: boolean
}

export function GroupNotesTab({ groupId, notes, currentUserId, canManage }: GroupNotesTabProps) {
  const router = useRouter()
  const { toast } = useToast()

  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<GroupNoteRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  const sortedNotes = [...notes].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  const canDelete = (note: GroupNoteRow) => canManage || note.created_by === currentUserId

  const handleAdd = async () => {
    if (!content.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/groups/${groupId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.trim() }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? 'Failed to add note')

      toast({ title: 'Note Added', description: 'Your note was saved to the group record.', variant: 'success' })
      setContent('')
      router.refresh()
    } catch (err: any) {
      toast({ title: 'Cannot add note', description: err.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/groups/${groupId}/notes?noteId=${deleteTarget.id}`, {
        method: 'DELETE',
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? 'Failed to delete note')

      toast({ title: 'Note Deleted', variant: 'success' })
      setDeleteTarget(null)
      router.refresh()
    } catch (err: any) {
      toast({ title: 'Cannot delete note', description: err.message, variant: 'destructive' })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-4 print:hidden">
      {/* Composer */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-2">
          <StickyNote className="h-4 w-4 text-blue-600" />
          Add a Field Note
        </h3>
        <textarea
          rows={3}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Observations from the field: group dynamics, officer visit remarks, warnings given, promises to pay..."
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[10px] text-gray-400">
            Notes are visible to all staff and permanently attributed to you.
          </span>
          <Button
            onClick={handleAdd}
            disabled={saving || !content.trim()}
            className="bg-blue-600 hover:bg-blue-700 h-9 text-xs min-w-[110px]"
          >
            {saving ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="mr-1.5 h-3.5 w-3.5" />
            )}
            Post Note
          </Button>
        </div>
      </div>

      {/* Feed */}
      {sortedNotes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
          <StickyNote className="mx-auto h-10 w-10 text-gray-300" />
          <h4 className="mt-3 text-sm font-semibold text-gray-900">No notes yet</h4>
          <p className="mx-auto mt-1 max-w-sm text-xs text-gray-500">
            Officer visits, warnings and observations between meetings.
          </p>
        </div>
      ) : (
        <div className="relative pl-5 space-y-3 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-px before:bg-gray-200">
          {sortedNotes.map((note) => (
            <div key={note.id} className="relative">
              <span className="absolute -left-5 top-4 h-[11px] w-[11px] rounded-full border-2 border-white bg-blue-400 ring-1 ring-blue-200" />
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-xs font-bold text-gray-900">
                      <User className="h-3 w-3 text-gray-400" />
                      {note.author_name ?? 'Staff'}
                      <span className="font-normal text-[10px] text-gray-400">
                        · {formatDate(note.created_at, 'dd MMM yyyy, HH:mm')}
                      </span>
                    </p>
                    <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-gray-700">
                      {note.content}
                    </p>
                  </div>
                  {canDelete(note) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 shrink-0 p-0 text-gray-300 hover:text-red-600 hover:bg-red-50"
                      onClick={() => setDeleteTarget(note)}
                      title="Delete note"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <Trash2 className="h-4 w-4" />
              Delete Note?
            </DialogTitle>
            <DialogDescription>
              This permanently removes the note from the group record. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteTarget && (
            <p className="rounded-lg border border-gray-200 bg-gray-50 p-2.5 text-xs text-gray-600 line-clamp-3">
              &ldquo;{deleteTarget.content}&rdquo;
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="min-w-[110px]">
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
