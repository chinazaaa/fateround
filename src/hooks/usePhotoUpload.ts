'use client'

import { useState, useRef } from 'react'
import { useToast } from '@/components/ui/Toast'
import { getPlayerSession } from '@/lib/utils'
import type { Participant } from '@/types'

export function usePhotoUpload({
  gameCode,
  participantId,
  playerId,
  setParticipants,
}: {
  gameCode: string
  participantId: string | null
  playerId: string | null
  setParticipants: React.Dispatch<React.SetStateAction<Participant[]>>
}) {
  const toast = useToast()
  const [photoUploading, setPhotoUploading] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !participantId || !playerId || photoUploading) return
    e.target.value = ''

    if (file.size > 2 * 1024 * 1024) {
      toast.error('Photo must be under 2MB')
      return
    }

    const resumeToken = getPlayerSession(gameCode)?.resumeToken
    if (!resumeToken) {
      toast.error('Your session expired — rejoin to upload a photo')
      return
    }

    setPhotoUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('gameId', gameCode)
      fd.append('participantId', participantId)
      fd.append('resumeToken', resumeToken)

      const res = await fetch('/api/photos', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to upload photo')
        return
      }
      const url = data.photoUrl + '?t=' + Date.now()
      setParticipants((prev) => prev.map((p) => (p.id === participantId ? { ...p, photo_url: url } : p)))
    } catch {
      toast.error('Upload failed — try again')
    } finally {
      setPhotoUploading(false)
    }
  }

  const handlePhotoDelete = async () => {
    if (!participantId || photoUploading) return
    const resumeToken = getPlayerSession(gameCode)?.resumeToken
    if (!resumeToken) {
      toast.error('Your session expired — rejoin to remove your photo')
      return
    }
    setPhotoUploading(true)
    try {
      const res = await fetch('/api/photos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: gameCode,
          participantId,
          resumeToken,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to remove photo')
        return
      }
      setParticipants((prev) => prev.map((p) => (p.id === participantId ? { ...p, photo_url: null } : p)))
    } catch {
      toast.error('Could not remove photo — try again')
    } finally {
      setPhotoUploading(false)
    }
  }

  return {
    photoUploading,
    photoInputRef,
    handlePhotoUpload,
    handlePhotoDelete,
  }
}

export type PhotoUploadState = ReturnType<typeof usePhotoUpload>
