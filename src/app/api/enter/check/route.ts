import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { verifyInviteCodeRequest, getMemberCap } from "@/lib/enter";

/**
 * Step 1 of /enter: validate the code and hand back what the client needs
 * to render the "I'm new" / "I've been here before" choice — no session
 * required or created yet, so a wrong guess never creates a throwaway
 * anonymous auth user.
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
  const [{ count: memberCount }, cap, { data: members }] = await Promise.all([
    admin.from("members").select("id", { count: "exact", head: true }),
    getMemberCap(),
    admin.from("members").select("id, name").not("name", "is", null).order("name"),
  ]);

  return NextResponse.json({
    ok: true,
    atCapacity: (memberCount ?? 0) >= cap,
    members: members ?? [],
  });
}
