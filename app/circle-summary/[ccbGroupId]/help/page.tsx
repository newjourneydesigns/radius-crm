import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

/**
 * Circle Leader Dashboard — Help & Guide.
 *
 * A self-contained, end-user-friendly walkthrough of every function in the
 * Circle Summary experience. Lives under the [ccbGroupId] layout so it's
 * session-protected, but renders its own hero because CircleChrome only shows
 * the tab bar for the five primary tabs (events/roster/inbox/resources/settings).
 */
export default function CircleSummaryHelpPage({
  params,
}: {
  params: { ccbGroupId: string };
}) {
  const groupId = params.ccbGroupId;
  const eventsHref = `/circle-summary/${groupId}/events`;

  return (
    <>
      <header className="cs-hero px-6 pt-8 pb-9 sm:pt-10 sm:pb-11">
        <div className="max-w-2xl mx-auto">
          <Link
            href={eventsHref}
            className="mb-7 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-2 text-xs font-semibold uppercase tracking-wide text-white backdrop-blur-sm transition-colors hover:bg-white/25 sm:mb-8"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="w-3.5 h-3.5" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </Link>
          <div className="flex items-center gap-4 min-w-0">
            <Image
              src="/Circles Logo V2-White.png"
              alt="Circles"
              width={80}
              height={79}
              priority
              className="h-16 sm:h-20 w-auto shrink-0"
            />
            <div className="min-w-0 flex-1">
              <h1 className="cs-display text-[clamp(1.75rem,8vw,3rem)] leading-tight">
                Help &amp; Guide
              </h1>
              <p className="mt-1.5 text-white/90 font-semibold text-base">
                Circle Leader Dashboard
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 pb-16 space-y-5">
        {/* Intro blurb */}
        <section className="cs-card">
          <p className="text-lg font-bold text-neutral-900 tracking-tight">
            Lead your Circle with clarity, confidence, and consistency.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-neutral-600">
            Your dashboard is the central place to stay connected, equipped, and
            organized throughout the semester. Whether you&apos;re submitting weekly
            attendance, updating your roster, or accessing leader resources,
            everything you need is in one simple experience designed to support you
            as you lead people into godly relationships.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-neutral-600">
            This guide walks through every part of the app, step by step. Use the
            quick links below to jump to what you need.
          </p>

          {/* Quick links */}
          <nav className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[
              { href: '#events', label: 'Events & Summaries' },
              { href: '#roster', label: 'Your Roster' },
              { href: '#inbox', label: 'Inbox' },
              { href: '#resources', label: 'Resources' },
              { href: '#settings', label: 'Notifications' },
              { href: '#tips', label: 'Tips' },
            ].map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="rounded-full border border-[color:var(--cs-border)] bg-white px-3 py-2 text-center text-xs font-semibold text-[color:var(--cs-green-darker)] transition-colors hover:border-[color:var(--cs-green)] hover:bg-[color:var(--cs-bg-soft)]"
              >
                {l.label}
              </a>
            ))}
          </nav>
        </section>

        {/* What you can do — overview */}
        <section className="cs-card">
          <SectionHeader title="What you can do" />
          <ul className="space-y-3">
            <OverviewItem title="Submit weekly Circle summaries">
              Report attendance, track engagement, and share what God is doing in
              your Circle — in under a minute.
            </OverviewItem>
            <OverviewItem title="Manage your roster">
              View your Circle members, text or email them with one tap, and keep
              track of birthdays and attendance history.
            </OverviewItem>
            <OverviewItem title="Stay connected">
              Receive important updates, reminders, and messages directly from your
              Circle team.
            </OverviewItem>
            <OverviewItem title="Access leader resources">
              Watch training videos and review leadership tools that keep you aligned
              with the vision, values, and culture of Valley Creek.
            </OverviewItem>
            <OverviewItem title="Get helpful reminders">
              Optional notifications for pending summaries, new inbox messages, and
              important next steps.
            </OverviewItem>
          </ul>
        </section>

        {/* ── Events & Summaries ───────────────────────────────── */}
        <section id="events" className="cs-card scroll-mt-4">
          <SectionHeader title="Events &amp; summaries" />
          <Why>
            Your weekly summary is how your Circle team knows your group is healthy
            and who showed up. It only takes a minute and it keeps everyone — and
            everyone&apos;s next step — on track.
          </Why>

          <SubHeading>Finding the event that needs a summary</SubHeading>
          <Steps>
            <Step n={1}>
              Open the <Tab>Events</Tab> tab. You&apos;ll see your meetings from the
              last 12 weeks, newest at the top.
            </Step>
            <Step n={2}>
              Each event shows a colored status: a{' '}
              <Pill className="cs-badge-warning">Pending</Pill> badge (amber) means a
              summary is still needed,{' '}
              <Pill className="cs-badge-success">Done</Pill> (green) means it&apos;s on
              file, and <Pill className="cs-badge-danger">Did Not Meet</Pill> (red)
              marks a week you didn&apos;t gather.
            </Step>
            <Step n={3}>
              Tap any event to open its summary form. A small number badge on the
              Events tab tells you how many summaries are still waiting.
            </Step>
          </Steps>

          <SubHeading>Filling out the summary</SubHeading>
          <Steps>
            <Step n={1}>
              <strong>Did your Circle meet?</strong> Leave the toggle on if you met.
              Turn it off if you didn&apos;t gather — then pick a reason (holiday,
              out of town, weather, low attendance, or other).
            </Step>
            <Step n={2}>
              <strong>Who came?</strong> Check the box next to everyone who attended.
              Use <strong>Select all</strong> to mark the whole roster at once. The
              clock badge next to a name shows when that person last attended.
            </Step>
            <Step n={3}>
              <strong>Add a guest or new person.</strong> Tap{' '}
              <em>&quot;+ Add someone to my Circle&quot;</em> and search by name. If
              they&apos;re not in our system yet, fill in their first name, last name,
              and cell phone, and we&apos;ll request they be added. First-time and
              one-time guests count — please add them too.
            </Step>
            <Step n={4}>
              <strong>Tell us more.</strong> Answer any questions your team has added
              (topic, prayer requests, notes). Required questions are marked with a
              red asterisk.
            </Step>
            <Step n={5}>
              <strong>Need to change your day, time, or location?</strong> Tap{' '}
              <em>&quot;Edit Details&quot;</em> and enter the new info. This sends a
              request to your Circle team — it doesn&apos;t change anything
              automatically.
            </Step>
            <Step n={6}>
              Tap <strong>Submit Circle Summary</strong> at the bottom. You&apos;ll
              see a confirmation, and the event will flip to{' '}
              <Pill className="cs-badge-success">Done</Pill>.
            </Step>
          </Steps>

          <Note>
            Your work saves as you go, so you can step away and come back without
            losing anything. You can reopen a submitted summary anytime to edit it —
            saving again simply updates your records. Summaries can only be submitted
            after the meeting&apos;s start time.
          </Note>
        </section>

        {/* ── Roster ───────────────────────────────────────────── */}
        <section id="roster" className="cs-card scroll-mt-4">
          <SectionHeader title="Your roster" />
          <Why>
            Your roster is your people. Keeping it current means accurate
            attendance, easy contact, and gentle nudges when someone starts slipping
            away — so no one falls through the cracks.
          </Why>

          <SubHeading>Reaching your people</SubHeading>
          <Steps>
            <Step n={1}>
              Open the <Tab>Roster</Tab> tab to see everyone in your Circle with
              their phone, email, and birthday.
            </Step>
            <Step n={2}>
              <strong>Tap a phone number</strong> to open a quick menu, then choose{' '}
              <strong>Call</strong> or <strong>Text</strong>. Tap an email to start a
              message in your mail app.
            </Step>
            <Step n={3}>
              The <strong>clock badge</strong> under each name shows when they last
              attended Circle.
            </Step>
          </Steps>

          <SubHeading>Birthday &amp; absence reminders</SubHeading>
          <Steps>
            <Step n={1}>
              A <strong>birthday reminder</strong> appears at the top when someone has
              a birthday in the next two weeks — a great prompt to reach out.
            </Step>
            <Step n={2}>
              An <strong>absence alert</strong> appears (in red) when someone
              hasn&apos;t attended in 15+ days, with one-tap Text and Call buttons so
              you can check in.
            </Step>
            <Step n={3}>
              Tap the <strong>×</strong> on any reminder to dismiss it. Birthday
              reminders return next year; absence alerts clear automatically once the
              person comes back.
            </Step>
          </Steps>

          <SubHeading>Adding &amp; removing people</SubHeading>
          <Steps>
            <Step n={1}>
              Tap <em>&quot;+ Add someone to my Circle&quot;</em> and search by name
              to add an existing person.
            </Step>
            <Step n={2}>
              Tap <strong>Edit roster</strong>, then the minus button next to a name
              to remove someone. Removing only takes them off this Circle — their
              profile isn&apos;t deleted, and you can add them back anytime.
            </Step>
            <Step n={3}>
              Tap <strong>Refresh</strong> to re-sync the latest contact info and
              birthdays from our church database.
            </Step>
          </Steps>
        </section>

        {/* ── Inbox ────────────────────────────────────────────── */}
        <section id="inbox" className="cs-card scroll-mt-4">
          <SectionHeader title="Inbox" />
          <Why>
            The inbox is how your Circle team sends you the important stuff —
            announcements, reminders, and next steps — all in one place so nothing
            gets lost in a group text.
          </Why>
          <Steps>
            <Step n={1}>
              Open the <Tab>Inbox</Tab> tab. A red number badge on the tab shows how
              many messages are unread.
            </Step>
            <Step n={2}>
              Use the <strong>Unread</strong> and <strong>Read</strong> toggles to
              switch between new messages and ones you&apos;ve already seen.
            </Step>
            <Step n={3}>
              Read a message, then tap <strong>Mark read</strong> to clear it. If a
              message gets updated, it&apos;ll show an{' '}
              <Pill className="cs-badge-warning">Updated</Pill> tag and return to your
              unread list.
            </Step>
          </Steps>
        </section>

        {/* ── Resources ────────────────────────────────────────── */}
        <section id="resources" className="cs-card scroll-mt-4">
          <SectionHeader title="Resources" />
          <Why>
            Leading well is a journey. The resources page keeps training videos and
            leadership tools at your fingertips so you stay aligned with the heart
            and culture of Valley Creek.
          </Why>
          <Steps>
            <Step n={1}>
              Open the <Tab>Resources</Tab> tab to see the latest tools, videos, and
              guides your team has posted.
            </Step>
            <Step n={2}>
              Tap any link or video to open it. Check back often — this page updates
              as new resources are shared.
            </Step>
          </Steps>
        </section>

        {/* ── Notifications & Settings ─────────────────────────── */}
        <section id="settings" className="cs-card scroll-mt-4">
          <SectionHeader title="Notifications &amp; settings" />
          <Why>
            Reminders help, but only if they fit how you actually use your phone.
            Settings lets you turn notifications on for this device and choose
            exactly what you hear about — nothing more.
          </Why>
          <Steps>
            <Step n={1}>
              Tap the <strong>gear icon</strong> in the top-right of any page to open{' '}
              <strong>Settings</strong>.
            </Step>
            <Step n={2}>
              Under <strong>This device</strong>, tap <strong>Enable push</strong>{' '}
              and allow notifications when prompted. On iPhone or iPad, first add the
              app to your Home Screen, then enable push from there.
            </Step>
            <Step n={3}>
              Choose what to be notified about:{' '}
              <strong>Inbox messages</strong>,{' '}
              <strong>Event summary reminders</strong>, and the app-icon{' '}
              <strong>Badge count</strong>. Toggle any of them on or off.
            </Step>
            <Step n={4}>
              Use <strong>Sign out</strong> at the bottom to log out of the Leader
              Hub on this device.
            </Step>
          </Steps>
          <Note>
            Notifications are opt-in per browser or installed app. If you use the app
            on more than one device, enable push on each one you want reminders on.
          </Note>
        </section>

        {/* ── Tips ─────────────────────────────────────────────── */}
        <section id="tips" className="cs-card scroll-mt-4">
          <SectionHeader title="Tips for the best experience" />
          <ul className="space-y-2.5 text-sm leading-relaxed text-neutral-700">
            <Bullet>
              <strong>Install the app.</strong> Add it to your Home Screen for a
              full-screen, app-like experience and reliable notifications.
            </Bullet>
            <Bullet>
              <strong>Submit right after Circle.</strong> Details are freshest, and
              you&apos;ll never have a pending summary hanging over you.
            </Bullet>
            <Bullet>
              <strong>Keep your roster current.</strong> Add guests as they come and
              remove people who&apos;ve moved on — it keeps your attendance accurate.
            </Bullet>
          </ul>
        </section>

        {/* Our heart */}
        <section className="cs-card cs-previous-notes">
          <div className="cs-previous-notes-label">Our heart</div>
          <p className="mt-3 text-sm leading-relaxed text-neutral-700">
            Circles are where people become known, loved, challenged, and
            transformed. This dashboard exists to support and strengthen leaders as
            you create spaces for people to encounter Jesus, experience community,
            and live on mission together.
          </p>
          <p className="mt-3 text-sm font-semibold text-[color:var(--cs-green-darker)]">
            Thank you for leading.
          </p>
        </section>

        <div className="pt-1">
          <Link href={eventsHref} className="cs-btn cs-btn-primary w-full">
            Back to my Circle
          </Link>
        </div>

        <p className="text-center text-xs text-neutral-400">
          Still have questions? Email us at{' '}
          <a href="mailto:nextsteps@valleycreek.org" className="cs-footer-link">
            nextsteps@valleycreek.org
          </a>
          .
        </p>
      </main>
    </>
  );
}

/* ── Small presentational helpers ──────────────────────────────── */

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <span className="h-6 w-1.5 shrink-0 rounded-full bg-[color:var(--cs-green)]" aria-hidden="true" />
      <h2
        className="text-xl font-extrabold italic uppercase leading-none text-neutral-900"
        dangerouslySetInnerHTML={{ __html: title }}
      />
    </div>
  );
}

function Why({ children }: { children: ReactNode }) {
  return (
    <p className="mb-4 rounded-lg border-l-4 border-[color:var(--cs-green)] bg-[color:var(--cs-bg-soft)] px-3 py-2.5 text-sm italic leading-relaxed text-neutral-600">
      {children}
    </p>
  );
}

function SubHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-2 mt-5 text-xs font-bold uppercase tracking-[0.1em] text-neutral-400 first:mt-0">
      {children}
    </h3>
  );
}

function Steps({ children }: { children: ReactNode }) {
  return <ol className="space-y-2.5">{children}</ol>;
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="cs-step-num shrink-0">{n}</span>
      <div className="pt-0.5 text-sm leading-relaxed text-neutral-700">{children}</div>
    </li>
  );
}

function OverviewItem({ title, children }: { title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[color:var(--cs-green)]" />
      <div>
        <p className="text-sm font-bold text-neutral-900">{title}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-neutral-600">{children}</p>
      </div>
    </li>
  );
}

function Bullet({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[color:var(--cs-green)]" />
      <span>{children}</span>
    </li>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 flex items-start gap-2 rounded-lg border border-[color:var(--cs-border)] bg-[color:var(--cs-bg-soft)] px-3 py-2.5 text-xs leading-relaxed text-neutral-600">
      <svg viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--cs-green)]" aria-hidden="true">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
      </svg>
      <span>{children}</span>
    </div>
  );
}

function Tab({ children }: { children: ReactNode }) {
  // Light tinted pill — the `.cs-root span` reset forces dark text via
  // !important, so a light background (not a solid green one) keeps it readable.
  return (
    <span className="inline-flex items-center rounded-full border border-[color:var(--cs-green)]/40 bg-[color:rgba(52,178,51,0.12)] px-2 py-0.5 text-xs font-bold">
      {children}
    </span>
  );
}

function Pill({ className, children }: { className: string; children: ReactNode }) {
  return <span className={`cs-badge ${className}`}>{children}</span>;
}
