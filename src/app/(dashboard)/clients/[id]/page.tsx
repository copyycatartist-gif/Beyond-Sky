import { createClient } from '@/lib/supabase/server'
import { getCurrentUserProfile } from '@/lib/supabase/auth'
import { canSeeSuperAdmin } from '@/lib/roles'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Phone, MapPin, Briefcase, UserCheck, Shield, FileText, PlusCircle,
  CreditCard, Building2, User, Church, HeartHandshake,
  MessageSquare, Clock, AlertTriangle, Star, Crown, Zap, ShieldAlert,
  TrendingUp, Calendar, ExternalLink, Eye, Activity, StickyNote, ChevronRight,
  Archive, Camera
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate, loanStatusBadgeClass, clientStatusBadgeClass, humanizeStatus } from '@/lib/utils'
import { ClientNotes } from '@/components/clients/client-notes'
import { ClientEditDialog } from '@/components/clients/client-edit-dialog'
import { ClientTasks } from '@/components/clients/client-tasks'
import { ClientActions } from '@/components/clients/client-actions'
import { ClientPrintButton } from '@/components/clients/client-print-button'
import { PhotoUpload } from '@/components/clients/photo-upload'
import { AuditDiffViewer } from '@/components/clients/audit-diff-viewer'

export const dynamic = 'force-dynamic'

const TIER_CONFIG: Record<string, { icon: any; color: string; label: string }> = {
  bronze: { icon: ShieldAlert, color: 'text-amber-700 bg-amber-50 border-amber-200', label: 'Bronze' },
  silver: { icon: Star, color: 'text-slate-600 bg-slate-50 border-slate-200', label: 'Silver' },
  gold: { icon: Crown, color: 'text-yellow-700 bg-yellow-50 border-yellow-200', label: 'Gold' },
  platinum: { icon: Zap, color: 'text-purple-700 bg-purple-50 border-purple-200', label: 'Platinum' },
}

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createClient()
  const profile = await getCurrentUserProfile()

  // Wave 1: every query that depends only on params.id — fetched in parallel
  const [clientRes, branchesRes, groupMembershipsRes, loansRes, transactionsRes, smsRes, notesRes, tasksRes, auditRes] = await Promise.all([
    supabase
      .from('clients')
      .select('*')
      .eq('id', params.id)
      .single(),
    supabase
      .from('clients')
      .select('branch')
      .not('branch', 'is', null),
    supabase
      .from('group_members')
      .select(`
        id, date_joined, date_left,
        groups (id, group_number, name, status, meeting_day, meeting_place)
      `)
      .eq('client_id', params.id)
      .is('date_left', null),
    supabase
      .from('loans')
      .select('*')
      .eq('client_id', params.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('transactions')
      .select('*')
      .eq('client_id', params.id)
      .order('transaction_date', { ascending: false })
      .limit(10),
    supabase
      .from('sms_log')
      .select('*')
      .eq('client_id', params.id)
      .order('sent_at', { ascending: false })
      .limit(5),
    supabase
      .from('client_notes')
      .select('*')
      .eq('client_id', params.id)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('client_tasks')
      .select('*')
      .eq('client_id', params.id)
      .in('status', ['pending', 'completed'])
      .order('due_date', { ascending: true })
      .limit(5),
    supabase
      .from('audit_log')
      .select('*')
      .eq('table_name', 'clients')
      .eq('record_id', params.id)
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const client = clientRes.data as any
  if (clientRes.error || !client) {
    notFound()
  }

  const groupMemberships = groupMembershipsRes.data as any[] | null
  const loans = (loansRes.data as any[]) || []
  const recentTransactions = transactionsRes.data as any[] | null
  const smsHistory = smsRes.data as any[] | null
  const notesRaw = (notesRes.data as any[]) || []
  const tasks = tasksRes.data as any[] | null
  const auditEntries = auditRes.data as any[] | null

  // Branches for transfer dialog
  const branchesData = branchesRes.data
  const allBranches = Array.from(new Set((branchesData || []).map((b: any) => b.branch).filter(Boolean))) as string[]

  // Wave 2: guarantor cross-link + note author names (created_by → auth.users, resolve via public.users)
  const noteAuthorIds = Array.from(
    new Set(notesRaw.map((n: any) => n.created_by).filter(Boolean))
  ) as string[]

  const [gClientRes, noteAuthorsRes] = await Promise.all([
    (client as any).guarantor_account_number
      ? supabase
          .from('clients')
          .select('id, full_name, account_number')
          .eq('account_number', (client as any).guarantor_account_number)
          .neq('id', params.id)
          .maybeSingle()
      : Promise.resolve({ data: null as any }),
    noteAuthorIds.length > 0
      ? supabase.from('users').select('id, full_name, role').in('id', noteAuthorIds)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const gClient = gClientRes.data
  const guarantorClient: { id: string; full_name: string; account_number: string } | null = gClient
    ? (gClient as any)
    : null

  const authorMap: Record<string, { full_name: string; role: string }> = {}
  ;((noteAuthorsRes.data as any[]) || []).forEach((u: any) => {
    authorMap[u.id] = { full_name: u.full_name, role: u.role }
  })

  const notes = notesRaw.map((note: any) => {
    const author = note.created_by ? authorMap[note.created_by] : null
    if (!author) return { ...note, users: null }
    if (!canSeeSuperAdmin(profile?.role) && author.role === 'accountant_admin') {
      return { ...note, users: { full_name: 'Staff' } }
    }
    return { ...note, users: { full_name: author.full_name } }
  })

  const activeLoan = loans?.find((l: any) => l.status === 'active')
  const pendingLoan = loans?.find((l: any) => l.status === 'pending' || l.status === 'approved')
  const closedLoans = loans?.filter((l: any) => l.status === 'closed').length || 0
  const totalCycles = loans?.length || 0
  const isArchived = !!(client as any).archived_at

  // Group eligibility gate: check if any group this client belongs to has restrictions
  const hasGroupRestriction = groupMemberships?.some((m: any) => m.groups?.status === 'suspended' || m.groups?.status === 'defaulted') || false

  const tierConfig = TIER_CONFIG[(client as any).tier || 'bronze']
  const TierIcon = tierConfig.icon

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-gray-500" aria-label="Breadcrumb">
        <Link href="/clients" className="hover:text-blue-600 transition-colors">Clients</Link>
        <ChevronRight className="h-3 w-3" />
        <span className="text-gray-900 font-medium">{client.full_name}</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/clients">
            <Button variant="outline" size="icon" className="h-9 w-9" aria-label="Back to clients">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          {/* Photo upload */}
          <PhotoUpload
            clientId={params.id}
            currentPhotoUrl={(client as any).photo_url}
            clientName={client.full_name}
          />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{client.full_name}</h1>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${clientStatusBadgeClass(client.status)}`}>
                {client.status}
              </span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${tierConfig.color}`}>
                <TierIcon className="h-3 w-3" />
                {tierConfig.label}
              </span>
              {(client as any).is_watchlisted && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-amber-100 text-amber-800 border-amber-300" title={(client as any).watchlist_reason || 'Watchlisted'}>
                  <ShieldAlert className="h-3 w-3" />
                  Watchlisted
                </span>
              )}
              {(client as any).is_dormant && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border bg-gray-100 text-gray-600 border-gray-200">
                  <Clock className="h-3 w-3" />
                  Dormant
                </span>
              )}
              {isArchived && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border bg-red-50 text-red-700 border-red-200">
                  <Archive className="h-3 w-3" />
                  Archived
                </span>
              )}
            </div>
            <p className="text-sm font-mono text-blue-600 font-bold mt-0.5">
              Account No: {client.account_number} • {client.branch || 'Makola Branch'} ({client.area || 'Central Area'})
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <ClientEditDialog client={client as any} userRole={profile?.role || 'loan_officer'} />

            <ClientPrintButton />

            <Link href={`/sms?clientId=${client.id}`}>
              <Button variant="outline" size="sm" className="h-9 gap-1.5">
                <MessageSquare className="h-3.5 w-3.5" />
                SMS
              </Button>
            </Link>

            {!activeLoan && !pendingLoan && !(client as any).is_watchlisted && !isArchived && !hasGroupRestriction && (
              <Link href={`/loans/new?clientId=${client.id}`}>
                <Button className="h-9 bg-blue-600 hover:bg-blue-700 gap-1.5">
                  <PlusCircle className="h-4 w-4" />
                  Apply for Loan
                </Button>
              </Link>
            )}
            {hasGroupRestriction && !activeLoan && !pendingLoan && (
              <span className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5" />
                Loan blocked: group has restrictions
              </span>
            )}
            {activeLoan && (
              <Link href={`/repayments?clientId=${client.id}`}>
                <Button className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5">
                  <CreditCard className="h-4 w-4" />
                  Record Repayment
                </Button>
              </Link>
            )}
          </div>

          {/* Admin actions row (watchlist, transfer, archive) */}
          <div className="no-print">
            <ClientActions
              clientId={params.id}
              clientName={client.full_name}
              isWatchlisted={!!(client as any).is_watchlisted}
              watchlistReason={(client as any).watchlist_reason}
              isArchived={isArchived}
              currentBranch={client.branch}
              branches={allBranches}
              userRole={profile?.role || 'loan_officer'}
            />
          </div>
        </div>
      </div>

      {/* Quick Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card className="border-gray-100">
          <CardContent className="p-3 text-center">
            <p className="text-[11px] text-gray-500 uppercase tracking-wider">Loan Cycles</p>
            <p className="text-base font-bold text-blue-700 mt-0.5">{totalCycles}</p>
          </CardContent>
        </Card>
        <Card className="border-gray-100">
          <CardContent className="p-3 text-center">
            <p className="text-[11px] text-gray-500 uppercase tracking-wider">Closed Loans</p>
            <p className="text-base font-bold text-gray-900 mt-0.5">{closedLoans}</p>
          </CardContent>
        </Card>
        <Card className="border-gray-100">
          <CardContent className="p-3 text-center">
            <p className="text-[11px] text-gray-500 uppercase tracking-wider">Profile</p>
            <div className="flex items-center justify-center gap-2 mt-1">
              <div className="w-12 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${(client as any).profile_completeness >= 80 ? 'bg-emerald-500' : (client as any).profile_completeness >= 50 ? 'bg-amber-500' : 'bg-red-400'}`}
                  style={{ width: `${(client as any).profile_completeness || 0}%` }}
                />
              </div>
              <span className="text-xs font-bold text-gray-700">{(client as any).profile_completeness || 0}%</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Loan Cycle Progress */}
      {totalCycles > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-4 w-4 text-blue-600" />
              <p className="text-sm font-semibold text-gray-800">Credit Cycle Progression</p>
            </div>
            <div className="flex items-center gap-1 overflow-x-auto pb-2">
              {(loans || []).slice().reverse().map((loan, idx) => (
                <Link key={loan.id} href={`/loans/${loan.id}`} className="shrink-0">
                  <div className={`
                    flex flex-col items-center p-2 rounded-lg border min-w-[80px] transition-colors hover:bg-gray-50
                    ${loan.status === 'closed' ? 'border-emerald-200 bg-emerald-50/50' : ''}
                    ${loan.status === 'active' ? 'border-blue-300 bg-blue-50/50 ring-1 ring-blue-200' : ''}
                    ${loan.status === 'defaulted' ? 'border-red-200 bg-red-50/50' : ''}
                    ${loan.status === 'pending' || loan.status === 'approved' ? 'border-amber-200 bg-amber-50/50' : ''}
                  `}>
                    <span className="text-[10px] text-gray-500">Cycle {loan.cycle_number || idx + 1}</span>
                    <span className="text-xs font-bold text-gray-900">{formatCurrency(loan.principal)}</span>
                    <span className={`text-[10px] mt-0.5 px-1.5 py-0.5 rounded-full border ${loanStatusBadgeClass(loan.status)}`}>
                      {loan.status}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="space-y-6">
          {/* Personal Info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
                <User className="h-4 w-4 text-blue-600" />
                Applicant Personal & KYC Profile
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div>
                <p className="text-gray-400">Ghana Card / National ID</p>
                <p className="font-semibold text-gray-900 font-mono mt-0.5">{client.national_id}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-gray-400">Spouse / Father</p>
                  <p className="font-medium text-gray-800 mt-0.5">{client.spouse_or_father_name || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-gray-400">Marital Status</p>
                  <p className="font-semibold text-gray-800 capitalize mt-0.5">{humanizeStatus(client.marital_status || 'married')}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-gray-400">Phone Number</p>
                  <p className="font-semibold text-gray-900 font-mono mt-0.5 flex items-center gap-1">
                    <Phone className="h-3 w-3 text-blue-500" />
                    <a href={`tel:${client.phone_number}`} className="hover:text-blue-700 hover:underline">
                      {client.phone_number}
                    </a>
                  </p>
                </div>
                <div>
                  <p className="text-gray-400">Age / DOB</p>
                  <p className="font-medium text-gray-800 mt-0.5">
                    {client.age ? `${client.age} yrs` : (client.date_of_birth ? formatDate(client.date_of_birth) : '—')}
                  </p>
                </div>
              </div>
              <div className="border-t border-gray-100 pt-2 space-y-2">
                <div>
                  <p className="text-gray-400">Present Address</p>
                  <p className="font-medium text-gray-800 mt-0.5">{client.residential_address || client.market_location}</p>
                </div>
                <div>
                  <p className="text-gray-400">Permanent Address</p>
                  <p className="font-medium text-gray-800 mt-0.5">{client.permanent_address || 'Greater Accra Region'}</p>
                </div>
                <div>
                  <p className="text-gray-400">Business / Trade & Stall</p>
                  <p className="font-medium text-gray-800 flex items-center gap-1 mt-0.5">
                    <Briefcase className="h-3 w-3 text-blue-500" />
                    {client.business_type} • {client.market_location}
                  </p>
                  <p className="text-gray-400 mt-2">Monthly income</p>
                  <p className="font-medium text-gray-800 mt-0.5">
                    {client.monthly_income != null && Number(client.monthly_income) > 0
                      ? formatCurrency(Number(client.monthly_income))
                      : 'Not recorded'}
                  </p>
                  <a
                    href={`https://www.google.com/maps/search/${encodeURIComponent(client.market_location + ' Ghana')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 mt-1"
                  >
                    <MapPin className="h-2.5 w-2.5" />
                    Open in Maps
                    <ExternalLink className="h-2 w-2" />
                  </a>
                </div>
              </div>

              {/* Emergency Contact */}
              {(client as any).emergency_contact_name && (
                <div className="border-t border-gray-100 pt-2">
                  <p className="text-gray-400">Emergency Contact</p>
                  <p className="font-medium text-gray-800 mt-0.5">
                    {(client as any).emergency_contact_name} • {(client as any).emergency_contact_phone}
                    ({(client as any).emergency_contact_relationship})
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Faith & Religious Reference */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
                <Church className="h-4 w-4 text-purple-600" />
                Place of Worship & Reference
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-gray-400">Religion</p>
                  <p className="font-medium text-gray-800 mt-0.5">{client.religion || 'Christianity'}</p>
                </div>
                <div>
                  <p className="text-gray-400">Place of Worship</p>
                  <p className="font-medium text-gray-800 mt-0.5">{client.place_of_worship || 'Local Assembly'}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-gray-100">
                <div>
                  <p className="text-gray-400">Pastor / Imam</p>
                  <p className="font-medium text-gray-800 mt-0.5">{client.religious_leader_name || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-gray-400">Pastor / Imam Phone</p>
                  <p className="font-medium text-gray-800 font-mono mt-0.5">{client.religious_leader_phone || 'N/A'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Guarantor */}
          <Card className="border-indigo-200">
            <CardHeader className="pb-3 bg-indigo-50/40 rounded-t-xl border-b border-indigo-100">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-indigo-950 flex items-center gap-1.5">
                <Shield className="h-4 w-4 text-indigo-600" />
                Guarantor Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs pt-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400">Guarantor Full Name</p>
                  <p className="font-bold text-gray-900 text-sm mt-0.5">{client.guarantor_name}</p>
                </div>
                {guarantorClient && (
                  <Link href={`/clients/${guarantorClient.id}`}>
                    <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1 border-indigo-200 text-indigo-700 hover:bg-indigo-50">
                      <UserCheck className="h-3 w-3" />
                      View as Client ({guarantorClient.account_number})
                    </Button>
                  </Link>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-gray-400">Gender</p>
                  <p className="font-medium text-gray-800 mt-0.5 capitalize">{client.guarantor_gender || 'Male'}</p>
                </div>
                <div>
                  <p className="text-gray-400">Guarantor A/C #</p>
                  <p className="font-mono text-gray-800 mt-0.5">{client.guarantor_account_number || 'N/A'}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-gray-400">Guarantor Phone</p>
                  <p className="font-semibold text-gray-900 font-mono mt-0.5">
                    <a href={`tel:${client.guarantor_phone}`} className="hover:text-blue-700 hover:underline">
                      {client.guarantor_phone}
                    </a>
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-gray-400">Occupation / Trade</p>
                  <p className="font-medium text-gray-800 mt-0.5">{client.guarantor_occupation || client.guarantor_business}</p>
                </div>
                <div>
                  <p className="text-gray-400">Employer</p>
                  <p className="font-medium text-gray-800 mt-0.5">{client.guarantor_employer || 'Self-Employed'}</p>
                </div>
              </div>
              <div>
                <p className="text-gray-400">Residential Address</p>
                <p className="font-medium text-gray-800 mt-0.5">{client.guarantor_residential_address || 'Accra Metropolis'}</p>
              </div>
            </CardContent>
          </Card>

          {/* Group Affiliation */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
                <HeartHandshake className="h-4 w-4 text-blue-600" />
                Group Affiliation
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs">
              {groupMemberships && groupMemberships.length > 0 ? (
                <div className="space-y-2">
                  {groupMemberships.map((m: any) => (
                    <div key={m.id} className="p-3 bg-blue-50/50 rounded-lg border border-blue-100 flex items-center justify-between">
                      <div>
                        <p className="font-bold text-gray-900 font-mono">{m.groups?.group_number}</p>
                        <p className="font-medium text-gray-800 text-sm">{m.groups?.name}</p>
                      </div>
                      <Link href={`/groups/${m.groups?.id}`}>
                        <Button variant="outline" size="sm" className="text-xs h-7">View Group</Button>
                      </Link>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 italic">Not currently assigned to any group.</p>
              )}
            </CardContent>
          </Card>

          {/* Notes */}
          <ClientNotes clientId={params.id} initialNotes={(notes as any) || []} />

          {/* Follow-up Tasks */}
          <ClientTasks clientId={params.id} initialTasks={(tasks as any) || []} />
        </div>

        {/* Right Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Active Loan */}
          {activeLoan && (
            <Card className="border-emerald-200 bg-emerald-50/30">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-base text-emerald-950 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    Active Facility: {activeLoan.loan_number} (Cycle {activeLoan.cycle_number || 1})
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Link href={`/loans/${activeLoan.id}/contract`}>
                      <Button size="sm" variant="outline" className="text-xs h-8 gap-1">
                        <FileText className="h-3 w-3 text-blue-600" />
                        Contract
                      </Button>
                    </Link>
                    <Link href={`/loans/${activeLoan.id}`}>
                      <Button size="sm" variant="outline" className="text-xs h-8">
                        View Schedule
                      </Button>
                    </Link>
                  </div>
                </div>
                <CardDescription className="text-xs">
                  Disbursed on {formatDate(activeLoan.disbursement_date)} • {activeLoan.term_weeks || 13}-week term
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 bg-white rounded-lg border border-emerald-100">
                  <p className="text-gray-500">Gross Facility</p>
                  <p className="text-base font-bold text-gray-900 mt-0.5">{formatCurrency(activeLoan.principal)}</p>
                </div>
                <div className="p-3 bg-white rounded-lg border border-emerald-100">
                  <p className="text-gray-500">Total Repayable</p>
                  <p className="text-base font-bold text-gray-900 mt-0.5">{formatCurrency(activeLoan.total_repayable)}</p>
                </div>
                <div className="p-3 bg-white rounded-lg border border-emerald-100">
                  <p className="text-gray-500">Weekly Installment</p>
                  <p className="text-base font-bold text-blue-600 mt-0.5">{formatCurrency(activeLoan.weekly_installment)}</p>
                </div>
                <div className="p-3 bg-white rounded-lg border border-emerald-100">
                  <p className="text-gray-500">Net Disbursed</p>
                  <p className="text-base font-bold text-emerald-700 mt-0.5">{formatCurrency(activeLoan.net_disbursement_amount || activeLoan.amount_disbursed_to_client)}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent Transactions */}
          {recentTransactions && recentTransactions.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
                  <Activity className="h-4 w-4 text-blue-600" />
                  Recent Transactions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border border-gray-100 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Direction</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentTransactions.map((tx: any) => (
                        <TableRow key={tx.id} className="text-xs">
                          <TableCell className="whitespace-nowrap text-gray-600">{formatDate(tx.transaction_date)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px] capitalize">{tx.type}</Badge>
                          </TableCell>
                          <TableCell className={`text-right font-bold ${tx.direction === 'credit' ? 'text-emerald-700' : 'text-gray-900'}`}>
                            {tx.direction === 'credit' ? '+' : '-'}{formatCurrency(tx.amount)}
                          </TableCell>
                          <TableCell className="text-gray-600 capitalize">{tx.method}</TableCell>
                          <TableCell>
                            <span className={`text-[10px] font-medium ${tx.direction === 'credit' ? 'text-emerald-600' : 'text-red-600'}`}>
                              {tx.direction}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Loan History */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-gray-900 flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-600" />
                Loan Facility History
              </CardTitle>
              <CardDescription className="text-xs">
                All credit facilities, cycles, and application statuses.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-gray-100 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Loan #</TableHead>
                      <TableHead>Cycle</TableHead>
                      <TableHead className="text-right">Principal</TableHead>
                      <TableHead className="text-right">Total Repayable</TableHead>
                      <TableHead className="text-right">Weekly</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loans && loans.length > 0 ? (
                      loans.map((loan) => (
                        <TableRow key={loan.id} className="hover:bg-slate-50/80 text-xs">
                          <TableCell className="font-mono font-bold text-blue-700">{loan.loan_number}</TableCell>
                          <TableCell className="font-semibold text-gray-700">Cycle {loan.cycle_number || 1}</TableCell>
                          <TableCell className="text-right font-bold text-gray-900">{formatCurrency(loan.principal)}</TableCell>
                          <TableCell className="text-right font-semibold text-gray-800">{formatCurrency(loan.total_repayable)}</TableCell>
                          <TableCell className="text-right font-medium text-blue-700">{formatCurrency(loan.weekly_installment)}/wk</TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${loanStatusBadgeClass(loan.status)}`}>
                              {loan.status}
                            </span>
                          </TableCell>
                          <TableCell className="text-right space-x-1">
                            <Link href={`/loans/${loan.id}/contract`}>
                              <Button variant="ghost" size="sm" className="h-7 text-xs px-2 text-gray-600 hover:text-blue-600">
                                Contract
                              </Button>
                            </Link>
                            <Link href={`/loans/${loan.id}`}>
                              <Button variant="ghost" size="sm" className="h-7 text-xs px-2 text-blue-600">
                                View
                              </Button>
                            </Link>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={7} className="h-24 text-center text-gray-400 text-xs">
                          No loan applications recorded yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* SMS History */}
          {smsHistory && smsHistory.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
                  <MessageSquare className="h-4 w-4 text-purple-600" />
                  Recent SMS Messages
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {smsHistory.map((sms: any) => (
                  <div key={sms.id} className="flex items-start gap-3 p-2.5 rounded-lg bg-gray-50 border border-gray-100 text-xs">
                    <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${sms.status === 'sent' ? 'bg-emerald-500' : sms.status === 'failed' ? 'bg-red-400' : 'bg-amber-400'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-700 truncate">{sms.message_body}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {sms.message_type} • {formatDate(sms.sent_at, 'dd MMM yyyy HH:mm')} • {sms.status}
                      </p>
                    </div>
                  </div>
                ))}
                <Link href={`/sms?clientId=${params.id}`}>
                  <Button variant="ghost" size="sm" className="text-xs text-blue-600 h-7">
                    View all messages →
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}

          {/* Activity Timeline / Audit */}
          {auditEntries && auditEntries.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-gray-500" />
                  Activity Timeline
                </CardTitle>
              </CardHeader>
              <CardContent>
                <AuditDiffViewer entries={auditEntries as any} />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
