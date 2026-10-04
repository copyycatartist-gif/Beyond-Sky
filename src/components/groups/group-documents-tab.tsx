'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useToast } from '@/components/ui/use-toast'
import { formatDate } from '@/lib/utils'
import {
  FileText,
  Upload,
  Download,
  Trash2,
  Loader2,
  X,
  FileImage,
  FileSpreadsheet,
  File as FileIcon,
} from 'lucide-react'

const BUCKET = 'group-documents'
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB (bucket limit)

type DocumentType = 'constitution' | 'minutes' | 'photo' | 'agreement' | 'other'

interface GroupDocument {
  id: string
  title: string
  document_type: DocumentType | null
  file_url: string
  file_size: number | null
  created_at: string
  storage_path?: string | null
}

const TYPE_META: Record<string, { label: string; className: string }> = {
  constitution: { label: 'Constitution', className: 'bg-purple-100 text-purple-800 border-purple-200' },
  minutes: { label: 'Minutes', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  photo: { label: 'Photo', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  agreement: { label: 'Agreement', className: 'bg-amber-100 text-amber-800 border-amber-200' },
  other: { label: 'Other', className: 'bg-gray-100 text-gray-700 border-gray-200' },
}

function formatFileSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileIcon(type: string | null) {
  if (type === 'photo') return FileImage
  if (type === 'minutes' || type === 'constitution') return FileSpreadsheet
  return FileText
}

/** Extract the storage object path from a public URL, if it belongs to the bucket */
function extractStoragePath(fileUrl: string): string | null {
  const marker = `/${BUCKET}/`
  const idx = fileUrl.indexOf(marker)
  if (idx === -1) return null
  return fileUrl.slice(idx + marker.length)
}

export function GroupDocumentsTab({
  groupId,
  documents: initialDocuments,
}: {
  groupId: string
  documents: GroupDocument[]
}) {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [documents, setDocuments] = useState<GroupDocument[]>(initialDocuments)
  const [showForm, setShowForm] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    title: '',
    document_type: 'other' as DocumentType,
  })
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_FILE_SIZE) {
      toast({ title: 'File too large', description: 'Maximum upload size is 10MB.', variant: 'destructive' })
      e.target.value = ''
      return
    }
    setSelectedFile(file)
    if (!form.title.trim()) {
      setForm((f) => ({ ...f, title: file.name.replace(/\.[^.]+$/, '') }))
    }
  }

  const handleUpload = async () => {
    if (!selectedFile) {
      toast({ title: 'No file selected', description: 'Choose a file to upload.', variant: 'destructive' })
      return
    }
    if (!form.title.trim()) {
      toast({ title: 'Title required', description: 'Give the document a title.', variant: 'destructive' })
      return
    }

    setUploading(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      const ext = selectedFile.name.includes('.') ? selectedFile.name.split('.').pop() : 'bin'
      const storagePath = `${groupId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, selectedFile, { cacheControl: '3600', upsert: false })

      if (uploadError) {
        toast({ title: 'Upload failed', description: uploadError.message, variant: 'destructive' })
        return
      }

      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)

      const { data, error } = await supabase
        .from('group_documents')
        .insert({
          group_id: groupId,
          title: form.title.trim(),
          document_type: form.document_type,
          file_url: urlData.publicUrl,
          file_size: selectedFile.size,
          uploaded_by: user?.id ?? null,
        })
        .select('id, title, document_type, file_url, file_size, created_at')
        .single()

      if (error) {
        // Best-effort cleanup of the orphaned storage object
        await supabase.storage.from(BUCKET).remove([storagePath])
        toast({ title: 'Could not save record', description: error.message, variant: 'destructive' })
        return
      }

      setDocuments((prev) => [{ ...data, storage_path: storagePath }, ...prev])
      setForm({ title: '', document_type: 'other' })
      setSelectedFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      setShowForm(false)
      toast({ title: 'Document uploaded', description: `${data.title} is now available to the team.`, variant: 'success' })
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Network error', variant: 'destructive' })
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (doc: GroupDocument) => {
    if (!confirm(`Delete "${doc.title}"? This removes the file permanently.`)) return
    setDeletingId(doc.id)
    try {
      const supabase = createClient()

      const storagePath = doc.storage_path ?? extractStoragePath(doc.file_url)
      if (storagePath) {
        const { error: storageError } = await supabase.storage.from(BUCKET).remove([storagePath])
        if (storageError) {
          console.warn('[Group Documents] Storage remove failed:', storageError.message)
        }
      }

      const { error } = await supabase.from('group_documents').delete().eq('id', doc.id)

      if (error) {
        toast({ title: 'Cannot delete', description: error.message, variant: 'destructive' })
        return
      }

      setDocuments((prev) => prev.filter((d) => d.id !== doc.id))
      toast({ title: 'Document deleted', variant: 'success' })
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Network error', variant: 'destructive' })
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-gray-900">Group Documents ({documents.length})</h3>
          <p className="text-xs text-gray-500">Constitutions, meeting minutes, agreements and photos</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} className="bg-blue-600 hover:bg-blue-700 text-xs h-9">
          {showForm ? <X className="h-4 w-4 mr-1.5" /> : <Upload className="h-4 w-4 mr-1.5" />}
          {showForm ? 'Cancel' : 'Upload Document'}
        </Button>
      </div>

      {showForm && (
        <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="doc-title" className="text-xs">Title *</Label>
              <Input
                id="doc-title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Group Constitution 2025"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="doc-type" className="text-xs">Document Type</Label>
              <select
                id="doc-type"
                value={form.document_type}
                onChange={(e) => setForm((f) => ({ ...f, document_type: e.target.value as DocumentType }))}
                className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="constitution">Constitution</option>
                <option value="minutes">Meeting Minutes</option>
                <option value="photo">Photo</option>
                <option value="agreement">Agreement</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="doc-file" className="text-xs">File * (max 10MB)</Label>
              <input
                ref={fileInputRef}
                id="doc-file"
                type="file"
                onChange={handleFileChange}
                className="w-full text-xs text-gray-600 file:mr-3 file:h-8 file:px-3 file:rounded-md file:border-0 file:bg-blue-600 file:text-white file:text-xs file:font-semibold hover:file:bg-blue-700 file:cursor-pointer"
              />
              {selectedFile && (
                <p className="text-[11px] text-gray-500">
                  Selected: <span className="font-medium">{selectedFile.name}</span> ({formatFileSize(selectedFile.size)})
                </p>
              )}
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              onClick={handleUpload}
              disabled={uploading || !selectedFile || !form.title.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-xs h-9"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Upload className="h-4 w-4 mr-1.5" />}
              {uploading ? 'Uploading...' : 'Upload'}
            </Button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-28 text-center text-gray-400 text-xs">
                  <FileIcon className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                  No documents uploaded for this group yet.
                </TableCell>
              </TableRow>
            ) : (
              documents.map((doc) => {
                const meta = TYPE_META[doc.document_type ?? 'other'] ?? TYPE_META.other
                const Icon = fileIcon(doc.document_type)
                return (
                  <TableRow key={doc.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-gray-400 shrink-0" />
                        <span className="text-sm font-semibold text-gray-900">{doc.title}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${meta.className}`}>
                        {meta.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-gray-500">{formatFileSize(doc.file_size)}</TableCell>
                    <TableCell className="text-xs text-gray-500 whitespace-nowrap">{formatDate(doc.created_at)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <a
                        href={doc.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        download
                        className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download
                      </a>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(doc)}
                        disabled={deletingId === doc.id}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 h-7 text-xs px-2"
                      >
                        {deletingId === doc.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                        )}
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
