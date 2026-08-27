/** Sitewide footer (Run 8) — privacy/terms need to be reachable from every
 * page, not just /enter, since people can land anywhere via a forwarded
 * link or bookmark. */
export function Footer() {
  return (
    <footer className="px-4 py-6 text-center text-[11px] text-slate">
      <a href="/privacy" className="underline">
        Privacy
      </a>
      <span className="mx-2">·</span>
      <a href="/terms" className="underline">
        Terms
      </a>
    </footer>
  );
}
