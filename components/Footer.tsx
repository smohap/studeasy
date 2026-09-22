import Link from 'next/link'

/**
 * The site map. Every entry is a real route — the previous version pointed at
 * `#subjects` and `#results`, fragments that exist only on the home page, so
 * from anywhere else the footer scrolled you nowhere.
 */
const COLUMNS: { heading: string; links: { label: string; href: string }[] }[] = [
  {
    heading: 'Learn',
    links: [
      { label: 'Subjects', href: '/subjects' },
      { label: 'Courses', href: '/courses' },
      { label: 'Live classes', href: '/classes' },
      { label: 'Library', href: '/library' },
      { label: 'Forum', href: '/forum' },
    ],
  },
  {
    heading: 'StudEasy',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Our tutors', href: '/tutors' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'Success stories', href: '/success-stories' },
      { label: 'How it works', href: '/#how-it-works' },
    ],
  },
  {
    heading: 'Help',
    links: [
      { label: 'FAQ', href: '/faq' },
      { label: 'Contact us', href: '/contact' },
      { label: 'Free resources', href: '/resources' },
      { label: 'Blog', href: '/blog' },
      { label: 'Verify a certificate', href: '/verify' },
    ],
  },
  {
    heading: 'Account',
    links: [
      { label: 'Sign in', href: '/sign-in' },
      { label: 'Register', href: '/register' },
      { label: 'Teach with us', href: '/register' },
      { label: 'Forgot password', href: '/forgot-password' },
    ],
  },
]

export default function Footer() {
  return (
    <footer className="border-t border-hairline px-5 py-14 sm:px-8">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,1.3fr)_repeat(4,minmax(0,1fr))]">
        <div>
          <p className="text-[1.05rem] font-extrabold tracking-tight uppercase">
            Stud<span className="text-accent">Easy</span>
          </p>
          <p className="mt-3 max-w-sm text-[0.92rem] leading-relaxed font-light text-ink-dim">
            Maths &amp; Science tutoring, face-to-face and online. NCEA and
            Cambridge, Years 9 to 13.
          </p>
        </div>

        {COLUMNS.map((col) => (
          <nav key={col.heading} aria-label={col.heading}>
            <h2 className="text-[0.72rem] font-medium tracking-[0.16em] text-ink uppercase">
              {col.heading}
            </h2>
            <ul className="mt-4 flex flex-col gap-2.5">
              {col.links.map((l) => (
                <li key={`${col.heading}-${l.label}`}>
                  <Link
                    href={l.href}
                    className="text-[0.9rem] font-light text-ink-dim transition-colors hover:text-ink"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <p className="mx-auto mt-12 max-w-6xl border-t border-hairline pt-6 text-[0.82rem] font-light text-ink-dim">
        © {new Date().getFullYear()} AIDO Technologies Ltd. StudEasy is a
        registered trading name. Prices in New Zealand dollars, GST inclusive.
      </p>
    </footer>
  )
}
