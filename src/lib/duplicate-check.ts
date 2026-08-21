// CLAUDE.md §9: "Duplicate check first, always." Fuzzy-matches a typed
// conference name against every existing series' name AND its aliases,
// surfacing every plausible candidate rather than silently picking the
// closest one — Momentum AI Finance/New York and Skift Global/Meetings
// Forum are near-identical by name and must both show up so the member
// (not the algorithm) resolves it, per §9's "never silently resolve on
// name." Runs entirely client-side over the already-fetched series list —
// there are only ~15-50 of them, so no API call is needed to do this first.

export type SeriesForMatching = {
  id: string;
  name: string;
  slug: string;
  aliases: string[];
};

export type MatchCandidate = {
  series: SeriesForMatching;
  score: number;
  matchedOn: string; // which string (name or an alias) produced the score
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Excluded only from the token-overlap comparison (not from the exact/
// substring check above) — otherwise two unrelated conferences that both
// happen to be called "___ Conference" or "___ Forum" score as similar on
// that word alone. Real duplicates still share their distinctive word(s).
const GENERIC_WORDS = new Set(["the", "conference", "forum", "summit", "expo", "conf", "event", "annual"]);

function tokenSet(s: string): Set<string> {
  return new Set(normalize(s).split(" ").filter((t) => t && !GENERIC_WORDS.has(t)));
}

// Fraction of the SMALLER token set that's shared — robust to one string
// being a strict superset of the other's tokens ("Momentum AI" fully
// contained in "Momentum AI New York" scores 1.0, not diluted by length).
function scoreStrings(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.95;

  const ta = tokenSet(a);
  const tb = tokenSet(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.min(ta.size, tb.size);
}

const MATCH_THRESHOLD = 0.5;

export function findDuplicateCandidates(
  query: string,
  seriesList: SeriesForMatching[]
): MatchCandidate[] {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  const candidates: MatchCandidate[] = [];
  for (const series of seriesList) {
    let best = { score: scoreStrings(trimmed, series.name), matchedOn: series.name };
    for (const alias of series.aliases) {
      const s = scoreStrings(trimmed, alias);
      if (s > best.score) best = { score: s, matchedOn: alias };
    }
    if (best.score >= MATCH_THRESHOLD) {
      candidates.push({ series, score: best.score, matchedOn: best.matchedOn });
    }
  }

  return candidates.sort((a, b) => b.score - a.score).slice(0, 5);
}
