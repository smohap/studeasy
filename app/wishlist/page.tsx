import type { Metadata } from 'next'
import Link from 'next/link'
import { Heart } from 'lucide-react'
import { getShopHeader, listWishlist } from '@/lib/shop-data'
import ShopNav from '@/components/shop/ShopNav'
import CourseCard from '@/components/shop/CourseCard'
import WishlistButton from '@/components/shop/WishlistButton'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: 'Saved courses — StudEasy',
  // Personal to whoever is signed in, so there is nothing here to index.
  robots: { index: false },
}

export default async function WishlistPage() {
  const [header, saved] = await Promise.all([getShopHeader(), listWishlist()])

  return (
    <>
      <ShopNav {...header} />

      <main id="main" className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
        <h1 className="text-gradient display text-[clamp(2.4rem,8vw,5rem)]">Saved</h1>
        <p className="mt-5 max-w-xl text-[1.05rem] leading-relaxed font-light text-ink-dim">
          Courses you have put aside to decide on later. Nothing here is booked or paid
          for.
        </p>

        {!header.signedIn ? (
          <div className="mt-12 rounded-2xl border border-hairline bg-base-raised p-8">
            <Heart size={22} aria-hidden className="text-ink-dim" />
            <p className="mt-4 text-[1rem] font-light text-ink">
              Sign in to see what you have saved.
            </p>
            <Link
              href="/sign-in"
              className="mt-6 inline-block rounded-full bg-accent px-7 py-3 text-[0.9rem] font-medium text-[#100c00]"
            >
              Sign in
            </Link>
          </div>
        ) : saved.length === 0 ? (
          <div className="mt-12 rounded-2xl border border-hairline bg-base-raised p-8">
            <Heart size={22} aria-hidden className="text-ink-dim" />
            <p className="mt-4 text-[1rem] font-light text-ink">
              You have not saved anything yet.
            </p>
            <p className="mt-2 text-[0.92rem] leading-relaxed font-light text-ink-dim">
              Use <span className="text-ink">Save for later</span> on any course to keep it
              here while you decide.
            </p>
            <Link
              href="/courses"
              className="mt-6 inline-block rounded-full bg-accent px-7 py-3 text-[0.9rem] font-medium text-[#100c00]"
            >
              Browse courses
            </Link>
          </div>
        ) : (
          <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {saved.map((line) => (
              <li key={line.id} className="flex flex-col gap-3">
                <CourseCard course={line.course} signedIn={header.signedIn} />
                {/*
                  * Removing belongs on this page more than anywhere else — it
                  * is the one place someone is deliberately pruning the list.
                  */}
                <WishlistButton
                  courseId={line.course.id}
                  saved
                  signedIn={header.signedIn}
                  returnTo="/wishlist"
                  wide
                />
              </li>
            ))}
          </ul>
        )}
      </main>

      <Footer />
    </>
  )
}
