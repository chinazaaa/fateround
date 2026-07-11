import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { AppButton } from '@/components/ui/AppButton'
import { GameLinkQrCode } from '@/components/session/GameLinkQrCode'
import { theme } from '@/constants/theme'
import {
  buildShareLinks,
  displayGameUrl,
  type ShareLinkDef,
  type ShareLinkKey,
} from '@/lib/game-links'

type Props = {
  gameCode: string
  hostToken?: string | null
  resumeToken?: string | null
  /** Slightly smaller QR for bottom sheets. */
  compact?: boolean
}

export function ShareGameInviteContent({
  gameCode,
  hostToken,
  resumeToken,
  compact = false,
}: Props) {
  const code = gameCode.toUpperCase()
  const links = useMemo(
    () => buildShareLinks({ gameCode, hostToken, resumeToken }),
    [gameCode, hostToken, resumeToken]
  )
  const [tab, setTab] = useState<ShareLinkKey>('invite')
  const [copied, setCopied] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)

  useEffect(() => {
    if (!links.some((link) => link.key === tab)) {
      setTab('invite')
    }
  }, [links, tab])

  useEffect(() => {
    setCopied(false)
  }, [tab])

  const active: ShareLinkDef = links.find((link) => link.key === tab) ?? links[0]!

  const onCopy = async () => {
    await Clipboard.setStringAsync(active.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const onCopyCode = async () => {
    await Clipboard.setStringAsync(code)
    setCodeCopied(true)
    setTimeout(() => setCodeCopied(false), 2000)
  }

  const onShare = async () => {
    try {
      await Share.share({
        message: `${active.shareMessage}\n${active.url}`,
        url: active.url,
      })
    } catch {
      // dismissed
    }
  }

  return (
    <View style={styles.wrap}>
      <Pressable style={styles.codeRow} onPress={() => void onCopyCode()}>
        <Text style={styles.codeLabel}>Game code</Text>
        <Text style={styles.code}>{code}</Text>
        <Text style={styles.codeCopy}>{codeCopied ? 'Copied!' : 'Copy code'}</Text>
      </Pressable>

      {links.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {links.map((link) => {
            const selected = link.key === tab
            return (
              <Pressable
                key={link.key}
                style={[styles.tab, selected && styles.tabSelected]}
                onPress={() => setTab(link.key)}
              >
                <Text style={[styles.tabLabel, selected && styles.tabLabelSelected]}>{link.label}</Text>
              </Pressable>
            )
          })}
        </ScrollView>
      ) : null}

      <Text style={styles.description}>{active.description}</Text>

      <View style={styles.qrBlock}>
        <GameLinkQrCode url={active.url} size={compact ? 140 : 152} />
        <Text style={styles.qrHint}>Scan to join</Text>
      </View>

      <View style={styles.urlBlock}>
        <Text style={styles.url} selectable>
          {displayGameUrl(active.url)}
        </Text>
      </View>

      <View style={styles.actions}>
        <AppButton label="Share link" onPress={() => void onShare()} />
        <AppButton
          label={copied ? 'Copied!' : active.copyLabel}
          variant="secondary"
          onPress={() => void onCopy()}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    gap: theme.space.md,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    flexWrap: 'wrap',
  },
  codeLabel: {
    color: theme.textFaint,
    fontSize: 12,
    fontWeight: '600',
  },
  code: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 2,
    fontFamily: 'Menlo',
  },
  codeCopy: {
    marginLeft: 'auto',
    color: theme.primaryMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  tabs: {
    gap: theme.space.xs,
    paddingVertical: 2,
  },
  tab: {
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.bgElevated,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  tabSelected: {
    borderColor: theme.borderAccent,
    backgroundColor: theme.primarySoft,
  },
  tabLabel: {
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  tabLabelSelected: {
    color: theme.primaryMuted,
  },
  description: {
    color: theme.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  qrBlock: {
    alignItems: 'center',
    gap: theme.space.sm,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.bgElevated,
    paddingVertical: theme.space.lg,
    paddingHorizontal: theme.space.md,
  },
  qrHint: {
    color: theme.textFaint,
    fontSize: 12,
    fontWeight: '600',
  },
  urlBlock: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    paddingHorizontal: theme.space.md,
    paddingVertical: 12,
  },
  url: {
    color: theme.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'Menlo',
  },
  actions: {
    gap: theme.space.sm,
  },
})
