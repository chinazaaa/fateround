#!/usr/bin/env node
/**
 * Submit indexable URLs to IndexNow (Bing, Yandex, and partners) after deploy.
 * Fetches the live sitemap, adds /llms.txt, and POSTs to api.indexnow.org.
 *
 * Usage:
 *   node scripts/submit-indexnow.mjs
 *   SITE_URL=https://dev.fateround.com node scripts/submit-indexnow.mjs
 */

const INDEXNOW_KEY = 'f21dadb0c884e8424306f39f38021291'
const SITE_URL = (process.env.SITE_URL ?? 'https://fateround.com').replace(/\/$/, '')
const host = new URL(SITE_URL).host

function parseSitemapUrls(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].trim())
}

async function main() {
  const sitemapUrl = `${SITE_URL}/sitemap.xml`
  const keyLocation = `${SITE_URL}/${INDEXNOW_KEY}.txt`

  const sitemapRes = await fetch(sitemapUrl)
  if (!sitemapRes.ok) {
    throw new Error(`Failed to fetch sitemap (${sitemapRes.status}): ${sitemapUrl}`)
  }

  const urlList = [...new Set([...parseSitemapUrls(await sitemapRes.text()), `${SITE_URL}/llms.txt`])]
  if (urlList.length === 0) {
    throw new Error(`No URLs found in sitemap: ${sitemapUrl}`)
  }

  const keyRes = await fetch(keyLocation)
  if (!keyRes.ok) {
    throw new Error(`IndexNow key file missing (${keyRes.status}): ${keyLocation}`)
  }

  const body = { host, key: INDEXNOW_KEY, keyLocation, urlList }
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  })

  const text = await res.text()
  if (!res.ok) {
    throw new Error(`IndexNow submission failed (${res.status}): ${text || res.statusText}`)
  }

  console.log(`IndexNow: submitted ${urlList.length} URLs for ${host} (${res.status})`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
