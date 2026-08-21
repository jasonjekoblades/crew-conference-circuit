import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { requireMember } from "@/lib/require-member";
import { checkRateLimit } from "@/lib/rate-limit";

// CLAUDE.md §9 — every guardrail here is mandatory, not best-effort:
// server-side key only, valid session required, 10/member/24h + 40/global/
// day, aggressive caching, Haiku with max_tokens 400 and a 120-char input
// cap, reject non-conference-shaped input, log every call (cached or not),
// kill switch in app_settings.ai_enabled. Haiku 4.5 predates the dynamic-
// filtering web search tool (Opus 4.6+/Sonnet 4.6+ only), so this uses the
// basic `web_search_20250305` variant, not `_20260209`.

const MODEL = "claude-haiku-4-5-20251001";
const MAX_QUERY_LENGTH = 120;

const SYSTEM_PROMPT = `You verify factual details for a single industry conference the user names, using web search.

Rules:
- Weight the organizer's own official domain heavily. Treat aggregator/listing sites (10times, eventseye, general "top conferences" blogs, etc.) as corroboration only, never as your primary source.
- Find the most likely upcoming or current occurrence of the named conference.
- If you cannot confidently identify a specific real conference from the name, or the input does not look like a conference name at all, respond with exactly: {"found": false, "reason": "<short reason>"}
- Otherwise respond with ONLY a single JSON object and no other text, in exactly this shape:
{"found": true, "name": "...", "start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD", "city": "...", "country": "...", "website": "https://...", "confidence": "high"}
- Set "confidence" to "low" instead of "high" if sources disagree on dates or you are not fully certain.
- Never invent dates. If you cannot find real dates from a source, respond with the not-found shape instead of guessing.
- Respond with nothing but that single JSON object — no markdown fences, no commentary.`;

function normalizeQuery(q: string): string {
  return q.toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
}

function looksLikeConferenceName(q: string): boolean {
  if (q.length < 2 || q.length > MAX_QUERY_LENGTH) return false;
  if (/[\n\r]/.test(q)) return false;
  if (/ignore\s+(all\s+)?(previous|prior|above)/i.test(q)) return false;
  if (/system\s*prompt/i.test(q)) return false;
  if (/<\/?[a-z][\s\S]*>/i.test(q)) return false;
  const letters = (q.match(/[a-zA-Z]/g) ?? []).length;
  if (letters / q.length < 0.4) return false;
  return true;
}

type LookupResult = {
  found: boolean;
  name?: string;
  start_date?: string;
  end_date?: string;
  city?: string;
  country?: string;
  website?: string;
  confidence?: "high" | "low";
  reason?: string;
};

function extractJson(text: string): LookupResult | null {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = /\{[\s\S]*\}/.exec(trimmed);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

export async function POST(request: NextRequest) {
  const member = await requireMember(request);
  if (!member) {
    return NextResponse.json({ message: "Missing or invalid session." }, { status: 401 });
  }

  let body: { query?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid request." }, { status: 400 });
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!looksLikeConferenceName(query)) {
    return NextResponse.json({ message: "That doesn't look like a conference name." }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();

  const { data: aiEnabledRow } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "ai_enabled")
    .maybeSingle();
  if (aiEnabledRow?.value !== "true") {
    return NextResponse.json({ message: "AI lookup is currently turned off." }, { status: 403 });
  }

  const { limited: memberLimited } = await checkRateLimit(`ai-lookup:member:${member.id}`, 10, 1440);
  if (memberLimited) {
    return NextResponse.json({ message: "You've hit today's lookup limit (10/day)." }, { status: 429 });
  }
  const { limited: globalLimited } = await checkRateLimit("ai-lookup:global", 40, 1440);
  if (globalLimited) {
    return NextResponse.json({ message: "Today's lookup budget is used up. Try again tomorrow." }, { status: 429 });
  }

  const normalized = normalizeQuery(query);

  const { data: cached } = await admin
    .from("conference_cache")
    .select("result")
    .eq("normalized_query", normalized)
    .maybeSingle();

  if (cached) {
    await admin.from("ai_lookups").insert({ member_id: member.id, query, result: cached.result, cached: true });
    return NextResponse.json({ result: cached.result as LookupResult, cached: true });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ message: "AI lookup isn't configured." }, { status: 503 });
  }

  const anthropic = new Anthropic({ apiKey });

  let result: LookupResult;
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
      messages: [{ role: "user", content: query }],
    });

    const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text");
    const lastText = textBlocks[textBlocks.length - 1]?.text ?? "";
    const parsed = extractJson(lastText);
    result = parsed ?? { found: false, reason: "Couldn't parse a result." };
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json({ message: "Lookup failed — enter details manually." }, { status: 502 });
    }
    throw err;
  }

  await admin.from("conference_cache").upsert({ normalized_query: normalized, result }, { onConflict: "normalized_query" });
  await admin.from("ai_lookups").insert({ member_id: member.id, query, result, cached: false });

  return NextResponse.json({ result, cached: false });
}
