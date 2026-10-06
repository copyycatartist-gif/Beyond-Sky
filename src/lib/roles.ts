import type { UserRole } from '@/lib/supabase/database.types'

export const SUPER_ADMIN_ROLE: UserRole = 'accountant_admin'

const STAFF_ROLES: UserRole[] = ['loan_officer', 'supervisor', 'manager']

export function canAdministerStaff(role: string | null | undefined): boolean {
  return role === 'accountant_admin' || role === 'manager'
}

export function canSeeSuperAdmin(role: string | null | undefined): boolean {
  return role === SUPER_ADMIN_ROLE
}

export function visibleStaff<T extends { role: string }>(
  users: T[],
  actorRole: string | null | undefined
): T[] {
  if (canSeeSuperAdmin(actorRole)) return users
  return users.filter((user) => user.role !== SUPER_ADMIN_ROLE)
}

export function assignableStaffRoles(actorRole: string | null | undefined): UserRole[] {
  if (canSeeSuperAdmin(actorRole)) return [...STAFF_ROLES, SUPER_ADMIN_ROLE]
  return [...STAFF_ROLES]
}

/** Name safe to show to the current viewer. Super admin names are omitted for everyone else. */
export function publicStaffName(
  person: { full_name?: string | null; role?: string | null } | null | undefined,
  viewerRole: string | null | undefined
): string | null {
  if (!person?.full_name) return null
  if (person.role === SUPER_ADMIN_ROLE && !canSeeSuperAdmin(viewerRole)) return null
  return person.full_name
}
