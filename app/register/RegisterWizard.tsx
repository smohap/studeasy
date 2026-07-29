'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertCircle, ArrowLeft, CheckCircle2 } from 'lucide-react'
import { createClient, isAuthConfigured } from '@/lib/supabase/client'
import { completeProfile, registerWithEmail } from '@/app/auth/actions'
import { SELECTABLE_ROLES, type SelectableRole } from '@/lib/roles'
import { SUBJECTS, YEAR_LEVELS } from '@/lib/curriculum'
import AuthShell from '@/components/AuthShell'
import GoogleButton, { OrDivider } from '@/components/GoogleButton'
import { ChipGroup, SelectField, TextField } from '@/components/Field'

const TOTAL_STEPS = 4

type Props = {
  /** True when a Google account is already signed in and only needs details. */
  completing: boolean
  knownName?: string | null
}

export default function RegisterWizard({ completing, knownName }: Props) {
  const router = useRouter()
  // A Google signup has already done step 1.
  const [step, setStep] = useState(completing ? 2 : 1)
  const [busy, setBusy] = useState<'google' | 'submit' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const [fullName, setFullName] = useState(knownName ?? '')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<SelectableRole | null>(null)
  const [yearLevel, setYearLevel] = useState('')
  const [subjects, setSubjects] = useState<string[]>([])
  const [teachingSubjects, setTeachingSubjects] = useState<string[]>([])
  const [studentCode, setStudentCode] = useState('')

  function toggle(list: string[], set: (v: string[]) => void, value: string) {
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value])
  }

  async function withGoogle() {
    setBusy('google')
    setError(null)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      })
      if (error) throw error
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach Google.')
      setBusy(null)
    }
  }

  function nextFromAccount(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!fullName.trim()) return setError('Tell us your name.')
    if (password.length < 8) return setError('Use at least 8 characters for your password.')
    setStep(2)
  }

  function nextFromRole() {
    setError(null)
    if (!role) return setError('Choose one to carry on.')
    setStep(3)
  }

  function nextFromDetails(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (role === 'student') {
      if (!yearLevel) return setError('Choose your year level.')
      if (subjects.length === 0) return setError('Pick at least one subject.')
    }
    if (role === 'tutor' && teachingSubjects.length === 0) {
      return setError('Pick at least one subject you will teach.')
    }
    if (role === 'parent' && !studentCode.trim()) {
      return setError("Enter your child's Student ID.")
    }
    setStep(4)
  }

  async function submit() {
    if (!role) return
    setBusy('submit')
    setError(null)

    const details = {
      role,
      yearLevel: yearLevel || undefined,
      subjects,
      teachingSubjects,
      studentCode: studentCode.trim() || undefined,
    }

    const result = completing
      ? await completeProfile(details)
      : await registerWithEmail({ ...details, fullName, email, password })

    if (result.error) {
      setError(result.error)
      setBusy(null)
      return
    }

    if (completing) {
      router.replace(role === 'tutor' ? '/portal/tutor' : `/portal/${role}`)
      router.refresh()
      return
    }

    setDone(result.message ?? 'Account created.')
    setBusy(null)
  }

  if (done) {
    return (
      <AuthShell title="You're registered" lede={done}>
        <div className="flex gap-3 rounded-2xl border border-hairline bg-base p-5">
          <CheckCircle2 size={19} aria-hidden className="mt-0.5 shrink-0 text-accent" />
          <p className="text-[0.92rem] leading-relaxed font-light text-ink">
            {role === 'tutor'
              ? 'We will email you once a site administrator has approved your account. You can sign in before then, but your teaching tools stay locked.'
              : 'Sign in to pick up where you left off.'}
          </p>
        </div>
        <Link
          href="/sign-in"
          className="mt-7 block w-full rounded-full bg-accent px-8 py-3.5 text-center text-[0.95rem] font-medium text-[#100c00]"
        >
          Go to sign in
        </Link>
      </AuthShell>
    )
  }

  const titles: Record<number, { title: string; lede: string }> = {
    1: { title: 'Register', lede: 'One account for students, parents and tutors.' },
    2: {
      title: completing ? `Kia ora${knownName ? `, ${knownName.split(' ')[0]}` : ''}` : 'Who are you?',
      lede: 'This decides which portal you get. It cannot be changed later without asking us.',
    },
    3: { title: 'A few details', lede: 'So we can set your account up properly.' },
    4: { title: 'Check and confirm', lede: 'Have a quick look before we create the account.' },
  }

  return (
    <AuthShell
      title={titles[step].title}
      lede={titles[step].lede}
      steps={TOTAL_STEPS}
      currentStep={step}
      footer={
        step === 1 ? (
          <p className="text-center text-[0.92rem] font-light text-ink-dim">
            Already with StudEasy?{' '}
            <Link href="/sign-in" className="font-medium text-accent hover:underline">
              Sign in
            </Link>
          </p>
        ) : (
          <button
            type="button"
            onClick={() => setStep(step - 1)}
            disabled={busy !== null || (completing && step === 2)}
            className="inline-flex items-center gap-2 text-[0.9rem] font-light text-ink-dim transition-colors hover:text-ink disabled:opacity-40"
          >
            <ArrowLeft size={15} aria-hidden />
            Back
          </button>
        )
      }
    >
      {!isAuthConfigured && (
        <p
          role="alert"
          className="mb-7 flex gap-3 rounded-2xl border border-accent/30 bg-accent/[0.07] p-5 text-[0.9rem] leading-relaxed font-light text-ink"
        >
          <AlertCircle size={18} aria-hidden className="mt-0.5 shrink-0 text-accent" />
          <span>Registration is not configured for this deployment.</span>
        </p>
      )}

      {step === 1 && (
        <>
          <GoogleButton
            onClick={withGoogle}
            busy={busy === 'google'}
            disabled={busy !== null || !isAuthConfigured}
            label="Continue with Google"
          />
          <OrDivider />
          <form onSubmit={nextFromAccount} className="flex flex-col gap-5">
            <TextField
              label="Name"
              autoComplete="name"
              required
              placeholder="Aroha Ngata"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
            <TextField
              label="Email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <TextField
              label="Password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              placeholder="8+ characters"
              hint="At least 8 characters."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {/* Only the final submit needs credentials — walking the form does not. */}
            <button
              type="submit"
              disabled={busy !== null}
              className="mt-1 w-full rounded-full bg-accent px-8 py-3.5 text-[0.95rem] font-medium text-[#100c00] transition-transform duration-200 hover:scale-[1.01] disabled:opacity-50"
            >
              Continue →
            </button>
          </form>
        </>
      )}

      {step === 2 && (
        <>
          <fieldset>
            <legend className="sr-only">Choose your role</legend>
            <div className="flex flex-col gap-3">
              {SELECTABLE_ROLES.map((r) => (
                <label
                  key={r.value}
                  className={`flex cursor-pointer gap-4 rounded-2xl border p-5 transition-colors ${
                    role === r.value
                      ? 'border-accent/60 bg-accent/[0.07]'
                      : 'border-hairline bg-base hover:border-ink/30'
                  }`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={r.value}
                    checked={role === r.value}
                    onChange={() => setRole(r.value)}
                    className="mt-1.5 h-4 w-4 shrink-0 accent-[#E3B341]"
                  />
                  <span>
                    <span className="block text-[1rem] font-medium text-ink">{r.label}</span>
                    <span className="mt-1 block text-[0.9rem] leading-relaxed font-light text-ink-dim">
                      {r.blurb}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <button
            type="button"
            onClick={nextFromRole}
            className="mt-7 w-full rounded-full bg-accent px-8 py-3.5 text-[0.95rem] font-medium text-[#100c00] transition-transform duration-200 hover:scale-[1.01]"
          >
            Continue →
          </button>
        </>
      )}

      {step === 3 && (
        <form onSubmit={nextFromDetails} className="flex flex-col gap-7">
          {role === 'student' && (
            <>
              <SelectField
                label="Year level"
                value={yearLevel}
                onChange={setYearLevel}
                options={YEAR_LEVELS}
                required
              />
              <ChipGroup
                legend="Subjects you want help with"
                options={SUBJECTS}
                selected={subjects}
                onToggle={(v) => toggle(subjects, setSubjects, v)}
              />
              <p className="text-[0.85rem] leading-relaxed font-light text-ink-dim">
                We will give you a Student ID once your account exists. Your parent or
                caregiver needs it to link to you.
              </p>
            </>
          )}

          {role === 'parent' && (
            <>
              <TextField
                label="Student ID"
                required
                placeholder="STU-4KX9P2"
                value={studentCode}
                onChange={(e) => setStudentCode(e.target.value.toUpperCase())}
                hint="Ask your child for this — it is on their portal once they register."
              />
              <p className="text-[0.85rem] leading-relaxed font-light text-ink-dim">
                Your child needs to register first. If you do not have their ID yet, you
                can add it later from your portal.
              </p>
            </>
          )}

          {role === 'tutor' && (
            <>
              <ChipGroup
                legend="Subjects you will teach"
                options={SUBJECTS}
                selected={teachingSubjects}
                onToggle={(v) => toggle(teachingSubjects, setTeachingSubjects, v)}
              />
              <p className="text-[0.85rem] leading-relaxed font-light text-ink-dim">
                Tutor accounts are checked by a site administrator before they go live.
                You can sign in straight away, but teaching tools stay locked until then.
              </p>
            </>
          )}

          <button
            type="submit"
            className="w-full rounded-full bg-accent px-8 py-3.5 text-[0.95rem] font-medium text-[#100c00] transition-transform duration-200 hover:scale-[1.01]"
          >
            Continue →
          </button>
        </form>
      )}

      {step === 4 && (
        <>
          <dl className="flex flex-col gap-4 rounded-2xl border border-hairline bg-base p-6">
            {!completing && (
              <Row label="Name" value={fullName} />
            )}
            {!completing && <Row label="Email" value={email} />}
            <Row label="Account type" value={SELECTABLE_ROLES.find((r) => r.value === role)?.label ?? ''} />
            {role === 'student' && <Row label="Year level" value={yearLevel} />}
            {role === 'student' && <Row label="Subjects" value={subjects.join(', ')} />}
            {role === 'tutor' && <Row label="Teaching" value={teachingSubjects.join(', ')} />}
            {role === 'parent' && <Row label="Student ID" value={studentCode} />}
          </dl>

          {role === 'tutor' && (
            <p className="mt-5 text-[0.88rem] leading-relaxed font-light text-ink-dim">
              Your account will sit in <span className="text-accent">pending</span> until a
              site administrator approves it.
            </p>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={busy !== null || !isAuthConfigured}
            className="mt-7 w-full rounded-full bg-accent px-8 py-3.5 text-[0.95rem] font-medium text-[#100c00] transition-transform duration-200 hover:scale-[1.01] disabled:opacity-50"
          >
            {busy === 'submit' ? 'Creating your account…' : 'Create my account'}
          </button>
        </>
      )}

      {error && (
        <p role="alert" className="mt-5 text-[0.9rem] font-light text-[#F0A0A0]">
          {error}
        </p>
      )}
    </AuthShell>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-6">
      <dt className="text-[0.85rem] font-light text-ink-dim">{label}</dt>
      <dd className="text-right text-[0.92rem] font-normal text-ink">{value || '—'}</dd>
    </div>
  )
}
