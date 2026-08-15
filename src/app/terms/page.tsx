export const metadata = { title: "Terms — CREW Conference Circuit" };

export default function TermsPage() {
  return (
    <main className="min-h-dvh bg-paper px-4 py-10">
      <div className="mx-auto w-full max-w-lg space-y-4">
        <h1 className="font-heading text-2xl font-semibold text-ink">Terms</h1>
        <p className="text-sm text-ink-2 leading-relaxed">
          This is a proof-of-concept tool, run by an individual CREW member for a small
          invite-only pilot. It is not an official CREW product, and CREW is not responsible for
          it or the data in it.
        </p>
        <p className="text-sm text-ink-2 leading-relaxed">
          Access is invite-only and capped. The organizer can approve, reject, or remove access
          at their discretion, and may take the pilot down at any time without notice.
        </p>
        <p className="text-sm text-ink-2 leading-relaxed">
          Use this to coordinate your own conference plans in good faith. Don&rsquo;t post
          anything here you wouldn&rsquo;t want another pilot member to see under your chosen
          visibility setting. Enter conference dates and details in good faith — other
          members may make travel decisions based on what you enter.
        </p>
        <p className="text-sm text-ink-2 leading-relaxed">
          Provided as-is, with no uptime or accuracy guarantee. See{" "}
          <a href="/privacy" className="underline">
            /privacy
          </a>{" "}
          for how your data is used.
        </p>
      </div>
    </main>
  );
}
