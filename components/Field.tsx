'use client'

import { useId, type InputHTMLAttributes, type ReactNode } from 'react'

const BASE =
  'w-full rounded-2xl border bg-base px-5 py-3.5 text-[0.98rem] font-light text-ink placeholder:text-white/30'

export function TextField({
  label,
  hint,
  error,
  trailing,
  ...props
}: {
  label: string
  hint?: string
  error?: string
  trailing?: ReactNode
} & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errId = error ? `${id}-error` : undefined

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <label
          htmlFor={id}
          className="text-[0.72rem] font-medium tracking-[0.14em] text-ink-dim uppercase"
        >
          {label}
        </label>
        {trailing}
      </div>
      <input
        id={id}
        aria-describedby={[hintId, errId].filter(Boolean).join(' ') || undefined}
        aria-invalid={error ? true : undefined}
        className={`${BASE} ${error ? 'border-[#E88A8A]' : 'border-hairline'}`}
        {...props}
      />
      {hint && !error && (
        <p id={hintId} className="text-[0.82rem] font-light text-ink-dim">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} className="text-[0.85rem] font-light text-[#F0A0A0]">
          {error}
        </p>
      )}
    </div>
  )
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder = 'Choose…',
  error,
  required,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder?: string
  error?: string
  required?: boolean
}) {
  const id = useId()
  const errId = error ? `${id}-error` : undefined

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={id}
        className="text-[0.72rem] font-medium tracking-[0.14em] text-ink-dim uppercase"
      >
        {label}
      </label>
      <select
        id={id}
        value={value}
        required={required}
        aria-describedby={errId}
        aria-invalid={error ? true : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={`${BASE} ${error ? 'border-[#E88A8A]' : 'border-hairline'}`}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {error && (
        <p id={errId} className="text-[0.85rem] font-light text-[#F0A0A0]">
          {error}
        </p>
      )}
    </div>
  )
}

/** Multi-select as toggle chips — used for subjects. */
export function ChipGroup({
  legend,
  options,
  selected,
  onToggle,
  error,
}: {
  legend: string
  options: string[]
  selected: string[]
  onToggle: (v: string) => void
  error?: string
}) {
  return (
    <fieldset>
      <legend className="mb-3 text-[0.72rem] font-medium tracking-[0.14em] text-ink-dim uppercase">
        {legend}
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = selected.includes(o)
          return (
            <button
              key={o}
              type="button"
              onClick={() => onToggle(o)}
              aria-pressed={on}
              className={`rounded-full border px-4 py-2 text-[0.9rem] transition-colors ${
                on
                  ? 'border-accent/60 bg-accent/15 font-normal text-accent'
                  : 'border-hairline bg-base font-light text-ink hover:border-ink/40'
              }`}
            >
              {o}
            </button>
          )
        })}
      </div>
      {error && (
        <p role="alert" className="mt-3 text-[0.85rem] font-light text-[#F0A0A0]">
          {error}
        </p>
      )}
    </fieldset>
  )
}
