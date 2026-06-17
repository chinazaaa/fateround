'use client'

import QRCode from 'react-qr-code'

export function GameLinkQrCode({ url, size = 160 }: { url: string; size?: number }) {
  return (
    <div className="inline-flex rounded-xl bg-white p-3 shadow-sm ring-1 ring-black/5">
      <QRCode value={url} size={size} bgColor="#ffffff" fgColor="#000000" level="M" aria-hidden />
    </div>
  )
}
