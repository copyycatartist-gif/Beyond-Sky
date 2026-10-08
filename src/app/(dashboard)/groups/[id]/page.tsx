import { createClient } from '@/lib/supabase/server'
import { getCurrentUserProfile } from '@/lib/supabase/auth'
import { publicStaffName } from '@/lib/roles'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  UsersRound,
  Calendar,
  UserCheck,
  FileSpreadsheet,
  Users,
  Clock,
  ListOrdered,
  StickyNote,
  FolderOpen,
  History,
  MapPin,
  Crown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { formatDate, humanizeStatus } from '@/lib/utils'
import { GroupMembersManager } from '@/components/groups/group-members-manager'
import { GroupCollectionMatrix, type GroupMemberLoanSchedule } from '@/components/groups/group-collection-matrix'
import { GroupStatusToggle } from '@/components/groups/group-status-toggle'
import { groupStatusBadgeClass } from '@/lib/group-status'
import { GroupArchiveButton, GroupPrintButton } from '@/components/groups/group-page-actions'
import { GroupEditDialog } from '@/components/groups/group-edit-dialog'
import { GroupSmsBroadcast } from '@/components/groups/group-sms-broadcast'
import { GroupNotesTab } from '@/components/groups/group-notes-tab'
import { GroupDocumentsTab } from '@/components/groups/group-documents-tab'
import { GroupHistoryTab } from '@/components/groups/group-history-tab'

export const dynamic = 'force-dynamic'

const MANAGER_ROLES = ['manager', 'supervisor', 'accountant_admin']

export default async function GroupDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createClient()
  const profile = await getCurrentUserProfile()
  const canManage = !!profile && MANAGER_ROLES.includes(profile.role)

  // 1. Fetch group
  const { data: group, error } = await supabase
    .from('groups')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !group) {
    notFound()
  }

  const g = group as any

  if (g.group_type !== 'disbursement') {
    notFound()
  }

  // Wave 2: everything that depends only on the group id — fetched in parallel
  const [creatorRes, membersRes, meetingsRes, notesRes, waitlistRes, documentsRes, auditRes, allClientsRes] = await Promise.all([
    // Creator profile
    g.created_by
      ? supabase.from('users').select('full_name, role').eq('id', g.created_by).maybeSingle()
      : Promise.resolve({ data: null as any }),
    // Current group members (active + former)
    supabase
      .from('group_members' as any)
      .select(`
        id, client_id, date_joined, date_left, role, removal_reason, attendance_count, contributions_total,
        clients (id, account_number, full_name, phone_number, business_type, market_location, daily_business_income, status, is_watchlisted, tier)
      `)
      .eq('group_id', params.id)
      .order('date_joined', { ascending: true }),
    // Meetings + attendance
    supabase
      .from('group_meetings' as any)
      .select('id, meeting_date, meeting_place, agenda, notes, created_at, meeting_attendance (id, client_id, status, notes)')
      .eq('group_id', params.id)
      .order('meeting_date', { ascending: false }),
    // Notes
    supabase
      .from('group_notes' as any)
      .select('id, content, created_by, created_at')
      .eq('group_id', params.id)
      .order('created_at', { ascending: false }),
    // Waitlist entries + client info
    supabase
      .from('group_waitlist' as any)
      .select('id, client_id, priority, date_added, notes, status, clients (id, account_number, full_name, phone_number, business_type)')
      .eq('group_id', params.id)
      .eq('status', 'waiting')
      .order('priority', { ascending: false })
      .order('date_added', { ascending: true }),
    // Documents
    supabase
      .from('group_documents' as any)
      .select('id, title, document_type, file_url, file_size, created_at')
      .eq('group_id', params.id)
      .order('created_at', { ascending: false }),
    // Audit history for this group (changed_by → auth.users, so resolve names separately)
    supabase
      .from('audit_log' as any)
      .select('id, action, changed_by, old_values, new_values, changes_diff, created_at')
      .eq('record_id', params.id)
      .order('created_at', { ascending: false })
      .limit(50),
    // All clients (for the "available clients" list)
    supabase
      .from('clients')
      .select('id, account_number, full_name, phone_number, business_type, status, is_watchlisted, daily_business_income')
      .order('full_name', { ascending: true }),
  ])

  const creator = creatorRes.data
  const members = membersRes.data
  const meetingsRaw = meetingsRes.data
  const notesRaw = notesRes.data
  const waitlistRaw = waitlistRes.data
  const documentsRaw = documentsRes.data
  const auditRaw = auditRes.data
  const allClients = allClientsRes.data

  // Derivations from wave 2 (pure JS, no awaits)
  const formattedMembers = ((members as any[]) || []).map((m: any) => ({
    id: m.id,
    client_id: m.client_id,
    date_joined: m.date_joined,
    date_left: m.date_left,
    role: m.role,
    removal_reason: m.removal_reason,
    attendance_count: m.attendance_count,
    contributions_total: m.contributions_total,
    client: m.clients,
  }))

  const activeMembers = formattedMembers.filter((m: any) => m.date_left === null && m.client)
  const formerMembers = formattedMembers.filter((m: any) => m.date_left !== null)
  const activeMemberClientIds = activeMembers.map((m: any) => m.client_id)

  // Meetings derivation
  const meetings = ((meetingsRaw as any[]) || []).map((mt: any) => ({
    id: mt.id,
    meeting_date: mt.meeting_date,
    meeting_place: mt.meeting_place,
    agenda: mt.agenda,
    notes: mt.notes,
    created_at: mt.created_at,
    meeting_attendance: (mt.meeting_attendance || []).map((a: any) => ({
      id: a.id,
      client_id: a.client_id,
      status: a.status,
      notes: a.notes,
    })),
  }))

  // Name lookup for every client referenced (active + former + attendance)
  const allReferencedClientIds = Array.from(
    new Set([
      ...formattedMembers.map((m: any) => m.client_id),
      ...meetings.flatMap((mt: any) => (mt.meeting_attendance || []).map((a: any) => a.client_id)),
    ])
  )

  const noteAuthorIds = Array.from(
    new Set(((notesRaw as any[]) || []).map((n: any) => n.created_by).filter(Boolean))
  )

  const auditActorIds = Array.from(
    new Set(((auditRaw as any[]) || []).map((a: any) => a.changed_by).filter(Boolean))
  )

  // Wave 3: queries that depend on wave-2 results — fetched in parallel
  const [memberLoansRes, nameClientsRes, noteAuthorsRes, auditActorsRes] = await Promise.all([
    // Active loans & repayment schedules for all active members
    activeMemberClientIds.length > 0
      ? supabase
          .from('loans')
          .select(`
            id, loan_number, principal, total_repayable, weekly_installment, status, client_id,
            payment_frequency, term_months, term_weeks,
            repayment_schedule (
              id, installment_number, due_date, expected_amount, paid_amount, balance, status
            )
          `)
          .in('client_id', activeMemberClientIds)
          .in('status', ['active', 'defaulted', 'approved', 'closed'])
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
    allReferencedClientIds.length > 0
      ? supabase.from('clients').select('id, full_name').in('id', allReferencedClientIds)
      : Promise.resolve({ data: [] as any[] }),
    noteAuthorIds.length > 0
      ? supabase.from('users').select('id, full_name, role').in('id', noteAuthorIds)
      : Promise.resolve({ data: [] as any[] }),
    auditActorIds.length > 0
      ? supabase.from('users').select('id, full_name, role').in('id', auditActorIds)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const memberLoans = memberLoansRes.data
  const nameClients = nameClientsRes.data
  const noteAuthors = noteAuthorsRes.data
  const auditActors = auditActorsRes.data

  // Wave 4: ledger balances (needs loan ids from wave 3)
  const loanIds = ((memberLoans as any[]) || []).map((l: any) => l.id)
  const { data: balances } = loanIds.length > 0
    ? await supabase
        .from('client_ledger_summary' as any)
        .select('loan_id, outstanding_balance, total_repaid')
        .in('loan_id', loanIds)
    : { data: [] as any[] }

  const balanceMap: Record<string, { outstanding: number; repaid: number }> = {}
  ;((balances as any[]) || []).forEach((b: any) => {
    balanceMap[b.loan_id] = {
      outstanding: b.outstanding_balance,
      repaid: b.total_repaid,
    }
  })

  // Map each active member to their 13-week schedule structure
  const memberSchedules: GroupMemberLoanSchedule[] = activeMembers.map((m: any, idx: number) => {
    const client = m.client
    const clientLoan = ((memberLoans as any[]) || []).find((l: any) => l.client_id === client.id)

    const rawSchedule = (clientLoan?.repayment_schedule || []).sort(
      (a: any, b: any) => a.installment_number - b.installment_number
    )

    const balInfo = clientLoan ? balanceMap[clientLoan.id] : undefined
    const totalRepayable = clientLoan?.total_repayable || 0
    const outstanding = balInfo?.outstanding ?? totalRepayable
    const cumPaid = balInfo?.repaid ?? (totalRepayable - outstanding)

    const isMonthly = clientLoan?.payment_frequency === 'monthly'
    const periodCount = isMonthly
      ? Math.min(6, Math.max(1, Number(clientLoan?.term_months || clientLoan?.term_weeks || rawSchedule.length || 1)))
      : 13

    const installments = Array.from({ length: periodCount }, (_, wIdx) => {
      const weekNum = wIdx + 1
      const inst = rawSchedule.find((s: any) => s.installment_number === weekNum)
      return {
        week: weekNum,
        dueDate: inst?.due_date,
        expectedAmount: inst ? Number(inst.expected_amount) : (clientLoan?.weekly_installment || 0),
        paidAmount: inst ? Number(inst.paid_amount) : 0,
        balance: inst ? Number(inst.balance) : 0,
        status: inst ? (inst.status as any) : 'upcoming',
      }
    })

    return {
      sn: idx + 1,
      clientId: client.id,
      clientName: client.full_name,
      accountNumber: client.account_number,
      phoneNumber: client.phone_number,
      businessType: client.business_type,
      marketLocation: client.market_location,
      loanId: clientLoan?.id,
      loanNumber: clientLoan?.loan_number,
      principal: clientLoan ? Number(clientLoan.principal) : 0,
      totalRepayable: Number(totalRepayable),
      weeklyInstallment: clientLoan ? Number(clientLoan.weekly_installment) : 0,
      outstandingBalance: Number(outstanding),
      cumulativePaid: Number(cumPaid),
      loanStatus: clientLoan?.status,
      paymentFrequency: isMonthly ? 'monthly' : 'weekly',
      installments,
    }
  })

  // Available clients not currently active in this group
  const availableClients = ((allClients as any[]) || []).filter(
    (c: any) => !activeMemberClientIds.includes(c.id)
  )

  const clientNames: Record<string, string> = {}
  ;((nameClients as any[]) || []).forEach((c: any) => {
    clientNames[c.id] = c.full_name
  })

  // Notes + author names
  const authorMap: Record<string, string> = {}
  ;((noteAuthors as any[]) || []).forEach((u: any) => {
    const name = publicStaffName(u, profile?.role)
    if (name) authorMap[u.id] = name
  })
  const notes = ((notesRaw as any[]) || []).map((n: any) => ({
    id: n.id,
    content: n.content,
    created_by: n.created_by,
    created_at: n.created_at,
    author_name: n.created_by ? authorMap[n.created_by] ?? null : null,
  }))

  // Waitlist entries + client info
  const waitlistEntries = ((waitlistRaw as any[]) || []).map((w: any) => ({
    id: w.id,
    client_id: w.client_id,
    priority: w.priority,
    date_added: w.date_added,
    notes: w.notes,
    status: w.status,
    clients: w.clients ?? null,
  }))

  const queuedClientIds = waitlistEntries.map((w: any) => w.client_id)
  const waitlistCandidates = availableClients
    .filter((c: any) => c.status === 'active' && !c.is_watchlisted && !queuedClientIds.includes(c.id))
    .map((c: any) => ({
      id: c.id,
      account_number: c.account_number,
      full_name: c.full_name,
      business_type: c.business_type,
    }))

  // Documents
  const documents = ((documentsRaw as any[]) || []).map((d: any) => ({
    id: d.id,
    title: d.title,
    document_type: d.document_type,
    file_url: d.file_url,
    file_size: d.file_size,
    created_at: d.created_at,
  }))

  // Audit history for this group
  const auditActorMap: Record<string, { full_name: string; role: string }> = {}
  ;((auditActors as any[]) || []).forEach((u: any) => {
    auditActorMap[u.id] = { full_name: u.full_name, role: u.role }
  })
  const auditEntries = ((auditRaw as any[]) || []).map((a: any) => ({
    id: a.id,
    action: a.action,
    changed_by: a.changed_by,
    old_values: a.old_values,
    new_values: a.new_values,
    changes_diff: a.changes_diff ?? null,
    created_at: a.created_at,
    user: (() => {
      const actor = a.changed_by ? auditActorMap[a.changed_by] : null
      const name = publicStaffName(actor, profile?.role)
      return name ? { full_name: name } : null
    })(),
  }))

  // Leader record
  const leader = activeMembers.find((m: any) => m.role === 'leader')?.client ?? null

  const activeCount = activeMembers.length
  const slotsRemaining = Math.max(0, (g.max_members ?? 15) - activeCount)
  const isArchived = !!g.archived_at

  const smsMembers = activeMembers.map((m: any) => ({
    client_id: m.client_id,
    full_name: m.client.full_name,
    phone_number: m.client.phone_number ?? null,
  }))

  const meetingMembers = activeMembers.map((m: any) => ({
    client_id: m.client_id,
    full_name: m.client.full_name,
  }))

  const leaderCandidates = activeMembers.map((m: any) => ({
    client_id: m.client_id,
    full_name: m.client.full_name,
    account_number: m.client.account_number,
  }))

  const historyFormerMembers = formerMembers.map((m: any) => ({
    id: m.id,
    client_id: m.client_id,
    date_joined: m.date_joined,
    date_left: m.date_left,
    role: m.role,
    removal_reason: m.removal_reason,
    client: m.client
      ? {
          id: m.client.id,
          account_number: m.client.account_number,
          full_name: m.client.full_name,
          phone_number: m.client.phone_number,
          business_type: m.client.business_type,
        }
      : null,
  }))

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="print:hidden flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Link href="/groups">
              <Button variant="outline" size="icon" className="h-9 w-9 shrink-0">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{g.name}</h1>
                <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  {g.group_number}
                </span>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${groupStatusBadgeClass(
                    g.status
                  )}`}
                >
                  {humanizeStatus(g.status)}
                </span>
                {g.group_type && g.group_type !== 'solidarity' && (
                  <Badge variant="outline" className="text-xs capitalize">
                    {g.group_type}
                  </Badge>
                )}
                {isArchived && (
                  <Badge className="bg-amber-100 text-amber-800 border border-amber-200 text-xs">
                    Archived
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 mt-1">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {g.area || 'Disbursement cohort'}
                </span>
                {leader && (
                  <span className="inline-flex items-center gap-1">
                    <Crown className="h-3.5 w-3.5 text-amber-500" />
                    Leader: {leader.full_name}
                  </span>
                )}
                <span>Created {formatDate(g.created_at)} by {publicStaffName(creator, profile?.role) ?? 'Staff'}</span>
              </div>
              {g.description && (
                <p className="text-sm text-gray-600 mt-2 max-w-3xl">{g.description}</p>
              )}
            </div>
          </div>
        </div>

        {/* Admin action bar */}
        <div className="flex flex-wrap items-center gap-2">
          {canManage && (
            <>
              <GroupEditDialog
                group={{
                  id: g.id,
                  name: g.name,
                  branch: g.branch ?? null,
                  area: g.area ?? null,
                  meeting_day: g.meeting_day ?? null,
                  meeting_place: g.meeting_place ?? null,
                  max_members: g.max_members,
                  group_type: g.group_type ?? null,
                  description: g.description ?? null,
                  leader_id: g.leader_id ?? null,
                  min_member_tenure_days: g.min_member_tenure_days ?? null,
                  require_guarantor_chain: g.require_guarantor_chain ?? null,
                }}
                members={leaderCandidates}
                activeMemberCount={activeCount}
              />
              <GroupStatusToggle groupId={g.id} groupName={g.name} currentStatus={g.status} />
              <GroupSmsBroadcast groupId={g.id} groupName={g.name} members={smsMembers} />
              <GroupArchiveButton
                groupId={g.id}
                groupName={g.name}
                archived={isArchived}
                archivedAt={g.archived_at ?? null}
              />
            </>
          )}
          <GroupPrintButton />
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="print:hidden grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 flex items-center gap-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <UsersRound className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium">Active Members</p>
            <p className="text-2xl font-black text-gray-900">{activeCount} / {g.max_members}</p>
            <p className="text-[11px] text-gray-400">{slotsRemaining} slot{slotsRemaining === 1 ? '' : 's'} available</p>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <UserCheck className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium">Collection</p>
            <p className="text-2xl font-black text-emerald-700">{memberSchedules.length}</p>
            <p className="text-[11px] text-gray-400">Loans on this sheet</p>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-4">
          <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
            <Calendar className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium">Group Status</p>
            <p className="text-2xl font-black text-gray-900 capitalize">{humanizeStatus(g.status)}</p>
            <p className="text-[11px] text-gray-400">
              Disbursement collection group
            </p>
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="matrix" className="space-y-4">
        <TabsList className="print:hidden bg-gray-100 p-1 rounded-xl flex-wrap h-auto gap-1">
          <TabsTrigger value="matrix" className="text-xs font-semibold gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-xs">
            <FileSpreadsheet className="h-4 w-4 text-blue-600" />
            Collection Matrix
          </TabsTrigger>
          <TabsTrigger value="members" className="text-xs font-semibold gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-xs">
            <Users className="h-4 w-4 text-gray-600" />
            Members ({activeCount})
          </TabsTrigger>
          <TabsTrigger value="notes" className="text-xs font-semibold gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-xs">
            <StickyNote className="h-4 w-4 text-gray-600" />
            Notes ({notes.length})
          </TabsTrigger>
          <TabsTrigger value="documents" className="text-xs font-semibold gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-xs">
            <FolderOpen className="h-4 w-4 text-gray-600" />
            Documents ({documents.length})
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs font-semibold gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-xs">
            <History className="h-4 w-4 text-gray-600" />
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="matrix" className="space-y-4">
          {(memberSchedules.some((row) => row.paymentFrequency !== 'monthly') ||
            !memberSchedules.some((row) => row.paymentFrequency === 'monthly')) && (
            <GroupCollectionMatrix
              groupId={g.id}
              groupName={g.name}
              groupNumber={g.group_number}
              meetingDay=""
              meetingPlace=""
              branch={g.branch || 'Makola Branch'}
              area={g.area || 'Accra Central'}
              memberSchedules={memberSchedules.filter((row) => row.paymentFrequency !== 'monthly')}
              periodCount={13}
              periodKind="week"
            />
          )}
          {memberSchedules.some((row) => row.paymentFrequency === 'monthly') && (
            <GroupCollectionMatrix
              groupId={g.id}
              groupName={g.name}
              groupNumber={g.group_number}
              meetingDay=""
              meetingPlace=""
              branch={g.branch || 'Makola Branch'}
              area={g.area || 'Accra Central'}
              memberSchedules={memberSchedules.filter((row) => row.paymentFrequency === 'monthly')}
              periodCount={Math.max(1, ...memberSchedules.filter((row) => row.paymentFrequency === 'monthly').map((row) => row.installments.length))}
              periodKind="month"
            />
          )}
        </TabsContent>

        <TabsContent value="members" className="space-y-4 print:hidden">
          <GroupMembersManager
            groupId={g.id}
            groupName={g.name}
            maxMembers={g.max_members}
            currentMembers={formattedMembers}
            availableClients={availableClients}
          />
        </TabsContent>

        <TabsContent value="notes" className="space-y-4 print:hidden">
          <GroupNotesTab
            groupId={g.id}
            notes={notes}
            currentUserId={profile?.id ?? null}
            canManage={canManage}
          />
        </TabsContent>

        <TabsContent value="documents" className="space-y-4 print:hidden">
          <GroupDocumentsTab groupId={g.id} documents={documents} />
        </TabsContent>

        <TabsContent value="history" className="space-y-4 print:hidden">
          <GroupHistoryTab formerMembers={historyFormerMembers} auditEntries={auditEntries} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
