'use client'

import { useCallback, useRef, useState } from 'react'
import { Camera, Upload, X, Check, Loader2 } from 'lucide-react'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

interface PhotoUploadProps {
  clientId: string
  currentPhotoUrl: string | null
  onUpload?: (url: string) => void
  /** Optional client name used for the initials placeholder */
  clientName?: string | null
}

type Status = 'idle' | 'preview' | 'uploading' | 'error'

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function PhotoUpload({ clientId, currentPhotoUrl, onUpload, clientName }: PhotoUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const [status, setStatus] = useState<Status>('idle')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(currentPhotoUrl)
  const [error, setError] = useState<string | null>(null)

  const initials = clientName ? getInitials(clientName) : '?'

  const clearSelection = useCallback(() => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }
    setSelectedFile(null)
    setPreviewUrl(null)
    setError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (cameraInputRef.current) cameraInputRef.current.value = ''
  }, [previewUrl])

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError('Only image files are allowed.')
      setStatus('error')
      e.target.value = ''
      return
    }

    if (file.size > MAX_FILE_SIZE) {
      setError('Image must be 5MB or smaller.')
      setStatus('error')
      e.target.value = ''
      return
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }

    setSelectedFile(file)
    setPreviewUrl(URL.createObjectURL(file))
    setError(null)
    setStatus('preview')
  }

  const handleUpload = async () => {
    if (!selectedFile) return

    setStatus('uploading')
    setError(null)

    try {
      const formData = new FormData()
      formData.append('photo', selectedFile)
      formData.append('clientId', clientId)

      const res = await fetch('/api/clients/photo', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json().catch(() => null)

      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Upload failed (${res.status})`)
      }

      setPhotoUrl(data.url)
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
      setSelectedFile(null)
      setPreviewUrl(null)
      setStatus('idle')
      if (fileInputRef.current) fileInputRef.current.value = ''
      if (cameraInputRef.current) cameraInputRef.current.value = ''
      onUpload?.(data.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.')
      setStatus('error')
    }
  }

  const openFilePicker = () => {
    if (status === 'uploading') return
    fileInputRef.current?.click()
  }

  const openCamera = () => {
    if (status === 'uploading') return
    cameraInputRef.current?.click()
  }

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Hidden inputs: one for file picker, one for camera capture on mobile */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelected}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
        onChange={handleFileSelected}
      />

      <button
        type="button"
        onClick={openFilePicker}
        disabled={status === 'uploading'}
        className="group relative h-24 w-24 rounded-full overflow-hidden border-2 border-dashed border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50/50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 disabled:cursor-not-allowed"
        aria-label="Upload client photo"
      >
        {status === 'preview' && previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="Photo preview" className="h-full w-full object-cover" />
        ) : status === 'uploading' ? (
          <div className="flex h-full w-full items-center justify-center bg-white/70">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="Client photo" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-lg font-bold text-gray-400 group-hover:text-blue-400">
            {initials}
          </div>
        )}

        {status !== 'uploading' && (
          <span className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-1 bg-black/50 py-1 text-[10px] font-medium text-white opacity-0 group-hover:opacity-100 transition-opacity">
            <Upload className="h-3 w-3" />
            Change
          </span>
        )}
      </button>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={openFilePicker}
          disabled={status === 'uploading'}
          className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          <Upload className="h-3 w-3" />
          Upload
        </button>
        <button
          type="button"
          onClick={openCamera}
          disabled={status === 'uploading'}
          className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          <Camera className="h-3 w-3" />
          Camera
        </button>
      </div>

      {status === 'preview' && selectedFile && (
        <div className="flex w-full items-center justify-center gap-2 rounded-md border border-blue-100 bg-blue-50/60 px-2 py-1.5 text-[11px]">
          <span className="truncate text-gray-600">{selectedFile.name}</span>
          <button
            type="button"
            onClick={handleUpload}
            className="inline-flex items-center gap-1 rounded bg-blue-600 px-2 py-1 font-medium text-white hover:bg-blue-700"
          >
            <Check className="h-3 w-3" />
            Confirm
          </button>
          <button
            type="button"
            onClick={() => {
              clearSelection()
              setStatus('idle')
            }}
            className="inline-flex items-center gap-1 rounded border border-gray-200 bg-white px-2 py-1 font-medium text-gray-600 hover:bg-gray-50"
          >
            <X className="h-3 w-3" />
            Cancel
          </button>
        </div>
      )}

      {status === 'error' && error && (
        <div className="flex w-full items-center justify-between gap-2 rounded-md border border-red-100 bg-red-50 px-2 py-1.5 text-[11px] text-red-600">
          <span className="truncate">{error}</span>
          <div className="flex shrink-0 gap-1">
            {selectedFile && (
              <button
                type="button"
                onClick={handleUpload}
                className="rounded bg-red-600 px-2 py-0.5 font-medium text-white hover:bg-red-700"
              >
                Retry
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                clearSelection()
                setStatus('idle')
              }}
              className="rounded border border-red-200 bg-white px-2 py-0.5 font-medium text-red-600 hover:bg-red-50"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default PhotoUpload
