import { appOrigin } from '@/lib/site'

// Explicitly welcome the major AI answer/search crawlers so Fate Round can be
// indexed, cited, and recommended by ChatGPT, Claude, Perplexity, Gemini,
// Apple, Meta AI, and others. The wildcard rule already permits them, but
// naming them makes intent unambiguous and future-proofs against wildcard
// carve-outs.
export const AI_CRAWLERS = [
  // OpenAI
  'GPTBot',
  'ChatGPT-User',
  'OAI-SearchBot',
  // Anthropic
  'ClaudeBot',
  'anthropic-ai',
  'Claude-User',
  'Claude-SearchBot',
  // Perplexity
  'PerplexityBot',
  'Perplexity-User',
  // Google (Gemini / AI Overviews training signal)
  'Google-Extended',
  // Apple Intelligence
  'Applebot-Extended',
  // Meta AI
  'Meta-ExternalAgent',
  'meta-externalagent',
  // Others
  'Amazonbot',
  'cohere-ai',
  'DuckAssistBot',
  'CCBot',
] as const

export const ROBOTS_DISALLOW = ['/game/', '/host/', '/history/', '/admin/'] as const

/** Public IndexNow verification key — also served at /{key}.txt in public/. */
export const INDEXNOW_KEY = 'f21dadb0c884e8424306f39f38021291'

export function buildRobotsTxt(origin: string = appOrigin()): string {
  const lines: string[] = []

  const appendRule = (userAgent: string) => {
    lines.push(`User-agent: ${userAgent}`)
    lines.push('Allow: /')
    for (const path of ROBOTS_DISALLOW) {
      lines.push(`Disallow: ${path}`)
    }
    lines.push('')
  }

  appendRule('*')
  for (const userAgent of AI_CRAWLERS) {
    appendRule(userAgent)
  }

  lines.push('# Machine-readable site summary for AI assistants (https://llmstxt.org/)')
  lines.push(`Llms-Txt: ${origin}/llms.txt`)
  lines.push('')
  lines.push(`Sitemap: ${origin}/sitemap.xml`)

  return `${lines.join('\n')}\n`
}
