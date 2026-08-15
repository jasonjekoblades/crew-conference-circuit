export const metadata = { title: "Privacy — CREW Conference Circuit" };

export default function PrivacyPage() {
  return (
    <main className="min-h-dvh bg-paper px-4 py-10">
      <div className="mx-auto w-full max-w-lg space-y-4">
        <h1 className="font-heading text-2xl font-semibold text-ink">Privacy</h1>
        <p className="text-sm text-ink-2 leading-relaxed">
          This is a proof-of-concept tool built by a CREW member for a small pilot group,
          capped at 16 approved members. It is not built, operated, or endorsed by CREW.
        </p>
        <p className="text-sm text-ink-2 leading-relaxed">
          <strong className="text-ink">What&rsquo;s collected:</strong> the email address you
          sign in with, the profile details you enter (name, title, company, LinkedIn URL),
          which conferences you mark yourself as attending, any free-text notes you add to an
          attendance, and meetups you create, vote on, or RSVP to.
        </p>
        <p className="text-sm text-ink-2 leading-relaxed">
          <strong className="text-ink">Who sees it:</strong> which conferences you&rsquo;re
          attending is shown to other approved members according to the visibility setting you
          choose — either to everyone in the pilot, or only to members attending the same
          conference as you. Your attendee count on a conference is always accurate to everyone,
          even when the names behind it aren&rsquo;t. Meetups are visible only to attendees of
          that conference.
        </p>
        <p className="text-sm text-ink-2 leading-relaxed">
          <strong className="text-ink">What&rsquo;s never done:</strong> your data is never sold,
          used for advertising, or shared outside this pilot. There is no messaging feature —
          contact links (LinkedIn, email) only ever open in your own device&rsquo;s app.
        </p>
        <p className="text-sm text-ink-2 leading-relaxed">
          <strong className="text-ink">Deletion:</strong> you can request your account and all
          associated data be deleted at any time by contacting the organizer.
        </p>
      </div>
    </main>
  );
}
