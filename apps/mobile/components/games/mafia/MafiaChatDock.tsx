import { useRef, useState } from 'react'
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import type { MafiaChatMessage, MafiaPublicPlayer } from '@fateround/shared/mafia'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

/** Flat "#N Name: message" rows, newest last — mirrors web's ChatMessages (no bubbles). */
export function MafiaChatMessageList({
  messages,
  players,
  compact = false,
}: {
  messages: MafiaChatMessage[]
  players?: MafiaPublicPlayer[]
  compact?: boolean
}) {
  const styles = useThemedStyles(makeStyles)
  const listRef = useRef<FlatList>(null)
  const seatByPlayerId = new Map((players ?? []).map((p) => [p.id, p.seatNumber]))

  if (messages.length === 0) {
    return <Text style={styles.emptyText}>No messages yet.</Text>
  }

  return (
    <FlatList
      data={messages}
      keyExtractor={(m) => m.id}
      nestedScrollEnabled
      inverted={compact}
      onContentSizeChange={(_w, _h) => {
        if (!compact) listRef.current?.scrollToEnd({ animated: false })
      }}
      ref={listRef as any}
      renderItem={({ item }) => {
        if (item.sender_player_id === 'system') {
          return <Text style={styles.systemLine}>{item.message}</Text>
        }
        const seat = seatByPlayerId.get(item.sender_player_id)
        return (
          <Text style={styles.chatLine}>
            <Text style={styles.chatName}>
              {seat != null ? `#${seat} ` : ''}
              {item.sender_name}:{' '}
            </Text>
            {item.message}
          </Text>
        )
      }}
    />
  )
}

/**
 * Borderless inline snippet of the last few messages — flows naturally below the player
 * grid (Wolvesville-style), no card wrapper. Tapping it opens the full `MafiaChatModal`.
 */
export function MafiaChatPreview({
  messages,
  players,
  onPress,
}: {
  title: string
  messages: MafiaChatMessage[]
  players?: MafiaPublicPlayer[]
  accent?: 'mafia'
  onPress: () => void
}) {
  const styles = useThemedStyles(makeStyles)
  const latest = messages.slice(-6)
  return (
    <Pressable style={styles.inlinePreview} onPress={onPress}>
      <View pointerEvents="none">
        <MafiaChatMessageList messages={latest} players={players} />
      </View>
    </Pressable>
  )
}

/**
 * The full-screen chat popup — dims the roster behind it (Wolvesville-style), not a
 * separate screen/tab. `canType` false renders a note instead of an input row (still lets
 * you read the log, just not post to it) rather than hiding the whole modal.
 */
export function MafiaChatModal({
  visible,
  onClose,
  title,
  messages,
  players,
  accent,
  canType,
  phase,
  onSend,
}: {
  visible: boolean
  onClose: () => void
  title: string
  messages: MafiaChatMessage[]
  players?: MafiaPublicPlayer[]
  accent?: 'mafia'
  canType: boolean
  phase?: string
  onSend?: (msg: string) => Promise<void> | void
}) {
  const styles = useThemedStyles(makeStyles)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  const submit = async () => {
    const msg = draft.trim()
    if (!msg || sending || !onSend) return
    setSending(true)
    try {
      await onSend(msg)
      setDraft('')
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        style={styles.sheetWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        pointerEvents="box-none"
      >
        <View style={[styles.sheetPanel, accent === 'mafia' && styles.mafiaAccentBorder]}>
          <View style={[styles.sheetHeader, accent === 'mafia' && styles.mafiaAccentBorder]}>
            <Text style={[styles.headerTitle, accent === 'mafia' && styles.mafiaAccentText]}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
              <Text style={styles.closeX}>✕</Text>
            </Pressable>
          </View>
          <View style={styles.sheetLog}>
            <MafiaChatMessageList messages={messages} players={players} />
          </View>
          <View style={[styles.inputRow, accent === 'mafia' && styles.mafiaAccentBorder]}>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="Type a message…"
              placeholderTextColor="#71717a"
              autoFocus={canType}
            />
            <Pressable
              style={styles.sendBtn}
              disabled={sending || !draft.trim() || !canType}
              onPress={() => void submit()}
            >
              <Text style={styles.sendBtnText}>{canType ? 'Send' : phase === 'night' ? '💤' : '⏳'}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

/**
 * The persistent bottom input bar, Wolvesville-style: it's always the same element whether
 * or not the modal is open (never restructured around the focused input — see web's note
 * about that causing the keyboard to close the instant it opened on some browsers). Tapping
 * it opens the full `MafiaChatModal`; a real `onSubmit` still lets you send without opening
 * it first.
 */
export function MafiaChatBar({
  icon,
  placeholder,
  canType,
  phase,
  onOpen,
  onSend,
  peekIcon,
  onPeek,
  accent,
}: {
  icon: string
  placeholder: string
  canType: boolean
  phase?: string
  onOpen: () => void
  onSend: (msg: string) => Promise<void> | void
  peekIcon?: string
  onPeek?: () => void
  accent?: 'mafia'
}) {
  const styles = useThemedStyles(makeStyles)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  const submit = async () => {
    const msg = draft.trim()
    if (!msg || sending || !canType) return
    setSending(true)
    try {
      await onSend(msg)
      setDraft('')
    } finally {
      setSending(false)
    }
  }

  return (
    <View style={[styles.bottomBar, accent === 'mafia' && styles.mafiaAccentBorder]}>
      <Text style={styles.bottomBarIcon}>{icon}</Text>
      <TextInput
        style={[styles.bottomBarInput, accent === 'mafia' && styles.mafiaAccentText]}
        value={draft}
        onChangeText={setDraft}
        onFocus={onOpen}
        placeholder={placeholder}
        placeholderTextColor="#71717a"
      />
      <Pressable style={styles.sendBtn} disabled={sending || !draft.trim() || !canType} onPress={() => void submit()}>
        <Text style={styles.sendBtnText}>{canType ? 'Send' : phase === 'night' ? '💤' : '⏳'}</Text>
      </Pressable>
      {peekIcon ? (
        <Pressable style={styles.peekBtn} onPress={onPeek} hitSlop={8}>
          <Text style={styles.peekIcon}>{peekIcon}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    emptyText: { color: theme.textMuted, fontSize: 12, fontStyle: 'italic', textAlign: 'center', paddingVertical: 16 },
    systemLine: { color: '#f472b6', fontWeight: '700', fontSize: 13, textAlign: 'center', marginVertical: 2 },
    chatLine: { color: theme.textSecondary, fontSize: 13, marginBottom: 4 },
    chatName: { color: theme.text, fontWeight: '700' },
    inlinePreview: { paddingHorizontal: 4 },
    mafiaAccentText: { color: '#f87171' },
    mafiaAccentBorder: { borderColor: '#f4374766' },
    backdrop: { ...StyleSheet.absoluteFill, backgroundColor: '#00000060' },
    sheetWrap: { flex: 1, justifyContent: 'flex-end' },
    sheetPanel: {
      backgroundColor: theme.bg,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      borderWidth: 1,
      borderColor: theme.border,
      borderBottomWidth: 0,
      height: '60%',
      paddingBottom: 20,
    },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    closeBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    closeX: { color: theme.text, fontSize: 16 },
    headerTitle: { color: theme.text, fontSize: 14, fontWeight: '700' },
    modalTitle: { color: theme.textMuted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
    sheetLog: { flex: 1, paddingHorizontal: 16, paddingVertical: 10 },
    disabledNote: {
      color: theme.textMuted,
      fontSize: 11,
      fontStyle: 'italic',
      textAlign: 'center',
      paddingVertical: 10,
    },
    inputRow: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 16,
      paddingTop: 8,
    },
    input: {
      flex: 1,
      backgroundColor: theme.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: theme.text,
    },
    sendBtn: {
      backgroundColor: theme.primary,
      borderRadius: 8,
      paddingHorizontal: 16,
      justifyContent: 'center',
    },
    sendBtnText: { color: '#fff', fontWeight: '800' },
    bottomBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: theme.surface,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    bottomBarIcon: { fontSize: 18 },
    bottomBarInput: { flex: 1, color: theme.text, paddingVertical: 6 },
    peekBtn: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderLeftWidth: 1,
      borderLeftColor: theme.border,
    },
    peekIcon: { fontSize: 16 },
  })
