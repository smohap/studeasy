'use client'

import { useState, type FormEvent } from 'react'
import { createClient, isAuthConfigured } from '@/lib/supabase/client'
import { SelectField, TextField } from '@/components/Field'

const TOPICS = [
  { value: 'tutoring', label: 'Tutoring and enrolment' },
  { value: 'billing', label: 'Billing, payments or a refund' },
  { value: 'technical', label: 'Something on the site is broken' },
  { value: 'partnership', label: 'Teaching with us, or a partnership' },
  { value: 'other', label: 'Something else' },
]

/**
 * Writes through submit_contact_message(), not through an insert on the table.
 *
 * The table has row-level security on with no policies at all, so it is
 * unreachable from PostgREST. The function is the only door, it validates
 * every field server-side, and it caps how often one address may write. The
 * checks below are for the person filling the form in — the ones that matter
 * are the ones they cannot skip.
 */
export default function ContactForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [topic, setTopic] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    /*
     * SelectField renders and returns labels, but the function accepts only the
     * five stored values. Mapping here rather than showing the raw values keeps
     * 'partnership' out of the dropdown and still sends exactly what the check
     * constraint allows.
     */
    const topicValue = TOPICS.find((t) => t.label === topic)?.value
    if (!topicValue) {
      setError('Please choose what your message is about.')
      return
    }
    if (message.trim().length < 10) {
      setError('Please write a little more so we can actually help.')
      return
    }
    if (!isAuthConfigured) {
      setError('The contact form is not available right now. Please email us instead.')
      return
    }

    setBusy(true)
    const supabase = createClient()
    const { error: rpcError } = await supabase.rpc('submit_contact_message', {
      p_name: name,
      p_email: email,
      p_topic: topicValue,
      p_message: message,
    })
    setBusy(false)

    if (rpcError) {
      /*
       * The function raises with a message written for a person — "That email
       * address does not look right", "You have sent several messages
       * already". Showing it is more use than a generic failure, and it says
       * nothing about the database.
       */
      setError(rpcError.message)
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <div
        role="status"
        className="rounded-2xl border border-accent/30 bg-base-raised p-8"
      >
        <p className="text-[1.1rem] font-medium text-ink">Message sent.</p>
        <p className="mt-3 text-[0.95rem] leading-relaxed font-light text-ink-dim">
          A person reads these, so expect a reply rather than an autoresponder —
          usually within one working day. If it is urgent and you already have
          an account, message your tutor from the portal instead.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <TextField
        label="Your name"
        value={name}
        required
        autoComplete="name"
        onChange={(e) => setName(e.target.value)}
      />
      <TextField
        label="Email"
        type="email"
        value={email}
        required
        autoComplete="email"
        hint="The only way we have of replying."
        onChange={(e) => setEmail(e.target.value)}
      />
      <SelectField
        label="What is it about"
        value={topic}
        required
        onChange={setTopic}
        options={TOPICS.map((t) => t.label)}
        placeholder="Choose a topic…"
      />
      <div className="flex flex-col gap-2">
        <label
          htmlFor="contact-message"
          className="text-[0.72rem] font-medium tracking-[0.14em] text-ink-dim uppercase"
        >
          Message
        </label>
        <textarea
          id="contact-message"
          rows={7}
          required
          maxLength={5000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full rounded-2xl border border-hairline bg-base px-5 py-3.5 text-[0.98rem] font-light text-ink placeholder:text-white/30"
          placeholder="Which year level, which subject, and what is going wrong."
        />
        <p className="text-[0.82rem] font-light text-ink-dim">
          {message.length}/5000
        </p>
      </div>

      {error && (
        <p role="alert" className="text-[0.9rem] font-light text-[#F0A0A0]">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="self-start rounded-full bg-accent px-6 py-3 text-[0.9rem] font-medium text-[#100c00] transition-transform duration-200 hover:scale-[1.03] disabled:opacity-60 disabled:hover:scale-100"
      >
        {busy ? 'Sending…' : 'Send message'}
      </button>
    </form>
  )
}
