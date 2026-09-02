import Link from 'next/link'
import { Star } from 'lucide-react'
import type { PublicTutor } from '@/lib/site-data'

/** Initials, so a tutor with no photo still gets an avatar rather than a gap. */
function initials(name: string | null): string {
  if (!name) return '·'
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')
}

export default function TutorCard({ tutor }: { tutor: PublicTutor }) {
  return (
    <Link
      href={`/tutors/${tutor.id}`}
      className="flex h-full flex-col rounded-2xl border border-hairline bg-base-raised p-6 transition-colors hover:border-ink/30"
    >
      <div className="flex items-center gap-4">
        {tutor.avatarUrl ? (
          // Supabase avatar URLs are arbitrary remote hosts, so this stays a
          // plain <img>: next/image would need every one of them allow-listed
          // in next.config.ts, and a missed host renders nothing at all.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={tutor.avatarUrl}
            alt=""
            width={52}
            height={52}
            className="h-13 w-13 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="grid h-13 w-13 shrink-0 place-items-center rounded-full border border-hairline text-[0.95rem] font-medium text-ink-dim"
          >
            {initials(tutor.fullName)}
          </span>
        )}

        <div className="min-w-0">
          <h3 className="truncate text-[1.05rem] font-semibold tracking-tight text-ink">
            {tutor.fullName ?? 'StudEasy tutor'}
          </h3>
          {tutor.rating === null ? (
            <p className="mt-0.5 text-[0.82rem] font-light text-ink-dim">
              Not rated yet
            </p>
          ) : (
            <p className="mt-0.5 flex items-center gap-1.5 text-[0.82rem] font-light text-ink-dim">
              <Star size={12} className="fill-accent text-accent" aria-hidden />
              {tutor.rating.toFixed(1)}
              <span className="sr-only">out of 5, from</span>
              <span aria-hidden>·</span>
              {tutor.ratingCount} {tutor.ratingCount === 1 ? 'review' : 'reviews'}
            </p>
          )}
        </div>
      </div>

      {tutor.headline && (
        <p className="mt-4 line-clamp-2 text-[0.92rem] leading-relaxed font-light text-ink-dim">
          {tutor.headline}
        </p>
      )}

      {tutor.subjects.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {tutor.subjects.slice(0, 4).map((s) => (
            <li
              key={s}
              className="rounded-full border border-hairline px-2.5 py-1 text-[0.76rem] font-light text-ink-dim"
            >
              {s}
            </li>
          ))}
          {tutor.subjects.length > 4 && (
            <li className="px-1 py-1 text-[0.76rem] font-light text-ink-dim">
              +{tutor.subjects.length - 4} more
            </li>
          )}
        </ul>
      )}

      <p className="mt-auto pt-5 text-[0.84rem] font-light text-ink-dim">
        {tutor.courseCount} published{' '}
        {tutor.courseCount === 1 ? 'course' : 'courses'}
        {tutor.yearsExperience !== null &&
          ` · ${tutor.yearsExperience} ${
            tutor.yearsExperience === 1 ? 'year' : 'years'
          } teaching`}
      </p>
    </Link>
  )
}
