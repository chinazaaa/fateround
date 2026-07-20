// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Markdown } from './Markdown'

describe('Markdown', () => {
  it('renders headings, bold and lists', () => {
    const { container } = render(<Markdown>{'## A heading\n\nSome **bold** text.\n\n- one\n- two'}</Markdown>)
    expect(container.querySelector('h2')?.textContent).toBe('A heading')
    expect(container.querySelector('strong')?.textContent).toBe('bold')
    expect(container.querySelectorAll('ul li')).toHaveLength(2)
  })

  it('renders internal links as same-tab anchors and external links with target=_blank', () => {
    const { container } = render(<Markdown>{'[games](/games) and [x](https://example.com)'}</Markdown>)
    const anchors = [...container.querySelectorAll('a')]
    const internal = anchors.find((a) => a.getAttribute('href') === '/games')
    const external = anchors.find((a) => a.getAttribute('href') === 'https://example.com')
    expect(internal).toBeTruthy()
    expect(internal?.getAttribute('target')).toBeNull()
    expect(external?.getAttribute('target')).toBe('_blank')
    expect(external?.getAttribute('rel')).toContain('noopener')
  })

  it('renders GFM tables', () => {
    const md = '| A | B |\n| --- | --- |\n| 1 | 2 |'
    const { container } = render(<Markdown>{md}</Markdown>)
    expect(container.querySelector('table')).toBeTruthy()
    expect(container.querySelectorAll('td')).toHaveLength(2)
  })

  it('does NOT render raw HTML in the source (no XSS via injected tags)', () => {
    const { container } = render(<Markdown>{'Hello <script>alert(1)</script> world'}</Markdown>)
    expect(container.querySelector('script')).toBeNull()
  })
})
