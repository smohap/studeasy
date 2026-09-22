'use client'

import { useState, useTransition } from 'react'
import { Panel } from '@/components/app/Ui'
import type { PublicProfileFields } from '@/lib/profile-public'
import { setProgressConsent, updatePublicProfile } from '@/app/portal/profile-actions'

const field =
  'w-full rounded-lg border border-app-border bg-app px-3 py-2 text-[0.88rem] font-light text-app-ink'
const label = 'block text-[0.8rem] font-medium text-app-muted'

/**
 * The two panels that feed the public site: a tutor's directory entry, and the
 * consent that lets an account's marks appear — anonymously — on
 * /success-stories.
 *
 * `fields` is null when supabase/public-site.sql has not been run. Saying so is
 * better than rendering a form whose Save button will always fail.
 */
export default function PublicProfilePanels({
  fields,
  isTutor,
  isStudentOrParent,
}: {
  fields: PublicProfileFields | null
  isTutor: boolean
  isStudentOrParent: boolean
}) {
  if (!fields) {
    return (
      <Panel
        title="Public profile"
        subtitle="Unavailable until supabase/public-site.sql has been run against this database."
      >
        <p className="text-[0.88rem] leading-relaxed font-light text-app-muted">
          The columns behind your public tutor listing and your reporting
          consent do not exist yet. Nothing is broken — the rest of this page
          saves normally.
        </p>
      </Panel>
    )
  }

  return (
    <>
      {isTutor && <TutorListing fields={fields} />}
      {isStudentOrParent && <Consent initial={fields.shareProgressConsent} />}
    </>
  )
}

function TutorListing({ fields }: { fields: PublicProfileFields }) {
  const [headline, setHeadline] = useState(fields.headline ?? '')
  const [bio, setBio] = useState(fields.bio ?? '')
  const [quals, setQuals] = useState(fields.qualifications ?? '')
  const [years, setYears] = useState(
    fields.yearsExperience === null ? '' : String(fields.yearsExperience),
  )
  const [listed, setListed] = useState(fields.listed)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()

  return (
    <Panel
      title="Your public listing"
      subtitle="What a parent sees on /tutors before they choose you. Shown only once an administrator has approved your tutor role."
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          setSaved(false)
          start(async () => {
            const res = await updatePublicProfile({
              headline,
              bio,
              qualifications: quals,
              yearsExperience: years,
              listed,
            })
            if (res.error) setError(res.error)
            else setSaved(true)
          })
        }}
      >
        <div>
          <label className={label} htmlFor="pp-headline">
            One line about you
          </label>
          <input
            id="pp-headline"
            className={`${field} mt-1.5`}
            maxLength={160}
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder="Ex-HOD of Science, 12 years on NCEA marking panels."
          />
          <p className="mt-1.5 text-[0.78rem] font-light text-app-muted">
            {headline.length}/160 — this is the sentence on your card.
          </p>
        </div>

        <div>
          <label className={label} htmlFor="pp-bio">
            About you
          </label>
          <textarea
            id="pp-bio"
            rows={6}
            className={`${field} mt-1.5`}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="How you teach, who you teach best, and what a first session looks like. Blank lines start a new paragraph."
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="pp-quals">
              Qualifications
            </label>
            <input
              id="pp-quals"
              className={`${field} mt-1.5`}
              value={quals}
              onChange={(e) => setQuals(e.target.value)}
              placeholder="BSc (Hons) Physics, University of Auckland"
            />
            <p className="mt-1.5 text-[0.78rem] font-light text-app-muted">
              Shown as stated by you. StudEasy approves the account, not the
              certificate, and your page says so.
            </p>
          </div>

          <div>
            <label className={label} htmlFor="pp-years">
              Years teaching
            </label>
            <input
              id="pp-years"
              type="number"
              min={0}
              max={70}
              className={`${field} mt-1.5`}
              value={years}
              onChange={(e) => setYears(e.target.value)}
            />
          </div>
        </div>

        <label className="flex items-start gap-3 rounded-lg border border-app-border bg-app p-3.5">
          <input
            type="checkbox"
            checked={listed}
            onChange={(e) => setListed(e.target.checked)}
            className="mt-0.5"
          />
          <span className="text-[0.86rem] leading-relaxed font-light text-app-ink">
            List me in the public tutor directory.
            <span className="mt-1 block text-app-muted">
              Un-tick to disappear from /tutors and every subject page. Your
              courses stay on the catalog and your existing students are
              unaffected.
            </span>
          </span>
        </label>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-app-ink px-4 py-2 text-[0.86rem] font-medium text-white disabled:opacity-60"
          >
            {pending ? 'Saving…' : 'Save listing'}
          </button>
          {saved && (
            <p role="status" className="text-[0.85rem] font-light text-app-good">
              Saved.
            </p>
          )}
          {error && (
            <p role="alert" className="text-[0.85rem] font-light text-app-bad">
              {error}
            </p>
          )}
        </div>
      </form>
    </Panel>
  )
}

/**
 * Consent to anonymised progress reporting.
 *
 * Off by default in the database, and this checkbox is the only thing that
 * turns it on. It is written plainly rather than as a legal paragraph, because
 * the person ticking it is often a parent deciding on behalf of a child, and
 * consent that is not understood is not consent.
 */
function Consent({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()

  function toggle(next: boolean) {
    setOn(next)
    setError(null)
    setSaved(false)
    start(async () => {
      const res = await setProgressConsent(next)
      if (res.error) {
        // Put the switch back: leaving it showing a state the database did not
        // accept is worse than showing the error, because consent is the one
        // thing that must never be optimistically assumed.
        setOn(!next)
        setError(res.error)
      } else {
        setSaved(true)
      }
    })
  }

  return (
    <Panel
      title="Sharing progress publicly"
      subtitle="Whether this account's marks may appear, anonymously, on the StudEasy success stories page."
    >
      <label className="flex items-start gap-3 rounded-lg border border-app-border bg-app p-4">
        <input
          type="checkbox"
          checked={on}
          disabled={pending}
          onChange={(e) => toggle(e.target.checked)}
          className="mt-0.5"
        />
        <span className="text-[0.88rem] leading-relaxed font-light text-app-ink">
          Yes, StudEasy may use these marks in anonymised reporting.
          <span className="mt-1.5 block text-app-muted">
            What would appear: a year level, a subject, a first score and a
            latest score — for example “Year 12 · Physics · 58% → 74%”. What
            would never appear: a name, a student ID, a school, a tutor, or the
            name of any course or assessment. Un-tick this at any time and the
            figures come off the page immediately.
          </span>
        </span>
      </label>

      <div className="mt-3 flex items-center gap-3">
        {pending && (
          <p className="text-[0.85rem] font-light text-app-muted">Saving…</p>
        )}
        {saved && !pending && (
          <p role="status" className="text-[0.85rem] font-light text-app-good">
            Saved.
          </p>
        )}
        {error && (
          <p role="alert" className="text-[0.85rem] font-light text-app-bad">
            {error}
          </p>
        )}
      </div>
    </Panel>
  )
}
