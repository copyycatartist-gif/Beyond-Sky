'use client'

import { useState } from 'react'
import Papa from 'papaparse'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useToast } from '@/components/ui/use-toast'
import {
  Upload,
  Download,
  Users,
  CreditCard,
  FileText,
  UsersRound,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  FileSpreadsheet,
} from 'lucide-react'

type MigrationType = 'group_13week_ledger' | 'clients' | 'transactions' | 'loans' | 'groups'

interface MigrationTabConfig {
  id: MigrationType
  label: string
  icon: React.ElementType
  title: string
  templateFileName: string
  templateHeaders: string
  sampleRow: string
}

const MIGRATION_CONFIGS: Record<MigrationType, MigrationTabConfig> = {
  group_13week_ledger: {
    id: 'group_13week_ledger',
    label: '13-Week Group Field Ledger',
    icon: FileSpreadsheet,
    title: '13-Week Group Repayment Ledger Import',
    templateFileName: 'beyond_sky_13week_group_ledger_template.csv',
    templateHeaders: 'groupName,sn,fullName,phoneNumber,principal,loanAmount,wk1,wk2,wk3,wk4,wk5,wk6,wk7,wk8,wk9,wk10,wk11,wk12,wk13,cumPaid\n',
    sampleRow: 'GROUP 1,1,AMEGBLAME AMEVI,0244123401,2000.00,2730.00,,,,,,,,,,,,,0.00\nGROUP 1,2,TSIKATA DORIS,0208112402,1000.00,1365.00,,,,,,,,,,,,,0.00\nGROUP 1,3,AMILALO THERESA,0559988403,1500.00,2047.50,,,,,,,,,,,,,0.00\nGROUP 1,4,SANDO SITSOFE,0245667404,1500.00,2047.50,,,,,,,,,,,,,0.00\nGROUP 1,5,AGBANYO VERONICA,0209223405,1500.00,2047.50,,,,,,,,,,,,,0.00\n',
  },
  clients: {
    id: 'clients',
    label: 'Client KYC Onboarding',
    icon: Users,
    title: 'Client KYC Directory Onboarding',
    templateFileName: 'beyond_sky_clients_onboarding_template.csv',
    templateHeaders: 'area,fullName,phoneNumber,nationalId,spouseOrFatherName,age,dateOfBirth,maritalStatus,presentAddress,permanentAddress,businessAddress,businessType,marketLocation,religion,placeOfWorship,pastorOrImamName,pastorOrImamPhone,guarantorName,guarantorGender,guarantorPhone,guarantorOccupation,guarantorEmployer,guarantorResidentialAddress\n',
    sampleRow: 'Accra Central,Ama Osei Mensah,0244123456,GHA-712345678-1,Kofi Mensah,36,1988-04-12,married,Hse #44 Makola Lane,Keta Volta Region,Stall #12 Market Circle,Cloth Trader,Makola Market,Christianity,Action Chapel Makola,Rev. Emmanuel Addo,0209876543,Kwame Osei Mensah,male,0201239876,Transport Operator,Metro Mass Transit,Hse #44 Makola Lane\n',
  },
  transactions: {
    id: 'transactions',
    label: 'Batch Repayments & Collections',
    icon: CreditCard,
    title: 'Batch Repayments & Financial Ledger Transactions',
    templateFileName: 'beyond_sky_transactions_batch_template.csv',
    templateHeaders: 'clientAccountNumber,phoneNumber,loanNumber,transactionDate,type,amount,method,momoReference\n',
    sampleRow: 'BSM-000001-8,0244123456,BSM-000001-8-L01,2026-10-01,repayment,210.00,cash,\nBSM-000002-6,0201112233,,2026-10-01,repayment,350.00,momo,MM202610018899\n',
  },
  loans: {
    id: 'loans',
    label: 'Active Credit Facilities',
    icon: FileText,
    title: 'Legacy Active Loans Facilities Migration',
    templateFileName: 'beyond_sky_active_loans_template.csv',
    templateHeaders: 'clientAccountNumber,principal,disbursementDate,cycleNumber,termWeeks,previousLoanAmount,totalPaidSoFar\n',
    sampleRow: 'BSM-000001-8,2000,2026-09-01,1,13,0,630.00\nBSM-000002-6,3000,2026-08-15,2,13,2000,1400.00\n',
  },
  groups: {
    id: 'groups',
    label: 'Solidarity Groups',
    icon: UsersRound,
    title: 'Solidarity Lending Groups Migration',
    templateFileName: 'beyond_sky_groups_template.csv',
    templateHeaders: 'groupName,branch,area,meetingDay,meetingPlace,maxMembers,memberAccountNumbers\n',
    sampleRow: 'Makola Peace Traders Group,Makola Branch,Accra Central,Monday,Makola Market Shed 4,15,"BSM-000001-8, BSM-000002-6"\nKaneshie Star Sellers,Kaneshie Branch,Kaneshie Market,Wednesday,Kaneshie Complex Hall,15,"BSM-000003-4"\n',
  },
}

export function CsvImporter() {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<MigrationType>('clients')
  const [file, setFile] = useState<File | null>(null)
  const [parsedData, setParsedData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [importResults, setImportResults] = useState<{
    migrationType?: string
    successCount: number
    failedCount: number
    importedItems?: any[]
    errors: Array<{ row: number; identifier: string; error: string }>
  } | null>(null)

  const currentConfig = MIGRATION_CONFIGS[activeTab]

  const handleTabChange = (val: string) => {
    setActiveTab(val as MigrationType)
    setFile(null)
    setParsedData([])
    setImportResults(null)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return
    setFile(selectedFile)
    setImportResults(null)

    Papa.parse(selectedFile, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setParsedData(results.data)
      },
      error: (error) => {
        toast({ title: 'CSV Parse Error', description: error.message, variant: 'destructive' })
      },
    })
  }

  const handleImport = async () => {
    if (parsedData.length === 0) return
    setLoading(true)

    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          migrationType: activeTab,
          rows: parsedData,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Import failed')

      setImportResults(data.results)
      toast({
        title: 'Migration Processed',
        description: data.message,
        variant: data.results.failedCount === 0 ? 'success' : 'default',
      })
    } catch (err: any) {
      toast({ title: 'Migration Failed', description: err.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const downloadSampleCsv = (config: MigrationTabConfig) => {
    const content = config.templateHeaders + config.sampleRow
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = config.templateFileName
    a.click()
    URL.revokeObjectURL(url)
  }

  const resetForm = () => {
    setFile(null)
    setParsedData([])
    setImportResults(null)
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Tab Navigation */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 h-auto p-1 bg-slate-200/70 rounded-xl gap-1">
          {Object.values(MIGRATION_CONFIGS).map((cfg) => {
            const Icon = cfg.icon
            return (
              <TabsTrigger
                key={cfg.id}
                value={cfg.id}
                className="py-2.5 px-3 text-xs sm:text-sm font-semibold rounded-lg flex items-center justify-center gap-2 data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm transition-all"
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{cfg.label}</span>
              </TabsTrigger>
            )
          })}
        </TabsList>

        {Object.values(MIGRATION_CONFIGS).map((cfg) => (
          <TabsContent key={cfg.id} value={cfg.id} className="mt-6 space-y-6">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg font-bold text-gray-900 flex items-center gap-2">
                      <cfg.icon className="h-5 w-5 text-blue-600" />
                      {cfg.title}
                    </CardTitle>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => downloadSampleCsv(cfg)}
                    className="text-xs font-semibold gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50 shrink-0 self-start sm:self-auto"
                  >
                    <Download className="h-3.5 w-3.5 text-blue-600" />
                    Download {cfg.label} CSV Template
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="space-y-5">
                {/* Upload Box */}
                {!importResults && (
                  <div className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-2xl p-8 text-center bg-slate-50/50 hover:bg-blue-50/20 transition-all cursor-pointer relative">
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleFileChange}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                    <Upload className="h-10 w-10 text-slate-400 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-slate-700">
                      {file ? file.name : `Choose or drag your ${cfg.label} CSV here`}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      {file ? `${(file.size / 1024).toFixed(1)} KB • Click to swap file` : 'Supports standard UTF-8 CSV exports from Excel, Google Sheets, or legacy software'}
                    </p>
                  </div>
                )}

                {/* Parsed Data Preview */}
                {parsedData.length > 0 && !importResults && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between bg-blue-50/70 p-3 rounded-xl border border-blue-100">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="h-5 w-5 text-blue-600" />
                        <div>
                          <p className="text-xs font-bold text-blue-950">
                            {parsedData.length} Data Rows Detected
                          </p>
                          <p className="text-[11px] text-blue-700">
                            File: <span className="font-semibold">{file?.name}</span> • Ready for database validation
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={resetForm}
                          className="text-xs text-gray-500 hover:text-red-600"
                        >
                          Clear
                        </Button>
                        <Button
                          onClick={handleImport}
                          disabled={loading}
                          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-sm"
                        >
                          {loading ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                              Migrating {parsedData.length} Records...
                            </>
                          ) : (
                            `Run ${cfg.label} Migration`
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Preview Table (First 5 rows) */}
                    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-xs">
                      <div className="px-4 py-2 bg-slate-100/70 border-b border-slate-200 text-[11px] font-semibold text-slate-600 flex justify-between">
                        <span>Preview (First {Math.min(5, parsedData.length)} rows)</span>
                        <span>{Object.keys(parsedData[0] || {}).length} columns detected</span>
                      </div>
                      <div className="overflow-x-auto max-h-60">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-slate-50">
                              <TableHead className="w-12 text-[11px]">#</TableHead>
                              {Object.keys(parsedData[0] || {}).slice(0, 7).map((col) => (
                                <TableHead key={col} className="text-[11px] font-semibold text-slate-700 whitespace-nowrap">
                                  {col}
                                </TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {parsedData.slice(0, 5).map((row, idx) => (
                              <TableRow key={idx} className="text-xs hover:bg-slate-50">
                                <TableCell className="font-mono text-slate-400 font-medium">{idx + 1}</TableCell>
                                {Object.keys(row).slice(0, 7).map((col) => (
                                  <TableCell key={col} className="max-w-[180px] truncate text-slate-800">
                                    {String(row[col] ?? '—')}
                                  </TableCell>
                                ))}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </div>
                )}

                {/* Import Results Card */}
                {importResults && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                        <p className="text-xs text-slate-500 font-medium">Total Rows</p>
                        <p className="text-2xl font-black text-slate-900 mt-0.5">
                          {importResults.successCount + importResults.failedCount}
                        </p>
                      </div>
                      <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                        <div className="flex items-center gap-1.5 text-emerald-700">
                          <CheckCircle2 className="h-4 w-4" />
                          <p className="text-xs font-semibold">Successfully Imported</p>
                        </div>
                        <p className="text-2xl font-black text-emerald-800 mt-0.5">
                          {importResults.successCount}
                        </p>
                      </div>
                      <div className="p-4 rounded-xl bg-rose-50 border border-rose-200">
                        <div className="flex items-center gap-1.5 text-rose-700">
                          <AlertCircle className="h-4 w-4" />
                          <p className="text-xs font-semibold">Failed Validation</p>
                        </div>
                        <p className="text-2xl font-black text-rose-800 mt-0.5">
                          {importResults.failedCount}
                        </p>
                      </div>
                    </div>

                    {/* Successfully Imported Samples */}
                    {importResults.importedItems && importResults.importedItems.length > 0 && (
                      <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-200">
                        <p className="text-xs font-bold text-emerald-950 uppercase tracking-wide mb-2">
                          Successfully Created Records ({importResults.importedItems.length}):
                        </p>
                        <div className="max-h-36 overflow-y-auto space-y-1 text-xs">
                          {importResults.importedItems.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-center py-1 px-2 bg-white rounded border border-emerald-100 font-mono text-[11px]">
                              <span className="font-semibold text-slate-900">
                                {item.name || item.groupName || item.identifier}
                              </span>
                              <span className="text-emerald-700 font-bold">
                                {item.accountNumber || item.loanNumber || item.groupNumber || `GHS ${item.amount}`}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Error List */}
                    {importResults.errors && importResults.errors.length > 0 && (
                      <div className="rounded-xl border border-rose-200 overflow-hidden bg-white">
                        <div className="px-4 py-2.5 bg-rose-100/60 border-b border-rose-200 text-xs font-bold text-rose-900 flex items-center justify-between">
                          <span>Rejection Log ({importResults.errors.length} rows rejected)</span>
                          <span className="text-[10px] text-rose-700">Review rows in CSV and retry</span>
                        </div>
                        <div className="max-h-60 overflow-y-auto">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-rose-50/50 text-xs">
                                <TableHead className="w-16">Row #</TableHead>
                                <TableHead>Identifier</TableHead>
                                <TableHead>Reason for Failure</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {importResults.errors.map((err, idx) => (
                                <TableRow key={idx} className="text-xs hover:bg-rose-50/40">
                                  <TableCell className="font-mono font-bold text-slate-600">{err.row}</TableCell>
                                  <TableCell className="font-semibold text-slate-800">{err.identifier}</TableCell>
                                  <TableCell className="text-rose-700 font-medium">{err.error}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}

                    <div className="flex justify-end pt-2">
                      <Button onClick={resetForm} variant="outline" size="sm" className="text-xs font-semibold gap-1.5">
                        <RefreshCw className="h-3.5 w-3.5" />
                        Upload Another CSV
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
