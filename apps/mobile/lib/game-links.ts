import { WEB_BASE_URL } from '@/lib/config'

export type ShareLinkKey = 'invite' | 'host' | 'play' | 'self'

export type ShareLinkDef = {
  key: ShareLinkKey
  label: string
  description: string
  url: string
  copyLabel: string
  shareMessage: string
}

export function playerGameUrl(gameCode: string): string {
  return `${WEB_BASE_URL.replace(/\/$/, '')}/game/${gameCode.trim().toUpperCase()}`
}

export function playerResumeUrl(gameCode: string, resumeToken: string): string {
  const token = resumeToken.trim().toUpperCase()
  return `${playerGameUrl(gameCode)}?player=${encodeURIComponent(token)}`
}

export function hostGameUrl(gameCode: string, hostToken: string): string {
  const code = gameCode.trim().toUpperCase()
  return `${WEB_BASE_URL.replace(/\/$/, '')}/host/${code}?token=${encodeURIComponent(hostToken.trim())}`
}

/** Host panel + your player seat — manage and play from one link. */
export function hostPlayerUrl(gameCode: string, hostToken: string, resumeToken: string): string {
  const player = resumeToken.trim().toUpperCase()
  return `${hostGameUrl(gameCode, hostToken)}&player=${encodeURIComponent(player)}`
}

/** Strip protocol for compact display. */
export function displayGameUrl(url: string): string {
  return url.replace(/^https?:\/\//, '')
}

/** Share tabs — mirrors web `GameShareMenu` / rooms `ShareSheet`. */
export function buildShareLinks(opts: {
  gameCode: string
  hostToken?: string | null
  resumeToken?: string | null
}): ShareLinkDef[] {
  const { gameCode, hostToken, resumeToken } = opts
  const code = gameCode.toUpperCase()
  const invite = playerGameUrl(gameCode)
  const host = hostToken?.trim()
  const resume = resumeToken?.trim()

  const links: ShareLinkDef[] = [
    {
      key: 'invite',
      label: 'Invite players',
      description: 'Send this to friends so they can join the game.',
      url: invite,
      copyLabel: 'Copy invite link',
      shareMessage: `Join my game on FateRound — code ${code}`,
    },
  ]

  if (host && resume) {
    links.push({
      key: 'play',
      label: 'Your host+play link',
      description: 'Manage the game and play as yourself on another device.',
      url: hostPlayerUrl(gameCode, host, resume),
      copyLabel: 'Copy host + play link',
      shareMessage: `Host + play my FateRound game — code ${code}`,
    })
  } else if (host) {
    links.push({
      key: 'host',
      label: 'Host panel',
      description: 'Reopen your host controls on another device.',
      url: hostGameUrl(gameCode, host),
      copyLabel: 'Copy host link',
      shareMessage: `Host my FateRound game — code ${code}`,
    })
  } else if (resume) {
    links.push({
      key: 'self',
      label: 'Your player link',
      description: 'Pick up where you left off on your phone or another device.',
      url: playerResumeUrl(gameCode, resume),
      copyLabel: 'Copy continue link',
      shareMessage: `Continue my FateRound game — code ${code}`,
    })
  }

  return links
}

export function shareSheetSubtitle(links: ShareLinkDef[]): string {
  if (links.some((l) => l.key === 'play' || l.key === 'host')) {
    return 'Copy a link or scan the QR — invite players or reopen your host panel.'
  }
  if (links.some((l) => l.key === 'self')) {
    return 'Invite friends or save your link to continue on another device.'
  }
  return 'Point a camera at the code or share the link below.'
}
