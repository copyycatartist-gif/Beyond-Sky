'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'
import { Edit3, Loader2, AlertTriangle } from 'lucide-react'

export interface EditableGroup {
  id: string
  name: string
  branch: string | null
  area: string | null
  meeting_day: string | null
  meeting_place: string | null
  max_members: number
  group_type: string | null
  description: string | null
  leader_id: string | null
  min_member_tenure_days: number | null
  require_guarantor_chain: boolean | null
}

export interface LeaderCandidate {
  client_id: string
  full_name: string
  account_number: string
}

interface GroupEditDialogProps {
  group: EditableGroup
  members: LeaderCandidate[]
  activeMemberCount: number
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const GROUP_TYPES = [
  { value: 'solidarity', label: 'Solidarity Group' },
  { value: 'individual', label: 'Individual Liability' },
  { value: 'cooperative', label: 'Cooperative' },
]

interface FormState {
  name: string
  branch: string
  area: string
  meeting_day: string
  meeting_place: string
  max_members: string
  group_type: string
  description: string
  leader_id: string
  min_member_tenure_days: string
  require_guarantor_chain: boolean
}

/** Zod-lite validation: returns a map of field -> error message */
function validate(form: FormState, activeMemberCount: number): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!form.name.trim() || form.name.trim().length < 3) {
    errors.name = 'Group name must be at least 3 characters.'
  }
  if (!form.branch.trim()) errors.branch = 'Branch is required.'
  if (!form.area.trim()) errors.area = 'Area is required.'
  if (!form.meeting_day) errors.meeting_day = 'Meeting day is required.'

  const maxMembers = parseInt(form.max_members, 10)
  if (Number.isNaN(maxMembers) || maxMembers < 1 || maxMembers > 15) {
    errors.max_members = 'Capacity must be between 1 and 15 (hard business rule).'
  } else if (maxMembers < activeMemberCount) {
    errors.max_members = `Cannot shrink below the current ${activeMemberCount} active members.`
  }

  const tenure = parseInt(form.min_member_tenure_days || '0', 10)
  if (Number.isNaN(tenure) || tenure < 0 || tenure > 365) {
    errors.min_member_tenure_days = 'Tenure must be 0–365 days.'
  }

  return errors
}

export function GroupEditDialog({ group, members, activeMemberCount }: GroupEditDialogProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState<FormState>({
    name: group.name || '',
    branch: group.branch || '',
    area: group.area || '',
    meeting_day: group.meeting_day || 'Monday',
    meeting_place: group.meeting_place || '',
    max_members: String(group.max_members ?? 15),
    group_type: group.group_type || 'solidarity',
    description: group.description || '',
    leader_id: group.leader_id || '',
    min_member_tenure_days: String(group.min_member_tenure_days ?? 0),
    require_guarantor_chain: !!group.require_guarantor_chain,
  })

  const resetForm = () => {
    setForm({
      name: group.name || '',
      branch: group.branch || '',
      area: group.area || '',
      meeting_day: group.meeting_day || 'Monday',
      meeting_place: group.meeting_place || '',
      max_members: String(group.max_members ?? 15),
      group_type: group.group_type || 'solidarity',
      description: group.description || '',
      leader_id: group.leader_id || '',
      min_member_tenure_days: String(group.min_member_tenure_days ?? 0),
      require_guarantor_chain: !!group.require_guarantor_chain,
    })
    setErrors({})
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) resetForm()
  }

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
    setErrors((prev) => {
      if (!prev[name]) return prev
      const next = { ...prev }
      delete next[name]
      return next
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const validationErrors = validate(form, activeMemberCount)
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      return
    }

    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        branch: form.branch.trim(),
        area: form.area.trim(),
        meeting_day: form.meeting_day,
        meeting_place: form.meeting_place.trim() || null,
        max_members: parseInt(form.max_members, 10),
        group_type: form.group_type,
        description: form.description.trim() || null,
        leader_id: form.leader_id || null,
        min_member_tenure_days: parseInt(form.min_member_tenure_days || '0', 10),
        require_guarantor_chain: form.require_guarantor_chain,
      }

      const res = await fetch(`/api/groups/${group.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? 'Failed to update group')

      toast({
        title: 'Group Updated',
        description: `${payload.name} details saved successfully.`,
        variant: 'success',
      })
      setOpen(false)
      router.refresh()
    } catch (err: any) {
      toast({ title: 'Cannot save changes', description: err.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const FieldError = ({ field }: { field: string }) =>
    errors[field] ? (
      <p className="flex items-center gap-1 text-[11px] font-medium text-red-600">
        <AlertTriangle className="h-3 w-3 shrink-0" />
        {errors[field]}
      </p>
    ) : null

  return (
    <>
      <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => handleOpenChange(true)}>
        <Edit3 className="h-3.5 w-3.5" />
        Edit Group
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit3 className="h-4 w-4 text-blue-600" />
              Edit Group Details
            </DialogTitle>
            <DialogDescription>
              Update the group profile, schedule, capacity and rules.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ge-name">Group Name *</Label>
              <Input id="ge-name" name="name" value={form.name} onChange={handleChange} required />
              <FieldError field="name" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="ge-branch">Operating Branch *</Label>
                <Input id="ge-branch" name="branch" value={form.branch} onChange={handleChange} required />
                <FieldError field="branch" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ge-area">Area / Territory *</Label>
                <Input id="ge-area" name="area" value={form.area} onChange={handleChange} required />
                <FieldError field="area" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="ge-day">Weekly Meeting Day *</Label>
                <select
                  id="ge-day"
                  name="meeting_day"
                  value={form.meeting_day}
                  onChange={handleChange}
                  className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {DAYS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <FieldError field="meeting_day" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ge-place">Meeting Place</Label>
                <Input
                  id="ge-place"
                  name="meeting_place"
                  value={form.meeting_place}
                  onChange={handleChange}
                  placeholder="e.g. Makola Market Shed 4"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="ge-max">Max Members (≤ 15) *</Label>
                <Input
                  id="ge-max"
                  name="max_members"
                  type="number"
                  min={1}
                  max={15}
                  value={form.max_members}
                  onChange={handleChange}
                  required
                />
                <FieldError field="max_members" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ge-type">Group Type</Label>
                <select
                  id="ge-type"
                  name="group_type"
                  value={form.group_type}
                  onChange={handleChange}
                  className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {GROUP_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ge-tenure">Min Tenure (days)</Label>
                <Input
                  id="ge-tenure"
                  name="min_member_tenure_days"
                  type="number"
                  min={0}
                  max={365}
                  value={form.min_member_tenure_days}
                  onChange={handleChange}
                />
                <FieldError field="min_member_tenure_days" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ge-leader">Group Leader</Label>
              <select
                id="ge-leader"
                name="leader_id"
                value={form.leader_id}
                onChange={handleChange}
                className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- No leader assigned --</option>
                {members.map((m) => (
                  <option key={m.client_id} value={m.client_id}>
                    {m.full_name} ({m.account_number})
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-gray-500">Only active members can be designated leader.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ge-desc">Description</Label>
              <textarea
                id="ge-desc"
                name="description"
                rows={3}
                value={form.description}
                onChange={handleChange}
                placeholder="Brief description of the group's trade, history or purpose..."
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <label className="flex items-start gap-2.5 rounded-lg border border-gray-200 bg-gray-50 p-3 cursor-pointer">
              <input
                type="checkbox"
                name="require_guarantor_chain"
                checked={form.require_guarantor_chain}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, require_guarantor_chain: e.target.checked }))
                }
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span>
                <span className="block text-xs font-semibold text-gray-800">
                  Require guarantor chain
                </span>
                <span className="block text-[11px] text-gray-500">
                  Each member guarantees the next.
                </span>
              </span>
            </label>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 min-w-[130px]"
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
