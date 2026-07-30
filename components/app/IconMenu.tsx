'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

export type MenuItem = {
  id: string
  title: string
  body: string
  at: string
  unread: boolean
}

/**
 * Top-bar dropdown for notifications and messages.
 *
 * Closes on Escape and on a click outside, and moves focus back to the trigger
 * so keyboard users are not stranded at the end of the document.
 */
export default function IconMenu({
  label,
  emptyText,
  items,
  icon,
}: {
  label: string
  emptyText: string
  items: MenuItem[]
  icon: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const unread = items.filter((i) => i.unread).length

  useEffect(() => {
    if (!open) return

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        trigger.current?.focus()
      }
    }
    const onPointer = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }

    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open])

  return (
    <div ref={wrap} className="relative shrink-0">
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="relative grid h-9 w-9 place-items-center rounded-lg border border-app-border text-app-ink transition-colors hover:bg-app-subtle"
      >
        <span className="sr-only">
          {label}
          {unread > 0 ? `, ${unread} unread` : ''}
        </span>
        {icon}
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-app-bad px-1 text-[0.62rem] font-semibold text-white"
          >
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label={label}
          className="absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-app-border bg-app-panel shadow-lg"
        >
          <p className="border-b border-app-border px-4 py-3 text-[0.85rem] font-semibold text-app-ink">
            {label}
          </p>

          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-[0.86rem] font-light text-app-muted">
              {emptyText}
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {items.map((i) => (
                <li key={i.id} role="menuitem" className="border-b border-app-border last:border-0">
                  <div className="px-4 py-3">
                    <p className="flex items-center gap-2 text-[0.88rem] font-medium text-app-ink">
                      {i.title}
                      {i.unread && (
                        <span className="rounded-full bg-app-warn-bg px-1.5 py-0.5 text-[0.66rem] font-semibold text-app-warn">
                          New
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-[0.84rem] leading-relaxed font-light text-app-muted">
                      {i.body}
                    </p>
                    <p className="mt-1 text-[0.76rem] font-light text-app-muted">{i.at}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
