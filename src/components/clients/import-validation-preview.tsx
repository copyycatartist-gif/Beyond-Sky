'use client'

import { useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ImportError {
  row: number
  field: string
  message: string
}

interface ImportValidationPreviewProps {
  rows: any[]
  errors: ImportError[]
  onConfirm: () => void
  onCancel: () => void
}

export function ImportValidationPreview({ rows, errors, onConfirm, onCancel }: ImportValidationPreviewProps) {
  const [skipErrors, setSkipErrors] = useState(true)

  // Map of row number (1-based) -> field -> error message
  const errorMap = useMemo(() => {
    const map = new Map<number, Map<string, string>>()
    for (const err of errors) {
      if (!map.has(err.row)) map.set(err.row, new Map())
      map.get(err.row)!.set(err.field, err.message)
    }
    return map
  }, [errors])

  const rowsWithErrors = errorMap.size
  const rowsReady = rows.length - rowsWithErrors

  const columns = useMemo(() => {
    const keys = new Set<string>()
    for (const row of rows) {
      if (row && typeof row === 'object') {
        Object.keys(row).forEach(k => keys.add(k))
      }
    }
    return Array.from(keys)
  }, [rows])

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-0.5 font-medium">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {rowsReady} rows ready
          </span>
          {rowsWithErrors > 0 && (
            <span className="inline-flex items-center gap-1 text-red-700 bg-red-50 border border-red-200 rounded-full px-2.5 py-0.5 font-medium">
              <AlertCircle className="h-3.5 w-3.5" />
              {rowsWithErrors} rows with errors
            </span>
          )}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={skipErrors}
            onChange={(e) => setSkipErrors(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          Skip rows with errors
        </label>
      </div>

      {/* Preview table */}
      <div className="max-h-80 overflow-auto rounded-lg border border-gray-200">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-100 border-b border-gray-200">
              <th className="px-2 py-2 text-left font-semibold text-gray-500 w-10 whitespace-nowrap">#</th>
              {columns.map(col => (
                <th key={col} className="px-2 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const rowNumber = idx + 1
              const rowErrors = errorMap.get(rowNumber)
              return (
                <tr
                  key={rowNumber}
                  className={`border-b border-gray-100 ${idx % 2 === 1 ? 'bg-gray-50/70' : 'bg-white'}`}
                >
                  <td className="px-2 py-1.5 text-gray-400 font-mono align-top">
                    <span className="inline-flex items-center gap-1">
                      {rowErrors && <AlertCircle className="h-3 w-3 text-red-500" />}
                      {rowNumber}
                    </span>
                  </td>
                  {columns.map(col => {
                    const message = rowErrors?.get(col)
                    const value = row?.[col]
                    return (
                      <td
                        key={col}
                        title={message}
                        className={`px-2 py-1.5 align-top max-w-[200px] truncate ${
                          message
                            ? 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-300 cursor-help'
                            : 'text-gray-700'
                        }`}
                      >
                        {value === null || value === undefined || value === '' ? (
                          <span className="text-gray-300">—</span>
                        ) : (
                          String(value)
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="px-2 py-6 text-center text-gray-400 italic">
                  No rows to preview.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          className="h-8 text-xs gap-1"
          onClick={onConfirm}
          disabled={rows.length === 0 || (skipErrors && rowsReady === 0)}
        >
          <Upload className="h-3.5 w-3.5" />
          Confirm Import
          {skipErrors && rowsWithErrors > 0 && rowsReady > 0 && (
            <span className="ml-1 opacity-80">({rowsReady} rows)</span>
          )}
        </Button>
      </div>
    </div>
  )
}
