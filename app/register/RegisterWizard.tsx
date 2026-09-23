'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertCircle, ArrowLeft, CheckCircle2 } from 'lucide-react'
import { createClient, isAuthConfigured } from '@/lib/supabase/client'
import { completeProfile, registerWithEmail, type ConsentInfo } from '@/app/auth/actions'
import { SELECTABLE_ROLES, type SelectableRole } from '@/lib/roles'
import { SUBJECTS, YEAR_LEVELS } from '@/lib/curriculum'
import {
  CONSENT_AGE,
  birthDateBounds,
  isPlausibleBirthDate,
  needsGuardianConsent,
} from '@/lib/consent'
// Pure and crypto-free — safe to import into this client component, unlike
// lib/consent-token.ts, which pulls in node:crypto for the server side.
import { isEmailish } from '@/lib/email-address'
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
  const [consent, setConsent] = useState<ConsentInfo | null>(null)

  const [fullName, setFullName] = useState(knownName ?? '')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<SelectableRole | null>(null)
  const [yearLevel, setYearLevel] = useState('')
  const [subjects, setSubjects] = useState<string[]>([])
  const [teachingSubjects, setTeachingSubjects] = useState<string[]>([])
  const [studentCode, setStudentCode] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [parentEmail, setParentEmail] = useState('')

  // Computed twice — here to warn before submitting, and in Postgres to
  // actually decide. lib/consent.ts explains why both exist.
  const underAge = role === 'student' && needsGuardianConsent(dateOfBirth)
  const dobBounds = birthDateBounds()

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
      if (!dateOfBirth) return setError('Enter your date of birth.')
      if (!isPlausibleBirthDate(dateOfBirth)) {
        return setError('Check that date of birth — it does not look right.')
      }
      if (needsGuardianConsent(dateOfBirth)) {
        const trimmedParentEmail = parentEmail.trim()
        if (!trimmedParentEmail || !isEmailish(trimmedParentEmail)) {
          return setError('Enter a parent or caregiver email address.')
        }
        if (email && trimmedParentEmail.toLowerCase() === email.trim().toLowerCase()) {
          return setError("That needs to be a parent or caregiver's address, not your own.")
        }
      }
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
      dateOfBirth: role === 'student' ? dateOfBirth : undefined,
      parentEmail: role === 'student' && underAge ? parentEmail.trim() : undefined,
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
      // completeProfile signs an under-age student out after issuing the
      // consent invitation (see the server action) — landing them in the
      // portal here would land them in the portal of a now-signed-out user.
      // Everyone else goes straight in, as before.
      if (result.consent) {
        setConsent(result.consent)
        setDone('Account set up.')
        setBusy(null)
        return
      }
      router.replace(role === 'tutor' ? '/portal/tutor' : `/portal/${role}`)
      router.refresh()
      return
    }

    setConsent(result.consent ?? null)
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
              : underAge && consent
                ? consent.state === 'pending-confirmation'
                  ? `Confirm your own email first. Once you sign in, we will help you send a confirmation link to ${consent.maskedEmail} — a parent or caregiver has to open it before you can start.`
                  : consent.state === 'sent'
                    ? `We have emailed a confirmation link to ${consent.maskedEmail}. A parent or caregiver needs to open it before you can start — you can sign in any time and your account will be waiting, held until then.`
                    : `We could not send a confirmation link to ${consent.maskedEmail} just now. Sign in — your account page will let you try again.`
                : underAge
                  ? `Sign in and you will find your Student ID waiting. Give it to a parent or caregiver — they need it to link to you, and because you are under ${CONSENT_AGE} they also have to confirm your account before you can start.`
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
      // A Google account mid-registration has no role yet, and the home page
      // sends role-less accounts straight back here. Leaving has to sign out.
      exitSignsOut={completing}
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
              <TextField
                label="Date of birth"
                type="date"
                required
                autoComplete="bday"
                min={dobBounds.min}
                max={dobBounds.max}
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                hint={`We ask because anyone under ${CONSENT_AGE} needs a parent or caregiver to confirm their account.`}
              />
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

              {underAge && dateOfBirth && (
                <>
                  <p className="rounded-2xl border border-accent/30 bg-accent/[0.07] p-5 text-[0.88rem] leading-relaxed font-light text-ink">
                    Because you are under {CONSENT_AGE}, a parent or caregiver has to
                    confirm your account before you can start. You can still register now
                    — give them your Student ID afterwards and they confirm it from their
                    own account. We will also email them a confirmation link at the
                    address below.
                  </p>
                  <TextField
                    label="Parent or caregiver's email"
                    type="email"
                    autoComplete="off"
                    required
                    placeholder="parent@example.com"
                    value={parentEmail}
                    onChange={(e) => setParentEmail(e.target.value)}
                    hint="They'll get a link to confirm. That only proves it reaches an inbox, not who is on the other end of it."
                  />
                </>
              )}
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
            {role === 'student' && <Row label="Date of birth" value={dateOfBirth} />}
            {role === 'student' && <Row label="Year level" value={yearLevel} />}
            {role === 'student' && <Row label="Subjects" value={subjects.join(', ')} />}
            {role === 'student' && underAge && (
              <Row label="Parent/caregiver email" value={parentEmail} />
            )}
            {role === 'tutor' && <Row label="Teaching" value={teachingSubjects.join(', ')} />}
            {role === 'parent' && <Row label="Student ID" value={studentCode} />}
          </dl>

          {role === 'tutor' && (
            <p className="mt-5 text-[0.88rem] leading-relaxed font-light text-ink-dim">
              Your account will sit in <span className="text-accent">pending</span> until a
              site administrator approves it.
            </p>
          )}

          {underAge && (
            <p className="mt-5 text-[0.88rem] leading-relaxed font-light text-ink-dim">
              Your account will wait for a{' '}
              <span className="text-accent">parent or caregiver</span> to confirm it. You
              can sign in before then, but homework and assessments stay locked.
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
