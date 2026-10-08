'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Link2, Loader2, X } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'

export function SendLoanLinkButton({ clientId }: { clientId: string }) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState<'copy' | 'sms' | null>(null)
  const [url, setUrl] = useState('')
  const [smsNote, setSmsNote] = useState('')

  async function create(sendSms: boolean) {
    setLoading(sendSms ? 'sms' : 'copy')
    setSmsNote('')
    try {
      const res = await fetch('/api/loans/application-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, sendSms }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not create the link')
      setUrl(data.url)
      if (sendSms) {
        setSmsNote(data.smsSent ? 'The link was sent by text.' : (data.smsError || 'The text could not be sent. Copy the link instead.'))
      }
      if (!sendSms && data.url && navigator.clipboard) {
        await navigator.clipboard.writeText(data.url)
        toast({ title: 'Link copied', description: 'Paste it into WhatsApp or a message.' })
      }
    } catch (err: any) {
      toast({ title: 'Could not create the link', description: err.message, variant: 'destructive' })
    } finally {
      setLoading(null)
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setOpen(true)}>
        <Link2 className="h-3.5 w-3.5" />
        Application link
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-gray-900">Loan application link</h2>
                <p className="mt-1 text-sm text-gray-500">
                  The client opens this link, enters their account number and phone, then the code we text them. They choose a weekly or monthly loan. You still approve or reject it.
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-md p-1 hover:bg-gray-100">
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>
            {url && (
              <p className="break-all rounded-md border border-gray-200 bg-gray-50 p-2 font-mono text-xs text-gray-800">{url}</p>
            )}
            {smsNote && <p className="text-sm text-gray-700">{smsNote}</p>}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={loading !== null} onClick={() => create(false)}>
                {loading === 'copy' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Copy link'}
              </Button>
              <Button size="sm" disabled={loading !== null} onClick={() => create(true)}>
                {loading === 'sms' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send by SMS'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
