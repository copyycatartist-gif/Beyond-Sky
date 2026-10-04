'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { ShieldAlert } from 'lucide-react'

interface ParSummary {
  total_outstanding: number
  par1_amount: number
  par7_amount: number
  par30_amount: number
  par1_pct: number
  par7_pct: number
  par30_pct: number
}

export function ParChart({ par }: { par: ParSummary | null }) {
  const data = [
    {
      name: 'PAR 1 (>1 Day)',
      amount: par?.par1_amount || 0,
      pct: par?.par1_pct || 0,
      color: '#f59e0b', // amber
    },
    {
      name: 'PAR 7 (>7 Days)',
      amount: par?.par7_amount || 0,
      pct: par?.par7_pct || 0,
      color: '#f97316', // orange
    },
    {
      name: 'PAR 30 (>30 Days)',
      amount: par?.par30_amount || 0,
      pct: par?.par30_pct || 0,
      color: '#ef4444', // red
    },
  ]

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base text-gray-900 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-orange-600" />
              Portfolio At Risk (PAR 1 / 7 / 30)
            </CardTitle>
            <CardDescription className="text-xs">
              Overdue exposure as a percentage of total outstanding principal
            </CardDescription>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Total Outstanding</p>
            <p className="font-bold text-xs text-gray-800">{formatCurrency(par?.total_outstanding)}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 pt-2">
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
              <XAxis type="number" unit="%" domain={[0, 'dataMax + 5']} tick={{ fontSize: 11 }} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={110} />
              <Tooltip
                formatter={(value: any, name: any, props: any) => [
                  `${Number(value).toFixed(1)}% (${formatCurrency(props.payload.amount)})`,
                  'Risk Exposure',
                ]}
              />
              <Bar dataKey="pct" radius={[0, 4, 4, 0]} barSize={22}>
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-100 text-center">
          {data.map((d) => (
            <div key={d.name} className="p-2 rounded bg-slate-50">
              <p className="text-[10px] text-gray-500 font-semibold">{d.name.split(' ')[0]}</p>
              <p className="font-black text-sm text-gray-900">{d.pct.toFixed(1)}%</p>
              <p className="text-[10px] text-gray-400">{formatCurrency(d.amount)}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
