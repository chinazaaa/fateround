'use client'

import { useState } from 'react'
import type { FaqItem } from './FaqList'

/**
 * Accordion-style FAQ list that matches the platform's design system.
 * Each item expands/collapses on click with smooth animation and accent highlights.
 */
export function FaqAccordion({ faqs, accent }: { faqs: FaqItem[]; accent?: string }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const activeAccent = accent || 'var(--primary, #f43f5e)'

  return (
    <div className="space-y-2">
      {faqs.map((faq, i) => {
        const isOpen = openIndex === i
        return (
          <div
            key={faq.question}
            className="rounded-[var(--radius-lg)] overflow-hidden transition-colors"
            style={{
              background: 'var(--surface)',
              border: `1px solid ${
                isOpen ? `color-mix(in srgb, ${activeAccent} 35%, var(--border))` : 'var(--border)'
              }`,
            }}
          >
            <button
              type="button"
              onClick={() => setOpenIndex(isOpen ? null : i)}
              className="flex w-full items-center justify-between gap-3 px-[22px] py-[18px] text-left"
              style={{ color: isOpen ? activeAccent : 'var(--text)' }}
              aria-expanded={isOpen}
            >
              <span className="text-[15px] font-bold leading-snug">{faq.question}</span>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="shrink-0 transition-transform duration-200"
                style={{
                  transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  color: isOpen ? activeAccent : 'var(--text-faint)',
                }}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            <div
              className="grid transition-[grid-template-rows,opacity] duration-200 ease-out overflow-hidden"
              style={{
                gridTemplateRows: isOpen ? '1fr' : '0fr',
                opacity: isOpen ? 1 : 0,
              }}
            >
              <div className="overflow-hidden">
                <div className="px-[22px] pb-[18px] text-sm leading-[1.55]" style={{ color: 'var(--text-muted)' }}>
                  {faq.answer}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
