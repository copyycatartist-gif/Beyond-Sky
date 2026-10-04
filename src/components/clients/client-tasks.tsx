'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Calendar, Plus, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface Task {
  id: string
  title: string
  description: string | null
  due_date: string
  status: 'pending' | 'completed' | 'cancelled'
}

export function ClientTasks({ clientId, initialTasks }: { clientId: string; initialTasks: Task[] }) {
  const router = useRouter()
  const [tasks, setTasks] = useState(initialTasks)
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)

  const addTask = async () => {
    if (!title.trim() || !dueDate) return
    setSaving(true)
    try {
      const res = await fetch('/api/clients/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, title: title.trim(), dueDate }),
      })
      if (res.ok) {
        const newTask = await res.json()
        setTasks(prev => [...prev, newTask])
        setTitle('')
        setDueDate('')
        setShowForm(false)
      }
    } finally {
      setSaving(false)
    }
  }

  const toggleTask = async (taskId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'pending' ? 'completed' : 'pending'
    const res = await fetch('/api/clients/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId, status: newStatus }),
    })
    if (res.ok) {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus as any } : t))
      router.refresh()
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-bold uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
            <Calendar className="h-4 w-4 text-blue-600" />
            Follow-up Tasks
          </CardTitle>
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowForm(!showForm)}>
            <Plus className="h-3 w-3" />
            Add
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        {showForm && (
          <div className="space-y-2 p-3 bg-blue-50/50 rounded-lg border border-blue-100">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title (e.g., Call after market day)"
              className="w-full h-8 rounded-md border border-gray-200 bg-white px-3 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300"
              autoFocus
            />
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full h-8 rounded-md border border-gray-200 bg-white px-3 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" className="h-7 text-xs bg-blue-600 hover:bg-blue-700" onClick={addTask} disabled={saving || !title.trim() || !dueDate}>
                {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Create
              </Button>
            </div>
          </div>
        )}

        {tasks.length === 0 && !showForm ? (
          <p className="text-gray-400 italic">No follow-up tasks scheduled.</p>
        ) : (
          <div className="space-y-1.5">
            {tasks.map(task => (
              <div
                key={task.id}
                className={`flex items-center gap-2.5 p-2 rounded-lg border transition-colors ${
                  task.status === 'completed' ? 'bg-emerald-50/50 border-emerald-100 opacity-70' : 'bg-white border-gray-100'
                }`}
              >
                <button
                  onClick={() => toggleTask(task.id, task.status)}
                  className="shrink-0"
                  aria-label={task.status === 'pending' ? 'Mark complete' : 'Mark pending'}
                >
                  {task.status === 'completed' ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-gray-300 hover:text-blue-500 transition-colors" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`font-medium ${task.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                    {task.title}
                  </p>
                  <p className="text-[10px] text-gray-400">Due: {formatDate(task.due_date)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
