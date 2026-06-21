'use client'

import { useState } from 'react'
import type { Participant, ParticipantGender } from '@/types'

export function usePlayerNameSubmissions() {
  const [pnNameInput, setPnNameInput] = useState('')
  const [pnGender, setPnGender] = useState<ParticipantGender>('female')
  const [pnSubmitting, setPnSubmitting] = useState(false)
  const [pnList, setPnList] = useState<Participant[]>([])
  const [pnOpen, setPnOpen] = useState(false)

  function resetPlayerNameSubmissionsState() {
    setPnNameInput('')
    setPnGender('female')
    setPnSubmitting(false)
    setPnList([])
    setPnOpen(false)
  }

  return {
    pnNameInput, pnGender, pnSubmitting, pnList, pnOpen,
    setPnNameInput, setPnGender, setPnSubmitting, setPnOpen, setPnList,
    resetPlayerNameSubmissionsState,
  }
}

export type PlayerNameSubmissionsState = ReturnType<typeof usePlayerNameSubmissions>
