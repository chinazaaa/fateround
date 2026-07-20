export type FaqItem = { question: string; answer: string }

/**
 * The shared FAQ block. The same `<dl>` markup was previously inlined in the game landing
 * page and the marketing landing page; both now render through here so a styling change
 * lands in one place.
 */
export function FaqList({ faqs }: { faqs: FaqItem[] }) {
  return (
    <>
      {faqs.map((faq) => (
        <dl
          key={faq.question}
          className="mb-3 rounded-[var(--radius-lg)] px-[22px] py-[18px]"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <dt className="mb-[5px] text-[15px] font-bold" style={{ color: 'var(--text)' }}>
            {faq.question}
          </dt>
          <dd className="m-0 text-sm leading-[1.55]" style={{ color: 'var(--text-muted)' }}>
            {faq.answer}
          </dd>
        </dl>
      ))}
    </>
  )
}
