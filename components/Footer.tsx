import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="border-t border-hairline px-5 py-12 sm:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[1.05rem] font-extrabold tracking-tight uppercase">
            Stud<span className="text-accent">Easy</span>
          </p>
          <p className="mt-2 max-w-sm text-[0.92rem] leading-relaxed font-light text-ink-dim">
            Maths &amp; Science tutoring, face-to-face and online. NCEA and Cambridge,
            Years 9 to 13.
          </p>
        </div>

        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[0.9rem] font-light text-ink-dim">
            <li>
              <a href="#subjects" className="hover:text-ink">
                Subjects
              </a>
            </li>
            <li>
              <a href="#how-it-works" className="hover:text-ink">
                How it works
              </a>
            </li>
            <li>
              <a href="#results" className="hover:text-ink">
                Results
              </a>
            </li>
            <li>
              <Link href="/sign-in" className="hover:text-ink">
                Sign in
              </Link>
            </li>
            <li>
              <Link href="/register" className="hover:text-ink">
                Register
              </Link>
            </li>
          </ul>
        </nav>
      </div>

      <p className="mx-auto mt-10 max-w-6xl text-[0.82rem] font-light text-ink-dim">
        Terms · Privacy · © {new Date().getFullYear()} AIDO Technologies Ltd.
      </p>
    </footer>
  )
}
