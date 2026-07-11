import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Image } from 'expo-image'
import { searchGifs, type GifItem } from '@/lib/api'
import { theme } from '@/constants/theme'

type Props = {
  visible: boolean
  onPick: (fullUrl: string) => void
  onClose: () => void
}

export function GifPickerSheet({ visible, onPick, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<GifItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!visible) return
    let alive = true
    setLoading(true)
    setError(null)
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => {
      searchGifs(query)
        .then((res) => alive && setItems(res))
        .catch((err) => alive && setError(err instanceof Error ? err.message : 'Could not load GIFs'))
        .finally(() => alive && setLoading(false))
    }, 300)
    return () => {
      alive = false
      if (debounce.current) clearTimeout(debounce.current)
    }
  }, [visible, query])

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.searchRow}>
            <TextInput
              style={styles.search}
              value={query}
              onChangeText={setQuery}
              placeholder="Search GIFs…"
              placeholderTextColor={theme.textFaint}
              autoFocus
            />
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.close}>Close</Text>
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={theme.primary} />
            </View>
          ) : error ? (
            <Text style={styles.error}>{error}</Text>
          ) : items.length === 0 ? (
            <Text style={styles.empty}>No GIFs found.</Text>
          ) : (
            <ScrollView contentContainerStyle={styles.grid}>
              {items.map((gif) => (
                <Pressable key={gif.id} style={styles.tile} onPress={() => onPick(gif.fullUrl)}>
                  <Image source={{ uri: gif.previewUrl }} style={styles.gif} contentFit="cover" />
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000000aa', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: theme.bgElevated,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: theme.space.md,
    gap: theme.space.sm,
    height: '70%',
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: theme.border, alignSelf: 'center' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm },
  search: {
    flex: 1,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius.md,
    color: theme.text,
    paddingHorizontal: theme.space.md,
    paddingVertical: 10,
    fontSize: 15,
  },
  close: { color: theme.primaryMuted, fontSize: 15, fontWeight: '700' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  error: { color: theme.error, fontSize: 14, padding: theme.space.md },
  empty: { color: theme.textFaint, fontSize: 14, padding: theme.space.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingBottom: theme.space.lg },
  tile: {
    width: '32%',
    aspectRatio: 1,
    borderRadius: theme.radius.sm,
    overflow: 'hidden',
    backgroundColor: theme.surface,
  },
  gif: { width: '100%', height: '100%' },
})
