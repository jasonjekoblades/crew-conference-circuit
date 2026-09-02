import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { verifyInviteCodeRequest, getMemberCap, getPilotFullMessage } from "@/lib/enter";

/**
 * Step 1 of /enter: validate the code and hand back what the client needs
 * to render the "I'm new" / "I've been here before" choice — no session
 * required or created yet, so a wrong guess never creates a throwaway
 * anonymous auth user.
 *
 * This used to also return the full members list so a returning member
 * could tap their name from a visible roster. That's fine among a
 * handful of personally-invited people, but becomes a browsable directory
 * anyone can pick a name from before proving they're that person once the
 * invite reaches a wider group. The roster is gone from this response
 * entirely — returning members now type their name and it's matched
 * server-side in /api/enter/relink, which never confirms or denies a name
 * exists until it actually matches.
 */
export async function POST(request: NextRequest) {
  let body: { code?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid request." }, { status: 400 });
  }

  const code = typeof body.code === "string" ? body.code : "";
  if (!code) {
    return NextResponse.json({ ok: false, message: "Enter the invite code." }, { status: 400 });
  }

  const verification = await verifyInviteCodeRequest(request, code);
  if (!verification.ok) {
    return NextResponse.json({ ok: false, message: verification.message }, { status: verification.status });
  }

  const admin = createAdminSupabaseClient();
  const [{ count: memberCount }, cap, pilotFullMessage] = await Promise.all([
    admin.from("members").select("id", { count: "exact", head: true }),
    getMemberCap(),
    getPilotFullMessage(),
  ]);

  const atCapacity = (memberCount ?? 0) >= cap;

  return NextResponse.json({
    ok: true,
    atCapacity,
    pilotFullMessage: atCapacity ? pilotFullMessage : undefined,
  });
}
