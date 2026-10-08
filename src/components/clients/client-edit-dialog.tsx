'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Edit3, Loader2, X } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import type { MaritalStatus } from '@/lib/supabase/database.types'

interface ClientData {
  id: string
  full_name: string
  phone_number: string
  national_id: string
  spouse_or_father_name: string | null
  age: number | null
  date_of_birth: string | null
  marital_status: MaritalStatus
  residential_address: string | null
  permanent_address: string | null
  business_address: string | null
  business_type: string
  market_location: string
  religion: string | null
  place_of_worship: string | null
  religious_leader_name: string | null
  religious_leader_phone: string | null
  branch: string | null
  area: string | null
  guarantor_name?: string | null
  guarantor_gender?: string | null
  guarantor_phone?: string | null
  guarantor_occupation?: string | null
  guarantor_employer?: string | null
  guarantor_residential_address?: string | null
  guarantor_business?: string | null
  emergency_contact_name?: string | null
  emergency_contact_phone?: string | null
  emergency_contact_relationship?: string | null
  notes?: string | null
}

export function ClientEditDialog({ client, userRole }: { client: ClientData; userRole: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const canEdit = ['manager', 'accountant_admin', 'supervisor', 'loan_officer'].includes(userRole)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    full_name: client.full_name,
    phone_number: client.phone_number,
    national_id: client.national_id,
    spouse_or_father_name: client.spouse_or_father_name || '',
    age: client.age?.toString() || '',
    date_of_birth: client.date_of_birth || '',
    marital_status: client.marital_status || 'married',
    residential_address: client.residential_address || '',
    permanent_address: client.permanent_address || '',
    business_address: client.business_address || '',
    business_type: client.business_type,
    market_location: client.market_location,
    religion: client.religion || '',
    place_of_worship: client.place_of_worship || '',
    religious_leader_name: client.religious_leader_name || '',
    religious_leader_phone: client.religious_leader_phone || '',
    branch: client.branch || '',
    area: client.area || '',
    guarantor_name: client.guarantor_name || '',
    guarantor_gender: client.guarantor_gender || 'male',
    guarantor_phone: client.guarantor_phone || '',
    guarantor_occupation: client.guarantor_occupation || client.guarantor_business || '',
    guarantor_employer: client.guarantor_employer || '',
    guarantor_residential_address: client.guarantor_residential_address || '',
    emergency_contact_name: client.emergency_contact_name || '',
    emergency_contact_phone: client.emergency_contact_phone || '',
    emergency_contact_relationship: client.emergency_contact_relationship || '',
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setForm(prev => {
      const updated = { ...prev, [name]: value }
      if (name === 'date_of_birth' && value) {
        const dob = new Date(value)
        const age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
        updated.age = age.toString()
      }
      return updated
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/clients/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: client.id,
          ...form,
          age: form.age ? parseInt(form.age) : null,
          guarantor_business: form.guarantor_occupation,
        }),
      })
      if (res.ok) {
        setOpen(false)
        toast({ title: 'Client updated', description: 'The client record was saved.' })
        router.refresh()
      } else {
        const data = await res.json().catch(() => ({}))
        toast({
          title: 'Could not save client',
          description: data.error || 'Only a manager or super admin can edit this client.',
          variant: 'destructive',
        })
      }
    } finally {
      setSaving(false)
    }
  }

  if (!canEdit) return null

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setOpen(true)}>
        <Edit3 className="h-3.5 w-3.5" />
        Edit
      </Button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" role="dialog" aria-modal="true" aria-label="Edit client">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-xl z-10">
          <h2 className="text-lg font-bold text-gray-900">Edit Client: {client.full_name}</h2>
          <button onClick={() => setOpen(false)} className="p-1 rounded-md hover:bg-gray-100" aria-label="Close">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Personal */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-gray-700 mb-2">Personal Information</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="edit-full_name">Full Name *</Label>
                <Input id="edit-full_name" name="full_name" value={form.full_name} onChange={handleChange} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-phone">Phone *</Label>
                <Input id="edit-phone" name="phone_number" value={form.phone_number} onChange={handleChange} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-nid">National ID *</Label>
                <Input id="edit-nid" name="national_id" value={form.national_id} onChange={handleChange} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-spouse">Spouse / Father</Label>
                <Input id="edit-spouse" name="spouse_or_father_name" value={form.spouse_or_father_name} onChange={handleChange} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-dob">Date of Birth</Label>
                <Input id="edit-dob" name="date_of_birth" type="date" value={form.date_of_birth} onChange={handleChange} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-age">Age</Label>
                <Input id="edit-age" name="age" type="number" value={form.age} onChange={handleChange} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-area">Area / Zone</Label>
                <Input id="edit-area" name="area" value={form.area} onChange={handleChange} placeholder="Optional" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-marital">Marital Status</Label>
                <select id="edit-marital" name="marital_status" value={form.marital_status} onChange={handleChange}
                  className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-sm">
                  <option value="married">Married</option>
                  <option value="unmarried">Unmarried</option>
                  <option value="abandoned">Abandoned</option>
                  <option value="divorced">Divorced</option>
                  <option value="widow">Widow</option>
                </select>
              </div>
            </div>
          </fieldset>

          {/* Business */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-gray-700 mb-2">Business & Address</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="edit-btype">Business Type *</Label>
                <Input id="edit-btype" name="business_type" value={form.business_type} onChange={handleChange} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-market">Market Location *</Label>
                <Input id="edit-market" name="market_location" value={form.market_location} onChange={handleChange} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="edit-residential">Residential Address</Label>
                <Input id="edit-residential" name="residential_address" value={form.residential_address} onChange={handleChange} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-permanent">Permanent Address</Label>
                <Input id="edit-permanent" name="permanent_address" value={form.permanent_address} onChange={handleChange} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-baddress">Business Address</Label>
                <Input id="edit-baddress" name="business_address" value={form.business_address} onChange={handleChange} />
              </div>
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-gray-700 mb-2">Guarantor</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="edit-gname">Guarantor Name</Label>
                <Input id="edit-gname" name="guarantor_name" value={form.guarantor_name} onChange={handleChange} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-gphone">Guarantor Phone</Label>
                <Input id="edit-gphone" name="guarantor_phone" value={form.guarantor_phone} onChange={handleChange} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-ggender">Gender</Label>
                <select id="edit-ggender" name="guarantor_gender" value={form.guarantor_gender} onChange={handleChange}
                  className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-sm">
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-gocc">Occupation</Label>
                <Input id="edit-gocc" name="guarantor_occupation" value={form.guarantor_occupation} onChange={handleChange} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-gemployer">Employer</Label>
                <Input id="edit-gemployer" name="guarantor_employer" value={form.guarantor_employer} onChange={handleChange} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="edit-gaddress">Guarantor Address</Label>
                <Input id="edit-gaddress" name="guarantor_residential_address" value={form.guarantor_residential_address} onChange={handleChange} />
              </div>
            </div>
          </fieldset>

          {/* Religion */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-gray-700 mb-2">Religious Reference</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="edit-religion">Religion</Label>
                <Input id="edit-religion" name="religion" value={form.religion} onChange={handleChange} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-worship">Place of Worship</Label>
                <Input id="edit-worship" name="place_of_worship" value={form.place_of_worship} onChange={handleChange} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-leader">Religious Leader</Label>
                <Input id="edit-leader" name="religious_leader_name" value={form.religious_leader_name} onChange={handleChange} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-leaderphone">Leader Phone</Label>
                <Input id="edit-leaderphone" name="religious_leader_phone" value={form.religious_leader_phone} onChange={handleChange} />
              </div>
            </div>
          </fieldset>

          {/* Emergency Contact */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-gray-700 mb-2">Emergency Contact</legend>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="edit-ecname">Name</Label>
                <Input id="edit-ecname" name="emergency_contact_name" value={form.emergency_contact_name} onChange={handleChange} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-ecphone">Phone</Label>
                <Input id="edit-ecphone" name="emergency_contact_phone" value={form.emergency_contact_phone} onChange={handleChange} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-ecrel">Relationship</Label>
                <Input id="edit-ecrel" name="emergency_contact_relationship" value={form.emergency_contact_relationship} onChange={handleChange} />
              </div>
            </div>
          </fieldset>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex justify-end gap-3 rounded-b-xl">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button className="bg-blue-600 hover:bg-blue-700 min-w-[140px]" onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving...</> : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  )
}
