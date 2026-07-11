import { useRouter } from 'expo-router'
import { useCallback } from 'react'

export function useGoHomeAction() {
  const router = useRouter()
  const onPress = useCallback(() => {
    router.replace('/')
  }, [router])
  return { label: 'Go home', onPress }
}
