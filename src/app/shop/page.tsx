import { ShopClient } from '@/components/coins/ShopClient'

export const metadata = {
  title: 'Shop · FateRound',
  description: 'Spend the coins you earn on themes, frames, name colors, animations and more.',
}

export default function ShopPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight">Shop</h1>
        <p className="mt-1 text-sm text-muted">
          Spend the coins you earn on cosmetics that follow you across every game.
        </p>
      </div>
      <ShopClient />
    </div>
  )
}
