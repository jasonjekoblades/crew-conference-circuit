export const metadata = { title: "Terms — CREW Conference Circuit" };

export default function TermsPage() {
  return (
    <main className="min-h-dvh bg-paper px-4 py-10">
      <div className="mx-auto w-full max-w-lg space-y-6">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-ink">Terms of Use</h1>
          <p className="text-[11px] text-slate mt-1">Last updated: August 26, 2026</p>
        </div>

        <section className="space-y-1.5">
          <p className="label">What this is</p>
          <p className="text-sm text-ink-2 leading-relaxed">
            A proof of concept built by an individual CREW member to test an idea. It is
            not an official CREW product, is not affiliated with or endorsed by CREW, and
            comes with no guarantees of any kind.
          </p>
        </section>

        <section className="space-y-1.5">
          <p className="label">Conference information may be wrong</p>
          <p className="text-sm text-ink-2 leading-relaxed">
            Conference dates, locations, and venues come from members typing them in and
            from automated lookups. Neither is guaranteed accurate. Some entries are
            marked unverified, and even the verified ones may be out of date.
          </p>
          <p className="text-sm text-ink-2 leading-relaxed">
            <strong className="text-ink">
              Confirm details with the conference organizer before booking anything.
            </strong>{" "}
            Do not book flights, hotels, or anything else based solely on what this app
            says.
          </p>
        </section>

        <section className="space-y-1.5">
          <p className="label">Attendance information may be wrong too</p>
          <p className="text-sm text-ink-2 leading-relaxed">
            Members mark their own attendance and plans change. Someone showing as
            attending may not be there. Treat it as a starting point for a conversation,
            not a commitment.
          </p>
        </section>

        <section className="space-y-1.5">
          <p className="label">Identity is not verified</p>
          <p className="text-sm text-ink-2 leading-relaxed">
            There are no accounts and no identity checks. Names are self-entered. Anyone
            with the invite code can enter any name. Verify who you&rsquo;re actually
            meeting before relying on it.
          </p>
        </section>

        <section className="space-y-1.5">
          <p className="label">Use it reasonably</p>
          <p className="text-sm text-ink-2 leading-relaxed">
            Don&rsquo;t enter information about other people. Don&rsquo;t use anything here
            for marketing, recruiting, sales outreach, or any commercial purpose.
            Don&rsquo;t try to break it, overload it, or get at data you&rsquo;re not meant
            to see. Don&rsquo;t share the invite code outside the CREW community.
          </p>
        </section>

        <section className="space-y-1.5">
          <p className="label">No warranty</p>
          <p className="text-sm text-ink-2 leading-relaxed">
            This is provided as-is. It may break, lose data, or be shut down at any time
            without notice. I&rsquo;m not liable for anything that results from using it,
            including missed meetings, travel decisions, or anything else.
          </p>
        </section>

        <section className="space-y-1.5">
          <p className="label">This may end</p>
          <p className="text-sm text-ink-2 leading-relaxed">
            It&rsquo;s a pilot. I may shut it down or delete everything at any point, with
            or without notice.
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
