import type { MetadataRoute } from 'next'
import { appOrigin } from '@/lib/site'

// Explicitly welcome the major AI answer/search crawlers so Fate Round can be
// indexed, cited, and recommended by ChatGPT, Claude, Perplexity, Gemini,
// Apple, Meta AI, and others. The wildcard rule already permits them, but
// naming them makes intent unambiguous and future-proofs against wildcard
// carve-outs.
const AI_CRAWLERS = [
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

export default function robots(): MetadataRoute.Robots {
  const sitemap = `${appOrigin()}/sitemap.xml`
  const disallow = ['/game/', '/host/', '/history/', '/admin/']

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow,
      },
      ...AI_CRAWLERS.map((userAgent) => ({
        userAgent,
        allow: '/',
        disallow,
      })),
    ],
    sitemap,
  }
}
