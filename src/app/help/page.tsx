import type { Metadata } from "next";
import Link from "next/link";
import { config } from "@/server/config";

export const metadata: Metadata = { title: "How borrowing works · PTA Equipment" };

/** Public: people read it before they have an account. */
export default function HelpPage() {
  return (
    <article className="guide mx-auto max-w-2xl">
      <h1 className="h1 mb-3">How borrowing works</h1>
      <p>
        The Miraloma PTA owns tables, chairs, coolers, the popcorn machine and more. Anyone the PTA approves can borrow them for school events, signup
        parties and classroom celebrations.
      </p>

      <h2>Borrowing something</h2>
      <ol>
        <li>
          <strong>Sign in with your email.</strong> We send a link; there&apos;s no password. The first time, tell us who you are and the PTA approves
          your email, usually within a day.
        </li>
        <li>
          <strong>Find what you need.</strong> Search the catalog, filter by tag, or tap <strong>Free on…</strong> to see only what&apos;s free for your
          dates. The <Link href="/calendar">calendar</Link> shows who has what, and when.
        </li>
        <li>
          <strong>Add items to your request</strong>, then open <strong>Request</strong> at the top. Name the event, choose the pickup and return days,
          and send it. You can&apos;t ask for more than is free on every one of those days.
        </li>
        <li>
          <strong>Wait for one email.</strong> Each item&apos;s owner approves their part, sometimes fewer than you asked for. Once everything is
          decided you get one email with where to pick up each item and how.
        </li>
        <li>
          <strong>Pick up.</strong> Open your request on your phone and tap <strong>Picked up</strong>. Check everything listed under “In the box” is
          there.
        </li>
        <li>
          <strong>Return.</strong> Put things back as the return instructions say, then tap <strong>Returned</strong>. Say whether everything is OK,
          tick off the parts that came back, and leave a note for the next person. If something is broken or missing, say so and add a photo: the owner
          is told straight away, and it isn&apos;t held against you.
        </li>
      </ol>
      <h2>Good to know</h2>
      <ul>
        <li>Bookings are by whole day. Items are yours from the morning of pickup day to the end of return day.</li>
        <li>To change dates or items, cancel the request (or one item on it) and send a new one.</li>
        <li>Other people&apos;s pending requests show on the calendar too. The owner decides who gets what when two requests overlap.</li>
        <li>Everyone signed in sees the calendar and past condition notes, with borrowers shown by first name and last initial. Only owners and admins see your email and phone.</li>
      </ul>

      <h2>If you own items</h2>
      <ul>
        <li>
          You get an email for each request that includes your items. Open it to approve or decline each one. You can approve fewer than asked, and the
          page warns you if approving would overbook a day.
        </li>
        <li>
          The <strong>Review</strong> tab lists what&apos;s waiting for you, what&apos;s out or overdue, and problems to clear.
        </li>
        <li>You can cancel an approved booking before pickup, with a note to the borrower, and mark items returned for a borrower who forgot.</li>
        <li>
          When something comes back with a problem, the item shows <strong>Problem reported</strong> until you clear it with a note. Lower its quantity
          if something broke; set it to 0 to stop lending it for a while.
        </li>
        <li>You can edit your items: photo, description, tags, count and what&apos;s in the box.</li>
      </ul>

      <h2>Questions</h2>
      <p>
        Email <a href={`mailto:${config.contactEmail}`}>{config.contactEmail}</a>.
      </p>
    </article>
  );
}
