import Link from 'next/link'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Renders a blog body from Markdown. No `'use client'` — react-markdown produces static
 * output, so this renders on the server (better SEO, no JS shipped). Raw HTML in the source
 * is ignored by default (no rehype-raw), which is the whole reason we don't sanitise the body
 * at write time.
 */
const components: Components = {
  h1: ({ children }) => (
    <h2 className="mt-10 mb-3 text-2xl font-bold tracking-tight" style={{ color: 'var(--text)' }}>
      {children}
    </h2>
  ),
  h2: ({ children }) => (
    <h2 className="mt-10 mb-3 text-2xl font-bold tracking-tight" style={{ color: 'var(--text)' }}>
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-8 mb-2 text-lg font-bold tracking-tight" style={{ color: 'var(--text)' }}>
      {children}
    </h3>
  ),
  p: ({ children }) => (
    <p className="my-4 text-[16px] leading-[1.7]" style={{ color: 'var(--text-muted)' }}>
      {children}
    </p>
  ),
  ul: ({ children }) => <ul className="my-4 list-disc space-y-1.5 pl-6">{children}</ul>,
  ol: ({ children }) => <ol className="my-4 list-decimal space-y-1.5 pl-6">{children}</ol>,
  li: ({ children }) => (
    <li className="text-[16px] leading-[1.7]" style={{ color: 'var(--text-muted)' }}>
      {children}
    </li>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold" style={{ color: 'var(--text)' }}>
      {children}
    </strong>
  ),
  a: ({ href, children }) => {
    const url = href ?? '#'
    const internal = url.startsWith('/')
    const className = 'font-semibold underline'
    const style = { color: 'var(--accent, var(--primary))' }
    if (internal) {
      return (
        <Link href={url} className={className} style={style}>
          {children}
        </Link>
      )
    }
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className={className} style={style}>
        {children}
      </a>
    )
  },
  blockquote: ({ children }) => (
    <blockquote
      className="my-5 border-l-[3px] pl-4 italic"
      style={{ borderColor: 'var(--accent, var(--primary))', color: 'var(--text-muted)' }}
    >
      {children}
    </blockquote>
  ),
  code: ({ children }) => (
    <code
      className="rounded px-1.5 py-0.5 font-mono text-[13.5px]"
      style={{ background: 'var(--surface-2, var(--surface))', color: 'var(--text)' }}
    >
      {children}
    </code>
  ),
  hr: () => <hr className="my-8" style={{ borderColor: 'var(--border)' }} />,
  table: ({ children }) => (
    <div className="my-5 overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b p-2.5 font-bold" style={{ borderColor: 'var(--border)', color: 'var(--text)' }}>
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b p-2.5" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
      {children}
    </td>
  ),
  img: ({ src, alt }) =>
    typeof src === 'string' ? (
      <img
        src={src}
        alt={alt ?? ''}
        className="my-6 w-full rounded-[14px]"
        style={{ border: '1px solid var(--border)' }}
      />
    ) : null,
}

export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {children}
    </ReactMarkdown>
  )
}
