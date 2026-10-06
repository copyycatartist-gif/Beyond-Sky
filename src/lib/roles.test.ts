import { assignableStaffRoles, canAdministerStaff, publicStaffName, visibleStaff } from './roles'

describe('staff administration access', () => {
  const directory = [
    { role: 'accountant_admin', full_name: 'System Owner' },
    { role: 'manager', full_name: 'Ama Mensah' },
    { role: 'loan_officer', full_name: 'Kofi Boateng' },
  ]

  test('only super admin and manager can administer staff', () => {
    expect(canAdministerStaff('accountant_admin')).toBe(true)
    expect(canAdministerStaff('manager')).toBe(true)
    expect(canAdministerStaff('supervisor')).toBe(false)
    expect(canAdministerStaff('loan_officer')).toBe(false)
    expect(canAdministerStaff(null)).toBe(false)
  })

  test('super admin accounts are hidden from every other role', () => {
    expect(visibleStaff(directory, 'manager')).toEqual([
      { role: 'manager', full_name: 'Ama Mensah' },
      { role: 'loan_officer', full_name: 'Kofi Boateng' },
    ])
    expect(visibleStaff(directory, 'supervisor')).toEqual([
      { role: 'manager', full_name: 'Ama Mensah' },
      { role: 'loan_officer', full_name: 'Kofi Boateng' },
    ])
    expect(visibleStaff(directory, 'accountant_admin')).toEqual(directory)
  })

  test('super admin names are omitted for every other role', () => {
    const owner = { full_name: 'System Owner', role: 'accountant_admin' }
    expect(publicStaffName(owner, 'manager')).toBeNull()
    expect(publicStaffName(owner, 'accountant_admin')).toBe('System Owner')
    expect(publicStaffName({ full_name: 'Ama Mensah', role: 'manager' }, 'loan_officer')).toBe('Ama Mensah')
  })

  test('only a super admin can assign the super admin role', () => {
    expect(assignableStaffRoles('manager')).toEqual(['loan_officer', 'supervisor', 'manager'])
    expect(assignableStaffRoles('accountant_admin')).toContain('accountant_admin')
  })
})
