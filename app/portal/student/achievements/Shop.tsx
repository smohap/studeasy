'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Lock } from 'lucide-react'
import type { ShopItem } from '@/lib/economy-types'
import { buyItem, equipItem } from '@/app/portal/economy-actions'

const KIND_LABEL: Record<ShopItem['kind'], string> = {
  avatar: 'Avatar',
  theme: 'Theme',
  frame: 'Frame',
  title: 'Title',
}

/**
 * Every item here is cosmetic — an avatar, a theme, a frame, a title. Nothing
 * sold here is presented as having value outside StudEasy.
 */
export default function Shop({ items, balance, level }: { items: ShopItem[]; balance: number; level: number }) {
  const router = useRouter()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function buy(item: ShopItem) {
    setError(null)
    setPendingId(item.id)
    start(async () => {
      const res = await buyItem(item.id)
      if (res.error) setError(res.error)
      setPendingId(null)
      router.refresh()
    })
  }

  // Buying and wearing are separate on purpose: a purchase is permanent, but a
  // student swaps what they wear. equip_item() refuses anything not owned.
  function equip(item: ShopItem) {
    setError(null)
    setPendingId(item.id)
    start(async () => {
      const res = await equipItem(item.id)
      if (res.error) setError(res.error)
      setPendingId(null)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <p role="status" className="text-[0.86rem] font-medium text-app-ink">
        {balance} {balance === 1 ? 'coin' : 'coins'}
      </p>

      {error && (
        <p role="alert" className="text-[0.85rem] font-light text-app-bad">
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <p className="text-[0.88rem] font-light text-app-muted">
          Nothing is for sale yet.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const lockedByLevel = level < item.min_level
            const lockedByCoins = !item.owned && !lockedByLevel && balance < item.cost_coins
            const affordable = !item.owned && !lockedByLevel && !lockedByCoins
            const isPending = pending && pendingId === item.id

            return (
              <li
                key={item.id}
                className="flex flex-col gap-2 rounded-xl border border-app-border p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[0.94rem] font-medium text-app-ink">{item.name}</p>
                    <p className="text-[0.78rem] font-light text-app-muted">
                      {KIND_LABEL[item.kind]}
                    </p>
                  </div>
                  {item.owned && (
                    <span
                      className="flex items-center gap-1 rounded-full bg-app-good-bg px-2 py-0.5 text-[0.76rem] font-medium text-app-good"
                    >
                      <Check size={13} aria-hidden />
                      Owned
                    </span>
                  )}
                </div>

                {item.description && (
                  <p className="text-[0.84rem] font-light text-app-muted">
                    {item.description}
                  </p>
                )}

                <p className="mt-auto text-[0.86rem] font-medium text-app-ink">
                  {item.cost_coins} {item.cost_coins === 1 ? 'coin' : 'coins'}
                </p>

                {item.owned ? (
                  item.equipped ? (
                    <p className="flex items-center gap-1.5 text-[0.82rem] font-medium text-app-good">
                      <Check size={14} aria-hidden />
                      Equipped
                    </p>
                  ) : (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => equip(item)}
                      aria-label={`Equip ${item.name}`}
                      className="rounded-lg border border-app-ink px-3 py-2 text-[0.84rem] font-medium text-app-ink disabled:opacity-50"
                    >
                      {isPending ? 'Equipping…' : 'Equip'}
                    </button>
                  )
                ) : lockedByLevel ? (
                  <p className="flex items-center gap-1.5 text-[0.82rem] font-light text-app-muted">
                    <Lock size={14} aria-hidden />
                    Unlocks at level {item.min_level}
                  </p>
                ) : lockedByCoins ? (
                  <p className="flex items-center gap-1.5 text-[0.82rem] font-light text-app-muted">
                    <Lock size={14} aria-hidden />
                    Costs {item.cost_coins} coins
                  </p>
                ) : (
                  <button
                    type="button"
                    disabled={!affordable || isPending}
                    onClick={() => buy(item)}
                    aria-label={`Buy ${item.name} for ${item.cost_coins} coins`}
                    className="rounded-lg bg-app-ink px-3 py-2 text-[0.84rem] font-medium text-white disabled:opacity-50"
                  >
                    {isPending ? 'Buying…' : 'Buy'}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
