export const metadata = { title: "Privacy — CREW Conference Circuit" };

export default function PrivacyPage() {
  return (
    <main className="min-h-dvh bg-paper px-4 py-10">
      <div className="mx-auto w-full max-w-lg space-y-6">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-ink">Privacy Policy</h1>
          <p className="text-[11px] text-slate mt-1">Last updated: August 26, 2026</p>
        </div>

        <p className="text-sm text-ink-2 leading-relaxed">
          This is a proof of concept built by Jason Blades, a CREW member. It is not an
          official CREW product and is not affiliated with, endorsed by, or operated by
          CREW.
        </p>

        <section className="space-y-1.5">
          <p className="label">What this collects</p>
          <p className="text-sm text-ink-2 leading-relaxed">Only what you type in:</p>
          <ul className="list-disc pl-5 text-sm text-ink-2 leading-relaxed space-y-1">
            <li>The name you enter</li>
            <li>The conferences you mark yourself as attending</li>
            <li>Any note you add to a conference</li>
            <li>
              If you use the &ldquo;look it up&rdquo; AI search when adding a conference,
              the conference name you searched for — kept linked to your account so I can
              keep the pilot&rsquo;s shared daily search budget in check
            </li>
          </ul>
        </section>

        <section className="space-y-1.5">
          <p className="label">What this does not collect</p>
          <p className="text-sm text-ink-2 leading-relaxed">
            No email address. No password. No account. No access to your calendar,
            contacts, or any other service. No payment information. No analytics or
            tracking of any kind. Nothing is imported from your CREW profile or anywhere
            else — every piece of information here was typed in by the person it
            describes.
          </p>
        </section>

        <section className="space-y-1.5">
          <p className="label">Who can see your information</p>
          <p className="text-sm text-ink-2 leading-relaxed">
            Everyone with the invite code. Any member can see your name, the conferences
            you&rsquo;ve marked, and your notes. There are no privacy settings, and this is
            deliberate — the app exists so members can find each other.
          </p>
          <p className="text-sm text-ink-2 leading-relaxed">
            <strong className="text-ink">If you don&rsquo;t want a conference known, don&rsquo;t add it.</strong>{" "}
            That&rsquo;s the privacy control.
          </p>
        </section>

        <section className="space-y-1.5">
          <p className="label">How you&rsquo;re identified</p>
          <p className="text-sm text-ink-2 leading-relaxed">
            There are no accounts. Entering the invite code creates an anonymous session
            stored in your browser. It contains no personal information and isn&rsquo;t
            linked to an email address or identity anywhere. If you clear your browser,
            you re-enter the code and type your name to pick up where you left off.
          </p>
        </section>

        <section className="space-y-1.5">
          <p className="label">Where the data lives</p>
          <p className="text-sm text-ink-2 leading-relaxed">
            Supabase (database, hosted in the United States) and Vercel (web hosting).
            Both may keep standard server logs, which can include IP addresses, as any
            website does.
          </p>
          <p className="text-sm text-ink-2 leading-relaxed">
            On top of that, this app keeps its own security log: every time the invite
            code is entered — whether it works or not — the IP address and whether it
            succeeded are recorded, kept permanently, so I can tell if the code has
            leaked. Short-lived records used only to prevent abuse (too many attempts in a
            short window) also briefly note an IP address, but those are cleared
            automatically after a day.
          </p>
        </section>

        <section className="space-y-1.5">
          <p className="label">AI conference lookup</p>
          <p className="text-sm text-ink-2 leading-relaxed">
            When you add a conference not already listed, you can ask the app to look up
            its dates and location. That sends the conference name you typed to
            Anthropic&rsquo;s API, which searches the web for it. No information about you
            is included in that request — just the conference name. You can always type
            the details in manually instead.
          </p>
          <p className="text-sm text-ink-2 leading-relaxed">
            The app separately keeps a record, in its own database, of what you searched
            for and what came back, linked to your account — this is only so I can
            monitor usage against the pilot&rsquo;s shared daily budget, and it&rsquo;s
            deleted if you delete your account.
          </p>
        </section>

        <section className="space-y-1.5">
          <p className="label">Deleting your information</p>
          <p className="text-sm text-ink-2 leading-relaxed">
            Go to the profile page and choose delete. This removes your name, your
            conferences, your notes, any AI lookups tied to your account, and your
            session. It&rsquo;s immediate and permanent.
          </p>
          <p className="text-sm text-ink-2 leading-relaxed">
            You can also ask me directly through the CREW community and I&rsquo;ll remove
            it for you.
          </p>
        </section>

        <section className="space-y-1.5">
          <p className="label">How long this lasts</p>
          <p className="text-sm text-ink-2 leading-relaxed">
            This is a short-term pilot. When it ends, the whole thing gets shut down and
            the database deleted. If it becomes something more permanent, this policy will
            be replaced and members will be told before that happens.
          </p>
        </section>

        <section className="space-y-1.5">
          <p className="label">Changes</p>
          <p className="text-sm text-ink-2 leading-relaxed">
            If this policy changes materially, the date above changes and I&rsquo;ll post
            about it in the CREW community.
          </p>
        </section>

        <section className="space-y-1.5">
          <p className="label">Contact</p>
          <p className="text-sm text-ink-2 leading-relaxed">Jason Blades, via the CREW community.</p>
        </section>
      </div>
    </main>
  );
}
