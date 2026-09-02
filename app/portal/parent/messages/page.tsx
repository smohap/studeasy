import { redirect } from 'next/navigation'

export const metadata = { title: 'Messages — StudEasy', robots: { index: false } }

/*
 * Messaging now lives at /portal/messages, shared by every role. This page
 * used to say the feature was not switched on — true then, not now. A stale
 * bookmark should land in the real inbox rather than on a page telling a
 * parent something that has stopped being true.
 *
 * No guardRole here: the destination does its own check, and the shared inbox
 * is not parent-only.
 */
export default function Page() {
  redirect('/portal/messages')
}
