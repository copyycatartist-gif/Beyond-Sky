'use client'

import React, { useMemo, useState } from 'react'
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
import { MessageSquare, Loader2, Send, Users, UserCheck, ListChecks } from 'lucide-react'

export interface SmsRecipientMember {
  client_id: string
  full_name: string
  phone_number: string | null
}

interface GroupSmsBroadcastProps {
  groupId: string
  groupName: string
  members: SmsRecipientMember[]
}

type RecipientMode = 'all' | 'active' | 'custom'

export function GroupSmsBroadcast({ groupId, groupName, members }: GroupSmsBroadcastProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<RecipientMode>('all')
  const [message, setMessage] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [sending, setSending] = useState(false)

  const recipientsPreview = useMemo(() => {
    if (mode === 'custom') return selectedIds.length
    return members.length
  }, [mode, members.length, selectedIds.length])

  const toggleMember = (clientId: string) => {
    setSelectedIds((prev) =>
      prev.includes(clientId) ? prev.filter((id) => id !== clientId) : [...prev, clientId]
    )
  }

  const handleSend = async () => {
    if (!message.trim()) {
      toast({
        title: 'Message required',
        description: 'Type the SMS body before sending.',
        variant: 'destructive',
      })
      return
    }
    if (mode === 'custom' && selectedIds.length === 0) {
      toast({
        title: 'No recipients',
        description: 'Select at least one member for a custom broadcast.',
        variant: 'destructive',
      })
      return
    }

    setSending(true)
    try {
      const res = await fetch(`/api/groups/${groupId}/sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message.trim(),
          recipients: mode === 'custom' ? selectedIds : mode,
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? 'Failed to send SMS broadcast')

      toast({
        title: 'SMS Broadcast Queued',
        description:
          json?.sent_count !== undefined
            ? `Message sent to ${json.sent_count} member(s) of ${groupName}.`
            : `Message queued for ${recipientsPreview} member(s) of ${groupName}.`,
        variant: 'success',
      })
      setOpen(false)
      setMessage('')
      setSelectedIds([])
      setMode('all')
      router.refresh()
    } catch (err: any) {
      toast({ title: 'Cannot send SMS', description: err.message, variant: 'destructive' })
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-9 gap-1.5 text-gray-600 hover:text-purple-700 hover:border-purple-200"
        onClick={() => setOpen(true)}
      >
        <MessageSquare className="h-3.5 w-3.5" />
        SMS Broadcast
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-purple-600" />
              SMS Broadcast — {groupName}
            </DialogTitle>
            <DialogDescription>
              Send a bulk SMS reminder (meeting day, collection date, announcement) to group
              members. Messages are logged in the SMS history per client.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Recipient mode */}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setMode('all')}
                className={`flex flex-col items-center gap-1 rounded-lg border p-2.5 text-[11px] font-semibold transition-colors ${
                  mode === 'all'
                    ? 'border-purple-400 bg-purple-50 text-purple-800 ring-1 ring-purple-300'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Users className="h-4 w-4" />
                All ({members.length})
              </button>
              <button
                type="button"
                onClick={() => setMode('active')}
                className={`flex flex-col items-center gap-1 rounded-lg border p-2.5 text-[11px] font-semibold transition-colors ${
                  mode === 'active'
                    ? 'border-purple-400 bg-purple-50 text-purple-800 ring-1 ring-purple-300'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <UserCheck className="h-4 w-4" />
                Active only
              </button>
              <button
                type="button"
                onClick={() => setMode('custom')}
                className={`flex flex-col items-center gap-1 rounded-lg border p-2.5 text-[11px] font-semibold transition-colors ${
                  mode === 'custom'
                    ? 'border-purple-400 bg-purple-50 text-purple-800 ring-1 ring-purple-300'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <ListChecks className="h-4 w-4" />
                Pick members
              </button>
            </div>

            {/* Custom member picker */}
            {mode === 'custom' && (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
                {members.length === 0 ? (
                  <p className="p-4 text-center text-xs text-gray-400">No members to select.</p>
                ) : (
                  members.map((m) => (
                    <label
                      key={m.client_id}
                      className="flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(m.client_id)}
                        onChange={() => toggleMember(m.client_id)}
                        className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                      />
                      <span className="flex-1 truncate text-xs font-medium text-gray-800">
                        {m.full_name}
                      </span>
                      <span className="font-mono text-[10px] text-gray-400">
                        {m.phone_number ?? 'no phone'}
                      </span>
                    </label>
                  ))
                )}
              </div>
            )}

            {/* Message body */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-700" htmlFor="sms-message">
                Message *
              </label>
              <textarea
                id="sms-message"
                rows={4}
                maxLength={480}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="e.g. Reminder: Group meeting tomorrow (Tuesday) at Makola Shed 4, 9:00 AM. Please bring your weekly collection."
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <div className="flex justify-between text-[10px] text-gray-400">
                <span>{recipientsPreview} recipient(s)</span>
                <span>{message.length}/480 characters</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={sending}>
              Cancel
            </Button>
            <Button
              onClick={handleSend}
              disabled={sending || !message.trim()}
              className="bg-purple-600 hover:bg-purple-700 text-white min-w-[130px]"
            >
              {sending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Send SMS
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
