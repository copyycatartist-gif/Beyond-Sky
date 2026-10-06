'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'
import { formatDate } from '@/lib/utils'
import {
  Users,
  UserPlus,
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  Edit3,
  UserX,
  UserCheck,
  Search,
  Building2,
  Mail,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Save,
} from 'lucide-react'
import type { Database, UserRole } from '@/lib/supabase/database.types'
import { canSeeSuperAdmin, visibleStaff } from '@/lib/roles'

type UserProfile = Database['public']['Tables']['users']['Row']

interface UsersManagerProps {
  initialUsers: UserProfile[]
  currentUserId: string
  currentUserRole: UserRole
}

export function UsersManager({ initialUsers, currentUserId, currentUserRole }: UsersManagerProps) {
  const router = useRouter()
  const { toast } = useToast()

  const viewerIsSuperAdmin = canSeeSuperAdmin(currentUserRole)
  const [usersList, setUsersList] = useState<UserProfile[]>(() =>
    visibleStaff(initialUsers, currentUserRole)
  )
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [editRoleModalOpen, setEditRoleModalOpen] = useState(false)
  const [resetPassModalOpen, setResetPassModalOpen] = useState(false)
  const [editProfileModalOpen, setEditProfileModalOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null)

  // Form states for Create User
  const [createName, setCreateName] = useState('')
  const [createEmail, setCreateEmail] = useState('')
  const [createPassword, setCreatePassword] = useState('')
  const [createRole, setCreateRole] = useState<UserRole>('loan_officer')
  const [createBranch, setCreateBranch] = useState('Makola Branch')
  const [submittingCreate, setSubmittingCreate] = useState(false)

  // Form state for Role Assignment
  const [assignedRole, setAssignedRole] = useState<UserRole>('loan_officer')
  const [submittingRole, setSubmittingRole] = useState(false)

  // Form state for Password Reset
  const [adminResetPassword, setAdminResetPassword] = useState('')
  const [submittingReset, setSubmittingReset] = useState(false)

  // Form state for Edit Profile
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editBranch, setEditBranch] = useState('')
  const [submittingEdit, setSubmittingEdit] = useState(false)

  // Action Loading
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)

  // Filter users
  const filteredUsers = visibleStaff(usersList, currentUserRole).filter((u) => {
    const matchesSearch =
      u.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.branch || '').toLowerCase().includes(searchQuery.toLowerCase())

    const matchesRole = roleFilter === 'all' || u.role === roleFilter
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && u.is_active) ||
      (statusFilter === 'decommissioned' && !u.is_active)

    return matchesSearch && matchesRole && matchesStatus
  })

  // 1. Handle Create User
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmittingCreate(true)

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: createName,
          email: createEmail,
          password: createPassword,
          role: createRole,
          branch: createBranch,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create staff account')

      toast({
        title: 'Staff Account Created',
        description: data.message,
        variant: 'success',
      })

      setCreateModalOpen(false)
      setCreateName('')
      setCreateEmail('')
      setCreatePassword('')
      router.refresh()
    } catch (err: any) {
      toast({ title: 'Creation Failed', description: err.message, variant: 'destructive' })
    } finally {
      setSubmittingCreate(false)
    }
  }

  // 2. Handle Reassign Role
  const handleRoleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedUser) return
    setSubmittingRole(true)

    try {
      const res = await fetch(`/api/users/${selectedUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: assignedRole }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to reassign role')

      toast({
        title: 'Role Reassigned',
        description: `Role for ${selectedUser.full_name} changed to '${assignedRole}'.`,
        variant: 'success',
      })

      setUsersList((prev) =>
        prev.map((u) => (u.id === selectedUser.id ? { ...u, role: assignedRole } : u))
      )
      setEditRoleModalOpen(false)
      router.refresh()
    } catch (err: any) {
      toast({ title: 'Role Update Failed', description: err.message, variant: 'destructive' })
    } finally {
      setSubmittingRole(false)
    }
  }

  // 3. Handle Decommission / Reactivate Toggle
  const handleToggleActive = async (targetUser: UserProfile) => {
    if (targetUser.id === currentUserId) {
      toast({
        title: 'Action Denied',
        description: 'You cannot decommission your own account',
        variant: 'destructive',
      })
      return
    }

    const newStatus = !targetUser.is_active
    const actionName = newStatus ? 'Reactivate' : 'Decommission'

    if (!confirm(`Are you sure you want to ${actionName.toLowerCase()} account for '${targetUser.full_name}'?`)) {
      return
    }

    setActionLoadingId(targetUser.id)

    try {
      const res = await fetch(`/api/users/${targetUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: newStatus }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Failed to ${actionName.toLowerCase()} account`)

      toast({
        title: `Account ${newStatus ? 'Reactivated' : 'Decommissioned'}`,
        description: `${targetUser.full_name} is now ${newStatus ? 'Active' : 'Decommissioned'}.`,
        variant: newStatus ? 'success' : 'default',
      })

      setUsersList((prev) =>
        prev.map((u) => (u.id === targetUser.id ? { ...u, is_active: newStatus } : u))
      )
      router.refresh()
    } catch (err: any) {
      toast({ title: 'Status Change Failed', description: err.message, variant: 'destructive' })
    } finally {
      setActionLoadingId(null)
    }
  }

  // 4. Handle Admin Password Reset
  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedUser) return
    setSubmittingReset(true)

    try {
      const res = await fetch(`/api/users/${selectedUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: adminResetPassword }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to reset password')

      toast({
        title: 'Password Reset Successful',
        description: `New password assigned for ${selectedUser.full_name}.`,
        variant: 'success',
      })

      setResetPassModalOpen(false)
      setAdminResetPassword('')
    } catch (err: any) {
      toast({ title: 'Reset Failed', description: err.message, variant: 'destructive' })
    } finally {
      setSubmittingReset(false)
    }
  }

  // 5. Handle Edit Staff Details
  const handleEditProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedUser) return
    setSubmittingEdit(true)

    try {
      const res = await fetch(`/api/users/${selectedUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: editName,
          email: editEmail,
          branch: editBranch,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update details')

      toast({
        title: 'Staff Details Updated',
        description: 'Account information saved successfully.',
        variant: 'success',
      })

      setUsersList((prev) =>
        prev.map((u) =>
          u.id === selectedUser.id
            ? { ...u, full_name: editName, email: editEmail, branch: editBranch }
            : u
        )
      )
      setEditProfileModalOpen(false)
      router.refresh()
    } catch (err: any) {
      toast({ title: 'Update Failed', description: err.message, variant: 'destructive' })
    } finally {
      setSubmittingEdit(false)
    }
  }

  const roleBadges: Record<UserRole, { label: string; class: string }> = {
    accountant_admin: { label: 'Super Admin (Accountant)', class: 'bg-purple-100 text-purple-800 border-purple-200' },
    manager: { label: 'Manager', class: 'bg-blue-100 text-blue-800 border-blue-200' },
    supervisor: { label: 'Supervisor', class: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
    loan_officer: { label: 'Loan Officer', class: 'bg-amber-100 text-amber-800 border-amber-200' },
  }

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">Staff & Role Administration</h2>
            <p className="text-xs text-gray-500">
              Create staff accounts, assign/authorize security roles, and manage active status
            </p>
          </div>
        </div>

        <Button
          onClick={() => setCreateModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold gap-2"
        >
          <UserPlus className="h-4 w-4" /> Create New Staff User
        </Button>
      </div>

      {/* Directory Table Card */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3 border-b border-gray-100 bg-gray-50/50">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-600" />
              Staff Directory ({filteredUsers.length} Users)
            </CardTitle>

            {/* Filter Controls */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
                <Input
                  placeholder="Search staff name, email, branch..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-8 text-xs bg-white"
                />
              </div>

              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="h-8 text-xs border rounded-md px-2 bg-white"
              >
                <option value="all">All Roles</option>
                {viewerIsSuperAdmin && <option value="accountant_admin">Super Admin</option>}
                <option value="manager">Manager</option>
                <option value="supervisor">Supervisor</option>
                <option value="loan_officer">Loan Officer</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-8 text-xs border rounded-md px-2 bg-white"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active Only</option>
                <option value="decommissioned">Decommissioned</option>
              </select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-gray-100 text-xs uppercase text-gray-600 font-semibold">
                <TableRow>
                  <TableHead className="w-12 text-center">#</TableHead>
                  <TableHead>Staff Member</TableHead>
                  <TableHead>System Role</TableHead>
                  <TableHead>Operating Branch</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <tbody className="divide-y text-xs">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-gray-400 font-sans">
                      No staff users match the selected filters.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user, idx) => {
                    const rBadge = roleBadges[user.role] || { label: user.role, class: 'bg-gray-100 text-gray-800' }
                    const isSelf = user.id === currentUserId

                    return (
                      <TableRow key={user.id} className={!user.is_active ? 'bg-red-50/30' : 'hover:bg-blue-50/20'}>
                        <td className="p-3 text-center font-bold text-gray-500">{idx + 1}</td>
                        <td className="p-3">
                          <div className="flex flex-col">
                            <span className="font-bold text-gray-900 flex items-center gap-1.5">
                              {user.full_name}
                              {isSelf && (
                                <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-1.5 py-0.2 rounded">
                                  You
                                </span>
                              )}
                            </span>
                            <span className="text-[11px] text-gray-500 font-mono flex items-center gap-1 mt-0.5">
                              <Mail className="h-3 w-3 text-gray-400" /> {user.email}
                            </span>
                          </div>
                        </td>
                        <td className="p-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${rBadge.class}`}>
                            {rBadge.label}
                          </span>
                        </td>
                        <td className="p-3 font-medium text-gray-700">
                          {user.branch || <span className="text-gray-400">Head Office</span>}
                        </td>
                        <td className="p-3">
                          {user.is_active ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                              <CheckCircle2 className="h-3 w-3" /> Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                              <UserX className="h-3 w-3" /> Decommissioned
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-gray-500 font-mono text-[11px]">
                          {formatDate(user.created_at)}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Reassign Role */}
                            <Button
                              variant="outline"
                              size="sm"
                              title="Authorize / Change Role"
                              onClick={() => {
                                setSelectedUser(user)
                                setAssignedRole(user.role)
                                setEditRoleModalOpen(true)
                              }}
                              className="h-7 px-2 text-[11px] gap-1 text-purple-700 border-purple-200 hover:bg-purple-50"
                            >
                              <ShieldCheck className="h-3 w-3" /> Role
                            </Button>

                            {/* Reset Password */}
                            <Button
                              variant="outline"
                              size="sm"
                              title="Reset Password"
                              onClick={() => {
                                setSelectedUser(user)
                                setAdminResetPassword('')
                                setResetPassModalOpen(true)
                              }}
                              className="h-7 px-2 text-[11px] gap-1 text-amber-700 border-amber-200 hover:bg-amber-50"
                            >
                              <KeyRound className="h-3 w-3" /> Key
                            </Button>

                            {/* Edit Profile */}
                            <Button
                              variant="outline"
                              size="sm"
                              title="Edit Staff Info"
                              onClick={() => {
                                setSelectedUser(user)
                                setEditName(user.full_name)
                                setEditEmail(user.email)
                                setEditBranch(user.branch || '')
                                setEditProfileModalOpen(true)
                              }}
                              className="h-7 px-2 text-[11px] text-gray-600 hover:bg-gray-100"
                            >
                              <Edit3 className="h-3 w-3" />
                            </Button>

                            {/* Decommission / Reactivate */}
                            {!isSelf && (
                              <Button
                                variant={user.is_active ? 'outline' : 'default'}
                                size="sm"
                                title={user.is_active ? 'Decommission Account' : 'Reactivate Account'}
                                disabled={actionLoadingId === user.id}
                                onClick={() => handleToggleActive(user)}
                                className={`h-7 px-2 text-[11px] gap-1 ${
                                  user.is_active
                                    ? 'text-rose-700 border-rose-200 hover:bg-rose-50'
                                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                }`}
                              >
                                {actionLoadingId === user.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : user.is_active ? (
                                  <>
                                    <UserX className="h-3 w-3" /> Decommission
                                  </>
                                ) : (
                                  <>
                                    <UserCheck className="h-3 w-3" /> Reactivate
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                        </td>
                      </TableRow>
                    )
                  })
                )}
              </tbody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ============================================================ */}
      {/* 1. CREATE NEW STAFF USER MODAL */}
      {/* ============================================================ */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <UserPlus className="h-5 w-5 text-blue-600" />
              Create New Staff Account
            </DialogTitle>
            <DialogDescription className="text-xs">
              Provision a new staff profile and password with role-specific access permissions.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cName" className="text-xs">Full Name *</Label>
              <Input
                id="cName"
                placeholder="e.g. Samuel Kwaku Ansong"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                required
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cEmail" className="text-xs">Login Email Address *</Label>
              <Input
                id="cEmail"
                type="email"
                placeholder="e.g. sansong@beyondsky.com"
                value={createEmail}
                onChange={(e) => setCreateEmail(e.target.value)}
                required
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cPass" className="text-xs">Initial Password (min. 6 chars) *</Label>
              <Input
                id="cPass"
                type="password"
                placeholder="••••••••"
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
                required
                className="text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cRole" className="text-xs">System Role *</Label>
                <select
                  id="cRole"
                  value={createRole}
                  onChange={(e) => setCreateRole(e.target.value as UserRole)}
                  className="w-full border rounded-md px-2 py-2 text-xs bg-white"
                  required
                >
                  <option value="loan_officer">Loan Officer</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="manager">Branch Manager</option>
                  {viewerIsSuperAdmin && <option value="accountant_admin">Super Admin</option>}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cBranch" className="text-xs">Operating Branch *</Label>
                <Input
                  id="cBranch"
                  placeholder="Makola Branch"
                  value={createBranch}
                  onChange={(e) => setCreateBranch(e.target.value)}
                  required
                  className="text-xs"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCreateModalOpen(false)}
                disabled={submittingCreate}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={submittingCreate}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold"
              >
                {submittingCreate ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating Staff Account...
                  </>
                ) : (
                  <>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Create Staff User
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/* 2. REASSIGN / AUTHORIZE ROLE MODAL */}
      {/* ============================================================ */}
      <Dialog open={editRoleModalOpen} onOpenChange={setEditRoleModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-5 w-5 text-purple-600" />
              Authorize / Assign Role
            </DialogTitle>
            <DialogDescription className="text-xs">
              Change the system authorization role for <strong>{selectedUser?.full_name}</strong>.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRoleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold">Select New Security Role *</Label>
              <div className="space-y-2">
                {[
                  {
                    id: 'loan_officer',
                    title: 'Loan Officer',
                  },
                  {
                    id: 'supervisor',
                    title: 'Field Supervisor',
                  },
                  {
                    id: 'manager',
                    title: 'Branch Manager',
                  },
                  {
                    id: 'accountant_admin',
                    title: 'Super Admin (Accountant)',
                  },
                ]
                  .filter((r) => viewerIsSuperAdmin || r.id !== 'accountant_admin')
                  .map((r) => (
                  <label
                    key={r.id}
                    className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-all ${
                      assignedRole === r.id
                        ? 'border-purple-600 bg-purple-50/60 shadow-2xs'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="assignedRole"
                      value={r.id}
                      checked={assignedRole === r.id}
                      onChange={() => setAssignedRole(r.id as UserRole)}
                      className="mt-0.5 text-purple-600"
                    />
                    <div>
                      <p className="text-xs font-bold text-gray-900">{r.title}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditRoleModalOpen(false)}
                disabled={submittingRole}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={submittingRole}
                className="bg-purple-600 hover:bg-purple-700 text-white font-bold"
              >
                {submittingRole ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating Role...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Authorize Role
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/* 3. RESET STAFF PASSWORD MODAL */}
      {/* ============================================================ */}
      <Dialog open={resetPassModalOpen} onOpenChange={setResetPassModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-5 w-5 text-amber-600" />
              Reset Staff Password
            </DialogTitle>
            <DialogDescription className="text-xs">
              Assign a new login password for <strong>{selectedUser?.full_name}</strong> ({selectedUser?.email}).
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="adminResetPass" className="text-xs">New Password (min. 6 chars) *</Label>
              <Input
                id="adminResetPass"
                type="password"
                placeholder="Enter new password"
                value={adminResetPassword}
                onChange={(e) => setAdminResetPassword(e.target.value)}
                required
                className="text-xs"
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setResetPassModalOpen(false)}
                disabled={submittingReset}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={submittingReset || adminResetPassword.length < 6}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold"
              >
                {submittingReset ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Resetting Password...
                  </>
                ) : (
                  <>
                    <KeyRound className="mr-2 h-4 w-4" />
                    Save New Password
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/* 4. EDIT STAFF PROFILE MODAL */}
      {/* ============================================================ */}
      <Dialog open={editProfileModalOpen} onOpenChange={setEditProfileModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Edit3 className="h-5 w-5 text-blue-600" />
              Edit Staff Details
            </DialogTitle>
            <DialogDescription className="text-xs">
              Update name, email, or operating branch assignment.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleEditProfileSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="eName" className="text-xs">Full Name *</Label>
              <Input
                id="eName"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="eEmail" className="text-xs">Email Address *</Label>
              <Input
                id="eEmail"
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                required
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="eBranch" className="text-xs">Assigned Branch</Label>
              <Input
                id="eBranch"
                value={editBranch}
                onChange={(e) => setEditBranch(e.target.value)}
                placeholder="Makola Branch"
                className="text-xs"
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditProfileModalOpen(false)}
                disabled={submittingEdit}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={submittingEdit}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold"
              >
                {submittingEdit ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving Changes...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Details
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
