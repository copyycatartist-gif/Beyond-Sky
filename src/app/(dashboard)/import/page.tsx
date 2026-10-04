import { CsvImporter } from '@/components/import/csv-importer'

export default function ImportPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Data Migration & Import Center</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Bulk import clients, repayments, loans, and groups
        </p>
      </div>

      <CsvImporter />
    </div>
  )
}
