import type { Metadata, Viewport } from 'next'
import { Kanit } from 'next/font/google'
import './globals.css'

const kanit = Kanit({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800', '900'],
  display: 'swap',
  variable: '--font-kanit',
})

export const metadata: Metadata = {
  title: 'StudEasy — Maths & Science Tutoring',
  description:
    'NCEA and Cambridge Mathematics and Science tutoring. Real tutors paired with an AI Learning Twin — homework marked overnight, revision plans built around actual gaps, reports parents can read.',
  icons: { icon: '/img/favicon.svg' },
}

export const viewport: Viewport = {
  themeColor: '#0C0C0C',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-NZ" className={kanit.variable}>
      <body>{children}</body>
    </html>
  )
}
