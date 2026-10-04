import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { GroupForm } from '@/components/groups/group-form'

export default function NewGroupPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/groups">
          <Button variant="outline" size="icon" className="h-9 w-9">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Create Group</h1>
          <p className="text-gray-500 text-sm">
            Add a new micro-lending group for market centers.
          </p>
        </div>
      </div>

      <GroupForm />
    </div>
  )
}
