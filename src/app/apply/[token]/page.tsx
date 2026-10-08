import { ClientLoanApplyForm } from '@/components/loans/client-loan-apply-form'

export const dynamic = 'force-dynamic'

export default function ApplyPage({ params }: { params: { token: string } }) {
  return <ClientLoanApplyForm token={params.token} />
}
